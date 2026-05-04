import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

/** Próximo dia civil em YYYY-MM-DD (âncora meio-dia UTC + 24h, ok sem horário de verão no BR). */
function addOneCalendarDayYmd(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const t = Date.UTC(y, m - 1, d, 12, 0, 0);
  return dateKeyBr(t + 24 * 60 * 60 * 1000);
}

export const recordSalesPageVisit = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return;
    await ctx.db.insert("eventSalesPageVisits", {
      eventId,
      visitedAt: Date.now(),
    });
  },
});

export const getSalesPageVisitStats = query({
  args: {
    eventId: v.id("events"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, { eventId, days = 30 }) => {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const visits = await ctx.db
      .query("eventSalesPageVisits")
      .withIndex("by_event_visitedAt", (q) =>
        q.eq("eventId", eventId).gte("visitedAt", since),
      )
      .collect();

    let weekend = 0;
    let weekday = 0;
    let diurno = 0;
    let noturno = 0;
    const byDay = new Map<string, number>();
    const hourTotals = new Array(24).fill(0);

    for (const row of visits) {
      if (isWeekendBrasilia(row.visitedAt)) weekend += 1;
      else weekday += 1;
      const h = hourInBrasilia(row.visitedAt);
      if (h >= 6 && h < 18) diurno += 1;
      else noturno += 1;
      const dk = dateKeyBr(row.visitedAt);
      byDay.set(dk, (byDay.get(dk) ?? 0) + 1);
      hourTotals[h] += 1;
    }

    const todayKey = dateKeyBr(Date.now());
    const daysWithVisits = [...byDay.keys()].sort();
    let dailySeries: { date: string; count: number }[];
    if (daysWithVisits.length === 0) {
      dailySeries = [];
    } else {
      const firstDay = daysWithVisits[0]!;
      dailySeries = [];
      let cursor = firstDay;
      let guard = 0;
      while (cursor <= todayKey && guard < days + 5) {
        dailySeries.push({ date: cursor, count: byDay.get(cursor) ?? 0 });
        cursor = addOneCalendarDayYmd(cursor);
        guard += 1;
      }
    }

    let peakWindowStart = 0;
    let peakWindowSum = -1;
    for (let hs = 0; hs <= 22; hs++) {
      const s = hourTotals[hs] + hourTotals[hs + 1];
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
      total: visits.length,
      weekend,
      weekday,
      diurno,
      noturno,
      days,
      dailySeries,
      peakWindowLabel,
    };
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
