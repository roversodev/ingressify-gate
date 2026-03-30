import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const create = mutation({
  args: {
    transactionId: v.string(),
    customerEmail: v.string(),
    customerName: v.optional(v.string()),
    eventId: v.id("events"),
    ticketSelections: v.any(),
    qrCodeText: v.string(),
    pixExpiresAt: v.string(),
    scheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("pendingEmails", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const getPendingEmails = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    return await ctx.db
      .query("pendingEmails")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => q.lte(q.field("scheduledFor"), now))
      .collect();
  },
});

export const markAsSent = mutation({
  args: {
    id: v.id("pendingEmails"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "sent" });
  },
});

export const markAsCancelled = mutation({
  args: {
    transactionId: v.string(),
  },
  handler: async (ctx, args) => {
    const pendingEmail = await ctx.db
      .query("pendingEmails")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", args.transactionId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (pendingEmail) {
      await ctx.db.patch(pendingEmail._id, { status: "cancelled" });
    }
  },
});