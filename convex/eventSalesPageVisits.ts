import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const BR_TZ = "America/Sao_Paulo";

function hourInBrasilia(visitedAt: number): number {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: BR_TZ,
    hour: "2-digit",
    hour12: false,
  }).format(new Date(visitedAt));
  return parseInt(hourStr, 10);
}

function isWeekendBrasilia(visitedAt: number): boolean {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: BR_TZ,
    weekday: "short",
  }).format(new Date(visitedAt));
  return wd === "Sat" || wd === "Sun";
}

function dateKeyBr(visitedAt: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(visitedAt));
}

/** Para um dia civil já representado em dateKey (YYYY-MM-DD), saber se é fim de semana no fuso BR. */
function isWeekendDateKeyBr(dateKey: string): boolean {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0]!;
  const mo = parts[1]!;
  const d = parts[2]!;
  const utcMs = Date.UTC(y, mo - 1, d, 15, 0, 0);
  return isWeekendBrasilia(utcMs);
}

/** Próximo dia civil em YYYY-MM-DD (âncora meio-dia UTC + 24h). */
function addOneCalendarDayYmd(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const t = Date.UTC(y, m - 1, d, 12, 0, 0);
  return dateKeyBr(t + 24 * 60 * 60 * 1000);
}

const HOURS = 24;

function normalizeHourCounts(raw: number[]): number[] {
  const next = Array.from({ length: HOURS }, (_, i) => raw[i] ?? 0);
  return next;
}

/** Incrementa agregado diário (rápido O(1) documentos/dia) — usado no registro e no backfill. */
async function bumpDayRollup(
  ctx: MutationCtx,
  eventId: Id<"events">,
  visitedAt: number,
) {
  const dateKey = dateKeyBr(visitedAt);
  const hour = hourInBrasilia(visitedAt);

  const existing = await ctx.db
    .query("eventSalesPageVisitDayRollups")
    .withIndex("by_event_date", (q) =>
      q.eq("eventId", eventId).eq("dateKey", dateKey),
    )
    .first();

  if (!existing) {
    const hourCounts = Array.from({ length: HOURS }, () => 0);
    hourCounts[hour] = 1;
    await ctx.db.insert("eventSalesPageVisitDayRollups", {
      eventId,
      dateKey,
      total: 1,
      hourCounts,
    });
    return;
  }

  const hourCounts = normalizeHourCounts(existing.hourCounts);
  hourCounts[hour] += 1;
  await ctx.db.patch(existing._id, {
    total: existing.total + 1,
    hourCounts,
  });
}

export const recordSalesPageVisit = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return;
    const visitedAt = Date.now();
    await ctx.db.insert("eventSalesPageVisits", {
      eventId,
      visitedAt,
    });
    await bumpDayRollup(ctx, eventId, visitedAt);
  },
});

