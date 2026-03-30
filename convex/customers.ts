import { mutation, query } from "./\_generated/server";
import { v } from "convex/values";

// Definir o schema da tabela customers
export const create = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
    customerId: v.string(),
    provider: v.union(v.literal("pagarme"), v.literal("mercadopago")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("customers", {
      userId: args.userId,
      email: args.email,
      provider: args.provider,
      customerId: args.customerId,
      createdAt: Date.now(),
    });
  },
});

export const getByUserIdAndProvider = query({
  args: {
    userId: v.string(),
    provider: v.union(v.literal("pagarme"), v.literal("mercadopago")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customers")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .first();
  },
});

// Consultar cliente por userId
export const getByUserId = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customers")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();
  },
});