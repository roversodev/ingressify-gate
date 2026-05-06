import { query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

const USER_BATCH = 80;

/** Busca usuários por userId em lotes (evita N× round-trips sequenciais). */
async function loadUsersByIds(
  ctx: QueryCtx,
  userIds: string[],
): Promise<Map<string, Doc<"users"> | null>> {
  const unique = [...new Set(userIds)];
  const map = new Map<string, Doc<"users"> | null>();
  for (let i = 0; i < unique.length; i += USER_BATCH) {
    const slice = unique.slice(i, i + USER_BATCH);
    const rows = await Promise.all(
      slice.map((uid) =>
        ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", uid))
          .first(),
      ),
    );
    slice.forEach((uid, j) => map.set(uid, rows[j] ?? null));
  }
  return map;
}

function computeAvailabilityFromState(
  ticketTypes: Doc<"ticketTypes">[],
  tickets: Doc<"tickets">[],
) {
  const validatedTickets = tickets
    .filter((t) => t.status === "used")
    .reduce((sum, ticket) => sum + ticket.quantity, 0);

  const purchasedTickets = tickets
    .filter((t) => t.status === "valid" || t.status === "used")
    .reduce((sum, ticket) => sum + ticket.quantity, 0);

  /** Quantidade vendida/arquivada com valor pago (> R$ 0) — cortesias e gratuitos ficam de fora (ticket médio). */
  const purchasedTicketsPaidValue = tickets
    .filter(
      (t) =>
        (t.status === "valid" || t.status === "used") &&
        Math.round((t.totalAmount ?? 0) * 100) > 0,
    )
    .reduce((sum, ticket) => sum + ticket.quantity, 0);

  const totalAvailable = ticketTypes.reduce((sum, type) => sum + type.availableQuantity, 0);
  const totalCapacity = ticketTypes.reduce((sum, type) => sum + type.totalQuantity, 0);
  const totalTickets = ticketTypes.reduce((sum, type) => sum + type.totalQuantity, 0);

  const paidTicketTypes = ticketTypes.filter((type) => !type.isCourtesy && type.currentPrice > 0);
  const lowestPrice =
    paidTicketTypes.length > 0
      ? Math.min(...paidTicketTypes.map((type) => type.currentPrice))
      : 0;

  return {
    isSoldOut: totalAvailable === 0,
    totalAvailable,
    totalCapacity,
    totalTickets,
    lowestPrice,
    validatedTickets,
    purchasedTickets,
    purchasedTicketsPaidValue,
    ticketTypes: ticketTypes.map((type) => ({
      id: type._id,
      name: type.name,
      price: type.currentPrice,
      available: type.availableQuantity,
      total: type.totalQuantity,
    })),
  };
}

function computeDemographics(
  tickets: Doc<"tickets">[],
  userMap: Map<string, Doc<"users"> | null>,
) {
  const stats = {
    genderStats: {
      male: 0,
      female: 0,
      other: 0,
      prefer_not_to_say: 0,
      not_informed: 0,
    },
    ageStats: {
      under18: 0,
      age18to24: 0,
      age25to34: 0,
      age35to44: 0,
      age45to54: 0,
      age55plus: 0,
      not_informed: 0,
    },
    uniqueBuyers: 0,
    buyersWithCompleteProfile: 0,
  };

  const uniqueBuyerIds = new Set<string>();
  const buyersWithCompleteProfileIds = new Set<string>();

  for (const ticket of tickets) {
    const user = userMap.get(ticket.userId) ?? null;
    if (!user) continue;

    uniqueBuyerIds.add(user.userId);
    if (user.profileComplete) {
      buyersWithCompleteProfileIds.add(user.userId);
    }

    if (user.gender) {
      if (
        user.gender === "male" ||
        user.gender === "female" ||
        user.gender === "other" ||
        user.gender === "prefer_not_to_say"
      ) {
        (stats.genderStats as Record<string, number>)[user.gender]++;
      } else {
        stats.genderStats.not_informed++;
      }
    } else {
      stats.genderStats.not_informed++;
    }

    if (user.birthDate) {
      const birthDate = new Date(user.birthDate);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      const dayDiff = today.getDate() - birthDate.getDate();
      const adjustedAge =
        monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

      if (adjustedAge < 18) stats.ageStats.under18++;
      else if (adjustedAge <= 24) stats.ageStats.age18to24++;
      else if (adjustedAge <= 34) stats.ageStats.age25to34++;
      else if (adjustedAge <= 44) stats.ageStats.age35to44++;
      else if (adjustedAge <= 54) stats.ageStats.age45to54++;
      else stats.ageStats.age55plus++;
    } else {
      stats.ageStats.not_informed++;
    }
  }

  stats.uniqueBuyers = uniqueBuyerIds.size;
  stats.buyersWithCompleteProfile = buyersWithCompleteProfileIds.size;
  return stats;
}

function computeTicketHolders(
  tickets: Doc<"tickets">[],
  userMap: Map<string, Doc<"users"> | null>,
  limit: number,
) {
  const holderMap = new Map<
    string,
    { userId: string; tickets: unknown[]; totalTickets: number; totalValue: number }
  >();

  for (const ticket of tickets) {
    const key = ticket.userId;
    if (!holderMap.has(key)) {
      holderMap.set(key, {
        userId: ticket.userId,
        tickets: [],
        totalTickets: 0,
        totalValue: 0,
      });
    }
    const holder = holderMap.get(key)!;
    holder.totalTickets += ticket.quantity;
    holder.totalValue += ticket.totalAmount;
  }

  const holders = Array.from(holderMap.values())
    .map((holder) => {
      const user = userMap.get(holder.userId);
      return {
        ...holder,
        userName: user?.name || "Nome não disponível",
        userEmail: user?.email || "Email não disponível",
      };
    })
    .sort((a, b) => b.totalTickets - a.totalTickets)
    .slice(0, limit);

  return {
    holders,
    totalHolders: holderMap.size,
    totalTickets: Array.from(holderMap.values()).reduce((s, h) => s + h.totalTickets, 0),
    totalValue: Array.from(holderMap.values()).reduce((s, h) => s + h.totalValue, 0),
  };
}

/**
 * Uma única leitura de ingressos do evento para disponibilidade, demografia,
 * proprietários e transferências — evita 4× scans + demographics N+1.
 */
export const getDashboardTicketBundle = query({
  args: {
    eventId: v.id("events"),
    holdersLimit: v.optional(v.number()),
  },
  handler: async (ctx, { eventId, holdersLimit = 10 }) => {
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Evento não encontrado");

    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event_active", (q) =>
        q.eq("eventId", eventId).eq("isActive", true),
      )
      .collect();

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const availability = computeAvailabilityFromState(ticketTypes, tickets);

    const activeTickets = tickets.filter(
      (t) => t.status === "valid" || t.status === "used",
    );

    const userIdsNeeded = [...new Set(activeTickets.map((t) => t.userId))];
    const userMap = await loadUsersByIds(ctx, userIdsNeeded);

    const demographicStats = computeDemographics(activeTickets, userMap);

    const ticketHolders = computeTicketHolders(
      activeTickets,
      userMap,
      holdersLimit,
    );

    const ticketIdStrSet = new Set(tickets.map((t) => t._id as string));

    const pendingAll = await ctx.db
      .query("transferRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const eventPendingTransfers = pendingAll.filter((req) =>
      ticketIdStrSet.has(req.ticketId as string),
    );

    const eventTransferHistoryDocs = await ctx.db
      .query("transferHistory")
      .withIndex("by_event_transferred_at", (q) => q.eq("eventId", eventId))
      .collect();

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentTransfers = eventTransferHistoryDocs.filter(
      (t) => t.transferredAt >= thirtyDaysAgo,
    ).length;

    const transferStats = {
      totalTransfers: eventTransferHistoryDocs.length,
      pendingTransfers: eventPendingTransfers.length,
      recentTransfers,
      transferRate:
        tickets.length > 0 ? (eventTransferHistoryDocs.length / tickets.length) * 100 : 0,
    };

    const transferParticipantIds = [
      ...eventPendingTransfers.map((r) => r.fromUserId),
      ...eventTransferHistoryDocs.flatMap((h) => [h.fromUserId, h.toUserId]),
    ];
    const missingTransferUsers = [...new Set(transferParticipantIds)].filter(
      (uid) => !userMap.has(uid),
    );
    if (missingTransferUsers.length > 0) {
      const more = await loadUsersByIds(ctx, missingTransferUsers);
      for (const [uid, doc] of more) userMap.set(uid, doc);
    }

    const ticketById = new Map<string, Doc<"tickets">>(
      tickets.map((t) => [String(t._id), t] as const),
    );

    const typeIdsNeeded = new Set<string>();
    for (const req of eventPendingTransfers) {
      const td = ticketById.get(String(req.ticketId));
      if (td) typeIdsNeeded.add(String(td.ticketTypeId));
    }
    for (const hist of eventTransferHistoryDocs) {
      const td = ticketById.get(String(hist.ticketId));
      if (td) typeIdsNeeded.add(String(td.ticketTypeId));
    }

    const typeDocsList = await Promise.all(
      [...typeIdsNeeded].map((id) => ctx.db.get(id as Id<"ticketTypes">)),
    );
    const typeNameById = new Map(
      typeDocsList
        .filter(Boolean)
        .map((tt) => [String(tt!._id), tt!.name]),
    );

    const pendingTransfersDetailed = eventPendingTransfers.map((transfer) => {
      const td = ticketById.get(String(transfer.ticketId));
      const typeLabel =
        td && td.ticketTypeId
          ? typeNameById.get(String(td.ticketTypeId)) ?? "Tipo desconhecido"
          : "Tipo desconhecido";
      const fromUserDoc = userMap.get(transfer.fromUserId);
      return {
        transferId: transfer._id,
        fromUserName: fromUserDoc?.name || "Usuário desconhecido",
        toUserEmail: transfer.toUserEmail,
        ticketType: typeLabel,
        createdAt: transfer._creationTime,
        expiresAt: transfer.expiresAt,
      };
    });

    const completedTransfersDetailed = [...eventTransferHistoryDocs]
      .sort((a, b) => b.transferredAt - a.transferredAt)
      .map((hist) => {
        const td = ticketById.get(String(hist.ticketId));
        const typeLabel =
          td && td.ticketTypeId
            ? typeNameById.get(String(td.ticketTypeId)) ?? "Tipo desconhecido"
            : "Tipo desconhecido";
        const fromUserDoc = userMap.get(hist.fromUserId);
        const toUserDoc = userMap.get(hist.toUserId);
        return {
          transferId: hist._id,
          fromUserName: fromUserDoc?.name || "Usuário desconhecido",
          toUserName: toUserDoc?.name || "Usuário desconhecido",
          ticketType: typeLabel,
          transferredAt: hist.transferredAt,
        };
      });

    return {
      availability,
      demographicStats,
      ticketHolders,
      transferStats,
      transferDetails: {
        pendingTransfers: pendingTransfersDetailed,
        completedTransfers: completedTransfersDetailed,
      },
    };
  },
});
