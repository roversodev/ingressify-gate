import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const save = mutation({
  args: {
    userId: v.string(),
    provider: v.union(v.literal("pagarme"), v.literal("mercadopago")),
    customerId: v.string(),
    cardId: v.string(),
    brand: v.optional(v.string()),
    last4: v.optional(v.string()),
    expMonth: v.optional(v.string()),
    expYear: v.optional(v.string()),
    holderName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // upsert por cardId
    const existing = await ctx.db
      .query("paymentCards")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        brand: args.brand,
        last4: args.last4,
        expMonth: args.expMonth,
        expYear: args.expYear,
        holderName: args.holderName,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("paymentCards", {
      userId: args.userId,
      provider: args.provider,
      customerId: args.customerId,
      cardId: args.cardId,
      brand: args.brand,
      last4: args.last4,
      expMonth: args.expMonth,
      expYear: args.expYear,
      holderName: args.holderName,
      createdAt: Date.now(),
    });
  },
});

export const listByUserProvider = query({
  args: {
    userId: v.string(),
    provider: v.union(v.literal("pagarme"), v.literal("mercadopago")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("paymentCards")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .collect();
  },
});

export const deleteByCardId = mutation({
  args: {
    cardId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("paymentCards")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  },
});