import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { feeCalculations } from "../lib/fees";

const clampRate = (n: number) => Math.max(0, Math.min(1, n));
const mapPaymentMethod = (pm: string): "PIX" | "CARD" => {
  const s = (pm || "").toLowerCase();
  return s === "pix" ? "PIX" : "CARD";
};

async function getEventCustomFeeSettings(ctx: any, eventId: string) {
  const s = await ctx.db.query("eventFeeSettings").withIndex("by_event", (q: any) => q.eq("eventId", eventId)).first();
  if (!s) return undefined;
  return {
    useCustomFees: !!s.useCustomFees,
    pixFeePercentage: s.pixFeePercentage,
    cardFeePercentage: s.cardFeePercentage,
  };
}

async function getEventPlatformFee(ctx: any, eventId: string) {
  const transactions = await ctx.db.query("transactions").withIndex("by_event", (q: any) => q.eq("eventId", eventId)).filter((q: any) => q.eq(q.field("status"), "paid")).collect();
  const feeSettings = await getEventCustomFeeSettings(ctx, eventId);
  let total = 0;
  for (const t of transactions) {
    if ((t.paymentMethod || "").toLowerCase() === "free") continue;
    const tickets = await ctx.db.query("tickets").withIndex("by_transaction", (q: any) => q.eq("transactionId", t.transactionId)).collect();
    const discountAmount = tickets.reduce((s: number, k: any) => s + (k.discountAmount || 0), 0);
    const pm = mapPaymentMethod(t.paymentMethod);
    total += feeCalculations.calculatePlatformFee(t.amount, discountAmount, pm, feeSettings);
  }
  return total;
}

export const createRepresentative = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    userId: v.string(),
    defaultCommissionRate: v.optional(v.number()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("representatives").withIndex("by_user", (q) => q.eq("userId", args.userId)).first();
    if (existing) return { success: false, message: "Representante já cadastrado para este usuário", representativeId: existing._id };
    const id = await ctx.db.insert("representatives", {
      name: args.name,
      email: args.email,
      phone: args.phone,
      userId: args.userId,
      defaultCommissionRate: typeof args.defaultCommissionRate === "number" ? clampRate(args.defaultCommissionRate) : undefined,
      isActive: true,
      createdAt: Date.now(),
    });
    return { success: true, message: "Representante criado", representativeId: id };
  },
});

export const updateRepresentative = mutation({
  args: {
    representativeId: v.id("representatives"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    defaultCommissionRate: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.email !== undefined) updates.email = args.email;
    if (args.phone !== undefined) updates.phone = args.phone;
    if (args.defaultCommissionRate !== undefined) updates.defaultCommissionRate = clampRate(args.defaultCommissionRate);
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    await ctx.db.patch(args.representativeId, updates);
    return { success: true, message: "Representante atualizado" };
  },
});

export const assignRepresentativeToEvent = mutation({
  args: {
    eventId: v.id("events"),
    representativeId: v.id("representatives"),
    commissionRate: v.number(),
    assignedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const rep = await ctx.db.get(args.representativeId);
    if (!rep || rep.isActive === false) return { success: false, message: "Representante inválido" };
    const existing = await ctx.db.query("eventRepresentatives").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).filter((q) => q.eq(q.field("representativeId"), args.representativeId)).first();
    const rate = clampRate(args.commissionRate);
    if (existing) {
      await ctx.db.patch(existing._id, { commissionRate: rate, isActive: true });
      return { success: true, message: "Representante atualizado no evento" };
    }
    await ctx.db.insert("eventRepresentatives", {
      eventId: args.eventId,
      representativeId: args.representativeId,
      commissionRate: rate,
      isActive: true,
      assignedAt: Date.now(),
      assignedBy: args.assignedBy,
    });
    return { success: true, message: "Representante vinculado ao evento" };
  },
});

