import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function requireSuperAdmin(
  ctx: { db: any },
  userId: string,
) {
  const admin = await ctx.db
    .query("platformAdmins")
    .withIndex("by_user_id", (q: any) => q.eq("userId", userId))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();
  if (!admin || admin.role !== "superadmin") {
    throw new Error("Acesso negado: apenas superadmin.");
  }
}

/**
 * Política pública de versão mínima do app (loja). Sem documento = nenhum bloqueio.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("clientAppVersionPolicy").first();
    if (!row) return null;
    return {
      minIosVersion: row.minIosVersion ?? "",
      minAndroidVersion: row.minAndroidVersion ?? "",
      minWebVersion: row.minWebVersion ?? "",
      storeUrlIos: row.storeUrlIos ?? "",
      storeUrlAndroid: row.storeUrlAndroid ?? "",
      message: row.message,
    };
  },
});

/**
 * Define ou atualiza a política (uma linha). Use strings vazias para desativar o mínimo por plataforma.
 */
export const setPolicy = mutation({
  args: {
    currentUserId: v.string(),
    minIosVersion: v.string(),
    minAndroidVersion: v.string(),
    minWebVersion: v.optional(v.string()),
    storeUrlIos: v.string(),
    storeUrlAndroid: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.currentUserId);
    const now = Date.now();
    const payload = {
      minIosVersion: args.minIosVersion.trim(),
      minAndroidVersion: args.minAndroidVersion.trim(),
      minWebVersion: (args.minWebVersion ?? "").trim(),
      storeUrlIos: args.storeUrlIos.trim(),
      storeUrlAndroid: args.storeUrlAndroid.trim(),
      message: args.message?.trim(),
      updatedAt: now,
    };
    const existing = await ctx.db.query("clientAppVersionPolicy").first();
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("clientAppVersionPolicy", payload);
  },
});