export const getSalesPageVisitStats = query({
  args: {
    eventId: v.id("events"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, { eventId, days = 30 }) => {
    const safeDays = Math.min(Math.max(days, 1), 366);
    const now = Date.now();
    const since = now - safeDays * 24 * 60 * 60 * 1000;
    const startKey = dateKeyBr(since);
    const endKey = dateKeyBr(now);

    const rollups = await ctx.db
      .query("eventSalesPageVisitDayRollups")
      .withIndex("by_event_date", (q) =>
        q.eq("eventId", eventId).gte("dateKey", startKey).lte("dateKey", endKey),
      )
      .collect();

    let weekend = 0;
    let weekday = 0;
    let diurno = 0;
    let noturno = 0;
    const hourTotals = new Array(HOURS).fill(0);
    const byDay = new Map<string, number>();

    for (const row of rollups) {
      byDay.set(row.dateKey, row.total);
      if (isWeekendDateKeyBr(row.dateKey)) weekend += row.total;
      else weekday += row.total;

      const hc = normalizeHourCounts(row.hourCounts);
      for (let h = 0; h < HOURS; h++) {
        const c = hc[h]!;
        hourTotals[h] += c;
        if (h >= 6 && h < 18) diurno += c;
        else noturno += c;
      }
    }

    const total = rollups.reduce((s, r) => s + r.total, 0);

    const sortedKeys = [...byDay.keys()].sort();
    let dailySeries: { date: string; count: number }[];
    if (sortedKeys.length === 0) {
      dailySeries = [];
    } else {
      const firstDay = sortedKeys[0]!;
      dailySeries = [];
      let cursor = firstDay;
      let guard = 0;
      while (cursor <= endKey && guard < safeDays + 5) {
        dailySeries.push({ date: cursor, count: byDay.get(cursor) ?? 0 });
        cursor = addOneCalendarDayYmd(cursor);
        guard += 1;
      }
    }

    let peakWindowStart = 0;
    let peakWindowSum = -1;
    for (let hs = 0; hs <= 22; hs++) {
      const s = hourTotals[hs]! + hourTotals[hs + 1]!;
      if (s > peakWindowSum) {
        peakWindowSum = s;
        peakWindowStart = hs;
      }
    }
    const peakWindowLabel =
      peakWindowSum <= 0
        ? null
        : `${peakWindowStart}h–${peakWindowStart + 2}h`;

    return {
      total,
      weekend,
      weekday,
      diurno,
      noturno,
      days: safeDays,
      dailySeries,
      peakWindowLabel,
    };
  },
});

/** Reconstrói rollups a partir de `eventSalesPageVisits` em páginas (para migração de dados antigos). */
export const rebuildVisitRollupsFromRawChunk = internalMutation({
  args: {
    eventId: v.id("events"),
    cursor: v.optional(v.string()),
    clearRollups: v.boolean(),
  },
  handler: async (ctx, { eventId, cursor, clearRollups }) => {
    if (clearRollups && !cursor) {
      const existing = await ctx.db
        .query("eventSalesPageVisitDayRollups")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
      for (const r of existing) {
        await ctx.db.delete(r._id);
      }
    }

    const page = await ctx.db
      .query("eventSalesPageVisits")
      .withIndex("by_event_visitedAt", (q) => q.eq("eventId", eventId))
      .order("asc")
      .paginate({ numItems: 400, cursor: cursor ?? null });

    for (const visit of page.page) {
      await bumpDayRollup(ctx, eventId, visit.visitedAt);
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.eventSalesPageVisits.rebuildVisitRollupsFromRawChunk,
        {
          eventId,
          cursor: page.continueCursor,
          clearRollups: false,
        },
      );
    }

    return {
      processed: page.page.length,
      done: page.isDone,
    };
  },
});

/**
 * Dispara em background a reconstrução dos agregados diários a partir dos acessos brutos.
 * Útil uma vez após deploy, para preencher histórico antes dos rollups existirem.
 */
export const startRebuildSalesPageVisitRollups = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        success: false as const,
        errorType: "NOT_AUTHENTICATED" as const,
        message: "Não autenticado",
      };
    }

    const event = await ctx.db.get(eventId);
    if (!event || event.userId !== identity.subject) {
      return {
        success: false as const,
        errorType: "FORBIDDEN" as const,
        message: "Sem permissão para este evento",
      };
    }

    await ctx.scheduler.runAfter(
      0,
      internal.eventSalesPageVisits.rebuildVisitRollupsFromRawChunk,
      {
        eventId,
        cursor: undefined,
        clearRollups: true,
      },
    );

    return { success: true as const };
  },
});

/** Sem ping neste intervalo = não conta como ao vivo (≥ 2 intervalos de 30s). */
const LIVE_PRESENCE_MS = 75_000;

export const pingSalesPagePresence = mutation({
  args: {
    eventId: v.id("events"),
    clientId: v.string(),
  },
  handler: async (ctx, { eventId, clientId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return;
    const now = Date.now();
    const existing = await ctx.db
      .query("eventSalesPagePresence")
      .withIndex("by_event_client", (q) =>
        q.eq("eventId", eventId).eq("clientId", clientId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { lastPing: now });
    } else {
      await ctx.db.insert("eventSalesPagePresence", {
        eventId,
        clientId,
        lastPing: now,
      });
    }
  },
});

export const getSalesPageLiveViewerCount = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const cutoff = Date.now() - LIVE_PRESENCE_MS;
    const active = await ctx.db
      .query("eventSalesPagePresence")
      .withIndex("by_event_lastPing", (q) =>
        q.eq("eventId", eventId).gte("lastPing", cutoff),
      )
      .collect();
    return active.length;
  },
});