export const removeRepresentativeFromEvent = mutation({
  args: {
    eventId: v.id("events"),
    representativeId: v.id("representatives"),
    removedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("eventRepresentatives").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).filter((q) => q.eq(q.field("representativeId"), args.representativeId)).first();
    if (!existing) return { success: false, message: "Vínculo não encontrado" };
    await ctx.db.patch(existing._id, { isActive: false });
    return { success: true, message: "Representante removido do evento" };
  },
});

export const recordRepresentativePayout = mutation({
  args: {
    eventId: v.id("events"),
    representativeId: v.id("representatives"),
    amount: v.number(),
    recordedBy: v.string(),
    notes: v.optional(v.string()),
    markPaid: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) return { success: false, message: "Valor inválido" };
    const status = args.markPaid ? "paid" : "pending";
    const id = await ctx.db.insert("representativePayouts", {
      eventId: args.eventId,
      representativeId: args.representativeId,
      amount: args.amount,
      status,
      createdAt: Date.now(),
      paidAt: args.markPaid ? Date.now() : undefined,
      recordedBy: args.recordedBy,
      notes: args.notes,
    });
    return { success: true, message: "Baixa registrada", payoutId: id };
  },
});

export const updateRepresentativePayoutStatus = mutation({
  args: {
    payoutId: v.id("representativePayouts"),
    status: v.union(v.literal("pending"), v.literal("paid")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.payoutId, { status: args.status, paidAt: args.status === "paid" ? Date.now() : undefined });
    return { success: true, message: "Status atualizado" };
  },
});

export const getEventCommissionSummary = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const platformFeeTotal = await getEventPlatformFee(ctx, eventId);
    const links = await ctx.db.query("eventRepresentatives").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const reps = await Promise.all(links.map((l) => ctx.db.get(l.representativeId)));
    const payouts = await ctx.db.query("representativePayouts").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const rows = links.map((l, i) => {
      const rep = reps[i];
      const commission = platformFeeTotal * l.commissionRate;
      const paid = payouts.filter((p) => p.representativeId === l.representativeId && p.status === "paid").reduce((s, p) => s + p.amount, 0);
      const pending = payouts.filter((p) => p.representativeId === l.representativeId && p.status === "pending").reduce((s, p) => s + p.amount, 0);
      const outstanding = Math.max(0, commission - paid);
      return {
        representativeId: l.representativeId,
        name: rep?.name || "",
        email: rep?.email,
        commissionRate: l.commissionRate,
        isActive: l.isActive !== false,
        commission,
        paid,
        pending,
        outstanding,
      };
    });
    return { success: true, platformFeeTotal, representatives: rows };
  },
});

export const getRepresentativeDashboardByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rep = await ctx.db.query("representatives").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (!rep) return { success: false, message: "Representante não encontrado" };
    const links = await ctx.db.query("eventRepresentatives").withIndex("by_rep", (q) => q.eq("representativeId", rep._id)).filter((q) => q.eq(q.field("isActive"), true)).collect();
    const events = await Promise.all(links.map((l) => ctx.db.get(l.eventId)));
    const payoutsAll = await ctx.db.query("representativePayouts").withIndex("by_rep", (q) => q.eq("representativeId", rep._id)).collect();
    const items = await Promise.all(
      links.map(async (l, i) => {
        const e = events[i];
        const platformFeeTotal = await getEventPlatformFee(ctx, l.eventId);
        const commission = platformFeeTotal * l.commissionRate;
        const paid = payoutsAll.filter((p) => p.eventId === l.eventId && p.status === "paid").reduce((s, p) => s + p.amount, 0);
        const pending = payoutsAll.filter((p) => p.eventId === l.eventId && p.status === "pending").reduce((s, p) => s + p.amount, 0);
        const outstanding = Math.max(0, commission - paid);
        return {
          eventId: l.eventId,
          eventName: e?.name || "",
          commissionRate: l.commissionRate,
          platformFeeTotal,
          commission,
          paid,
          pending,
          outstanding,
        };
      })
    );
    return { success: true, representative: { _id: rep._id, name: rep.name, email: rep.email }, events: items };
  },
});

export const getRepresentativeByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rep = await ctx.db.query("representatives").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (!rep) return null;
    return rep;
  },
});