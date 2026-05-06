import { mutation, query } from "./\_generated/server";
import { v } from "convex/values";

// Obter configurações de taxa de um evento
export const getEventFeeSettings = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("eventFeeSettings")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .first();
  },
});

// Obter configurações de taxa de todos os eventos de uma organização
export const getAllEventFeeSettingsByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    // Get all events for this organization first
    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    
    // Get fee settings for all these events
    const eventIds = events.map(event => event._id);
    const feeSettings = [];
    
    for (const eventId of eventIds) {
      const setting = await ctx.db
        .query("eventFeeSettings")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .first();
      
      if (setting) {
        feeSettings.push(setting);
      }
    }
    
    return feeSettings;
  },
});

// Criar ou atualizar configurações de taxa
export const upsertEventFeeSettings = mutation({
  args: {
    eventId: v.id("events"),
    pixFeePercentage: v.optional(v.number()),
    cardFeePercentage: v.optional(v.number()),
    offlineFee: v.optional(v.number()),
    absorbFees: v.optional(v.boolean()),
    useCustomFees: v.boolean(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("eventFeeSettings")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .first();

    const now = Date.now();
    const offlineFee = args.offlineFee !== undefined
      ? Math.max(0, Math.min(1, args.offlineFee))
      : undefined;

    if (existing) {
      return await ctx.db.patch(existing._id, {
        pixFeePercentage: args.pixFeePercentage,
        cardFeePercentage: args.cardFeePercentage,
        offlineFee,
        absorbFees: args.absorbFees,
        useCustomFees: args.useCustomFees,
        updatedAt: now,
      });
    } else {
      return await ctx.db.insert("eventFeeSettings", {
        eventId: args.eventId,
        pixFeePercentage: args.pixFeePercentage,
        cardFeePercentage: args.cardFeePercentage,
        offlineFee,
        absorbFees: args.absorbFees,
        useCustomFees: args.useCustomFees,
        createdAt: now,
        updatedAt: now,
        createdBy: args.userId,
      });
    }
  },
});

// Remover configurações customizadas (volta ao padrão)
export const removeEventFeeSettings = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("eventFeeSettings")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});