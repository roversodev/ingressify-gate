import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const createOrUpdateFromWebhook = mutation({
  args: {
    transactionId: v.string(),
    provider: v.union(v.literal("pagarme"), v.literal("mercadopago")),
    providerEventType: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", args.transactionId))
      .first();

    if (!tx) {
      console.log("Transação não encontrada para registrar disputa")
      throw new Error("Transação não encontrada para registrar disputa");
    }

    const event = await ctx.db.get(tx.eventId);
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.transactionId))
      .collect();

    const ticketsSnapshot = tickets.map((t) => ({
      ticketId: t._id as Id<"tickets">,
      ticketTypeId: t.ticketTypeId,
      quantity: t.quantity,
      unitPrice: t.unitPrice,
    }));

    // NOVO: tentar pegar um identificador de chargeback do payload do provedor
    const chargebackId =
      args.providerPayload?.order?.charges?.[0]?.last_transaction?.id ||
      args.providerPayload?.order?.charges?.[0]?.id ||
      args.providerPayload?.order?.id ||
      undefined;

    const existing = await ctx.db
      .query("disputes")
      .withIndex("by_transaction_provider", (q) =>
        q.eq("transactionId", args.transactionId).eq("provider", args.provider)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        providerEventType: args.providerEventType,
        providerData: args.providerPayload,
        tickets: existing.tickets?.length ? existing.tickets : ticketsSnapshot,
        amount: existing.amount || tx.amount,
        paymentMethod: existing.paymentMethod || tx.paymentMethod,
        userId: existing.userId || tx.userId,
        customerId: existing.customerId || tx.customerId,
        eventId: existing.eventId || tx.eventId,
        organizationId: existing.organizationId || event?.organizationId,
        providerChargebackId: existing.providerChargebackId || chargebackId,
      });
      return existing._id;
    }

    const disputeId = await ctx.db.insert("disputes", {
      transactionId: args.transactionId,
      provider: args.provider,
      status: "open",
      eventId: tx.eventId,
      organizationId: event?.organizationId,
      userId: tx.userId,
      customerId: tx.customerId,
      amount: tx.amount,
      paymentMethod: tx.paymentMethod,
      tickets: ticketsSnapshot,
      reason: undefined,
      providerEventType: args.providerEventType,
      providerChargebackId: chargebackId,
      providerData: args.providerPayload,
      openedAt: Date.now(),
      resolvedAt: undefined,
      resolutionNotes: undefined,
    });

    return disputeId;
  },
});

export const listDisputes = query({
  args: {
    userId: v.string(),
    status: v.optional(
      v.union(v.literal("open"), v.literal("won"), v.literal("lost"), v.literal("canceled"))
    ),
    organizationId: v.optional(v.id("organizations")),
    eventId: v.optional(v.id("events")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin ativo
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Evitar reatribuição que troca o tipo (QueryInitializer -> Query)
    const base =
      args.eventId
        ? ctx.db.query("disputes").withIndex("by_event", (qi) => qi.eq("eventId", args.eventId!))
        : args.organizationId
        ? ctx.db.query("disputes").withIndex("by_organization", (qi) => qi.eq("organizationId", args.organizationId!))
        : ctx.db.query("disputes");

    const disputes = await (
      args.status
        ? base.filter((qq) => qq.eq(qq.field("status"), args.status)).collect()
        : base.collect()
    );

    disputes.sort((a: any, b: any) => (b.openedAt || 0) - (a.openedAt || 0));
    return args.limit ? disputes.slice(0, args.limit) : disputes;
  },
});

export const getDisputeById = query({
  args: { userId: v.string(), disputeId: v.id("disputes") },
  handler: async (ctx, { userId, disputeId }) => {
    // Verificar se o usuário é admin ativo
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    const dispute = await ctx.db.get(disputeId);
    if (!dispute) return null;

    const event = await ctx.db.get(dispute.eventId);
    const transaction = await ctx.db
      .query("transactions")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", dispute.transactionId))
      .first();

    return {
      dispute,
      eventName: event?.name,
      eventStartDate: event?.eventStartDate,
      transactionStatus: transaction?.status,
    };
  },
});

export const resolveDispute = mutation({
    args: {
        userId: v.string(),
        disputeId: v.id("disputes"),
        outcome: v.union(v.literal("won"), v.literal("lost"), v.literal("canceled")),
        resolutionNotes: v.optional(v.string()),
    },
    handler: async (ctx, { userId, disputeId, outcome, resolutionNotes }) => {
        // Verificar se o usuário é admin ativo
        const admin = await ctx.db
            .query("platformAdmins")
            .withIndex("by_user_id", (q) => q.eq("userId", userId))
            .filter((q) => q.eq(q.field("isActive"), true))
            .first();
    
        if (!admin) {
            throw new Error("Acesso não autorizado");
        }
    
        // Gate de permissão para resolver disputas
        if (
            admin.role !== "superadmin" &&
            admin.role !== "finance" &&
            !admin.permissions?.includes("manage_disputes")
        ) {
            throw new Error("Sem permissão para resolver disputas");
        }
    
        const dispute = await ctx.db.get(disputeId);
        if (!dispute) throw new Error("Disputa não encontrada");
    
        const now = Date.now();
    
        await ctx.db.patch(disputeId, {
            status: outcome,
            resolvedAt: now,
            resolutionNotes,
        });
    
        if (outcome === "lost") {
            const event = await ctx.db.get(dispute.eventId);
            const eventNotOccurred = event ? now < event.eventStartDate : false;
             const tx = await ctx.db
                .query("transactions")
                .withIndex("by_transactionId", (q) => q.eq("transactionId", dispute.transactionId))
                .first();
    
            if (eventNotOccurred && dispute.tickets && dispute.tickets.length > 0) {
                for (const t of dispute.tickets) {
                    const ticket = await ctx.db.get(t.ticketId as Id<"tickets">);
                    if (ticket && ticket.status === "valid") {
                        await ctx.db.patch(ticket._id, { status: "refunded" });
                    }
                }
            }

            if (tx) {
                await ctx.db.patch(tx._id, { status: "refunded" });
            }
        }
    
        if (outcome === "won") {
            const tx = await ctx.db
                .query("transactions")
                .withIndex("by_transactionId", (q) => q.eq("transactionId", dispute.transactionId))
                .first();
            if (tx) {
                await ctx.db.patch(tx._id, { status: "paid" });
            }
        }
    
        await ctx.db.insert("adminActivityLogs", {
            adminId: userId,
            action: "resolve_dispute",
            targetType: "dispute",
            targetId: String(disputeId),
            details: { outcome, transactionId: dispute.transactionId },
            timestamp: now,
            ipAddress: undefined,
        });
    
        return { ok: true };
    },
});