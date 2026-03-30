import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
async function requireContentAdmin(
  ctx: { db: any },
  userId: string
) {
  const admin = await ctx.db
    .query("platformAdmins")
    .withIndex("by_user_id", (q: any) => q.eq("userId", userId))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();
  if (
    !admin ||
    (admin.role !== "superadmin" && admin.role !== "admin")
  ) {
    throw new Error("Acesso negado: apenas administradores da plataforma.");
  }
  return admin;
}

function formatEventSubtitle(ev: {
  location?: string;
  eventStartDate: number;
}) {
  const d = new Date(ev.eventStartDate);
  const dateStr = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return ev.location ? `${ev.location} · ${dateStr}` : dateStr;
}

/** Slides públicos para o carrossel da home (URLs já resolvidas) */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const banners = await ctx.db
      .query("homepageBanners")
      .withIndex("by_active_sort", (q) => q.eq("isActive", true))
      .order("asc")
      .collect();

    const slides: Array<{
      id: string;
      type: "image" | "event";
      imageUrl: string;
      mobileImageUrl?: string;
      title: string;
      subtitle: string;
      href: string;
      badgeText?: string;
      location?: string;
      eventStartDate?: number;
    }> = [];

    for (const b of banners) {
      if (b.type === "image") {
        if (!b.imageStorageId) continue;
        const imageUrl = (await ctx.storage.getUrl(b.imageStorageId)) ?? null;
        if (!imageUrl) continue;
        let mobileImageUrl: string | undefined;
        if (b.mobileImageStorageId) {
          const u = await ctx.storage.getUrl(b.mobileImageStorageId);
          if (u) mobileImageUrl = u;
        }
        slides.push({
          id: b._id,
          type: "image",
          imageUrl,
          mobileImageUrl,
          title: b.title || "Destaque",
          subtitle: b.subtitle || "",
          href: b.linkUrl && b.linkUrl.trim() ? b.linkUrl : "#",
          badgeText: b.badgeText,
        });
      } else if (b.type === "event" && b.eventId) {
        const ev = await ctx.db.get(b.eventId);
        if (!ev || ev.is_cancelled) continue;
        let imageUrl: string | null = null;
        if (ev.imageStorageId) {
          imageUrl = (await ctx.storage.getUrl(ev.imageStorageId)) ?? null;
        }
        let mobileImageUrl: string | undefined;
        if (b.mobileImageStorageId) {
          const u = await ctx.storage.getUrl(b.mobileImageStorageId);
          if (u) mobileImageUrl = u;
        }
        slides.push({
          id: b._id,
          type: "event",
          imageUrl: imageUrl || "",
          mobileImageUrl,
          title: b.title || ev.name,
          subtitle: b.subtitle || formatEventSubtitle(ev),
          href: `/event/${ev.slug}`,
          badgeText: b.badgeText,
          location: ev.location,
          eventStartDate: ev.eventStartDate,
        });
      }
    }
    return slides;
  },
});

export const listAllAdmin = query({
  args: { adminUserId: v.string() },
  handler: async (ctx, { adminUserId }) => {
    await requireContentAdmin(ctx, adminUserId);
    const banners = await ctx.db.query("homepageBanners").collect();
    banners.sort((a, b) => a.sortOrder - b.sortOrder);
    return await Promise.all(
      banners.map(async (b) => {
        let previewUrl: string | null = null;
        let mobilePreviewUrl: string | null = null;
        if (b.type === "image" && b.imageStorageId) {
          previewUrl = (await ctx.storage.getUrl(b.imageStorageId)) ?? null;
        } else if (b.eventId) {
          const ev = await ctx.db.get(b.eventId);
          if (ev?.imageStorageId) {
            previewUrl = (await ctx.storage.getUrl(ev.imageStorageId)) ?? null;
          }
        }
        if (b.mobileImageStorageId) {
          mobilePreviewUrl = (await ctx.storage.getUrl(b.mobileImageStorageId)) ?? null;
        }
        let eventName: string | undefined;
        if (b.eventId) {
          const ev = await ctx.db.get(b.eventId);
          eventName = ev?.name;
        }
        return { ...b, previewUrl, mobilePreviewUrl, eventName };
      })
    );
  },
});

export const searchEventsForBanner = query({
  args: { adminUserId: v.string(), searchTerm: v.string() },
  handler: async (ctx, { adminUserId, searchTerm }) => {
    await requireContentAdmin(ctx, adminUserId);
    const term = searchTerm.trim().toLowerCase();
    const events = await ctx.db.query("events").collect();
    const filtered = events
      .filter((e) => !e.is_cancelled)
      .filter((e) => {
        if (!term) return true;
        return (
          e.name.toLowerCase().includes(term) ||
          e.slug.toLowerCase().includes(term) ||
          (e.location?.toLowerCase().includes(term) ?? false)
        );
      })
      .slice(0, 30);
    return filtered.map((e) => ({
      _id: e._id,
      name: e.name,
      slug: e.slug,
      location: e.location,
      eventStartDate: e.eventStartDate,
    }));
  },
});

export const createBanner = mutation({
  args: {
    adminUserId: v.string(),
    type: v.union(v.literal("image"), v.literal("event")),
    imageStorageId: v.optional(v.id("_storage")),
    title: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    badgeText: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    mobileImageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await requireContentAdmin(ctx, args.adminUserId);
    if (args.type === "image") {
      if (!args.imageStorageId) {
        throw new Error("Envie a imagem para o Convex Storage antes de criar o banner.");
      }
    } else {
      if (!args.eventId) {
        throw new Error("Selecione um evento.");
      }
    }
    const existing = await ctx.db.query("homepageBanners").collect();
    const maxOrder =
      existing.length > 0
        ? Math.max(...existing.map((x) => x.sortOrder), -1)
        : -1;
    const now = Date.now();
    return await ctx.db.insert("homepageBanners", {
      type: args.type,
      imageStorageId: args.type === "image" ? args.imageStorageId : undefined,
      mobileImageStorageId:
        args.mobileImageStorageId &&
        (args.type === "image" || args.type === "event")
          ? args.mobileImageStorageId
          : undefined,
      externalImageUrl: undefined,
      title: args.title?.trim() || undefined,
      subtitle: args.subtitle?.trim() || undefined,
      linkUrl: args.type === "image" ? args.linkUrl?.trim() || undefined : undefined,
      badgeText: args.badgeText?.trim() || undefined,
      eventId: args.type === "event" ? args.eventId : undefined,
      sortOrder: maxOrder + 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateBanner = mutation({
  args: {
    adminUserId: v.string(),
    bannerId: v.id("homepageBanners"),
    title: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    badgeText: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    mobileImageStorageId: v.optional(v.id("_storage")),
    isActive: v.optional(v.boolean()),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    await requireContentAdmin(ctx, args.adminUserId);
    const b = await ctx.db.get(args.bannerId);
    if (!b) throw new Error("Banner não encontrado");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim() || undefined;
    if (args.subtitle !== undefined)
      patch.subtitle = args.subtitle.trim() || undefined;
    if (args.linkUrl !== undefined)
      patch.linkUrl = args.linkUrl.trim() || undefined;
    if (args.badgeText !== undefined)
      patch.badgeText = args.badgeText.trim() || undefined;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (b.type === "image" && args.imageStorageId !== undefined) {
      patch.imageStorageId = args.imageStorageId;
      patch.externalImageUrl = undefined;
    }
    if (args.mobileImageStorageId !== undefined) {
      patch.mobileImageStorageId = args.mobileImageStorageId;
    }
    if (b.type === "event" && args.eventId !== undefined) {
      patch.eventId = args.eventId;
    }
    await ctx.db.patch(args.bannerId, patch);
  },
});

export const clearBannerMobileImage = mutation({
  args: { adminUserId: v.string(), bannerId: v.id("homepageBanners") },
  handler: async (ctx, { adminUserId, bannerId }) => {
    await requireContentAdmin(ctx, adminUserId);
    const b = await ctx.db.get(bannerId);
    if (!b) return;
    await ctx.db.replace(bannerId, {
      type: b.type,
      imageStorageId: b.imageStorageId,
      externalImageUrl: b.externalImageUrl,
      title: b.title,
      subtitle: b.subtitle,
      linkUrl: b.linkUrl,
      badgeText: b.badgeText,
      eventId: b.eventId,
      sortOrder: b.sortOrder,
      isActive: b.isActive,
      createdAt: b.createdAt,
      updatedAt: Date.now(),
    });
  },
});

export const deleteBanner = mutation({
  args: { adminUserId: v.string(), bannerId: v.id("homepageBanners") },
  handler: async (ctx, { adminUserId, bannerId }) => {
    await requireContentAdmin(ctx, adminUserId);
    const b = await ctx.db.get(bannerId);
    if (!b) return;
    await ctx.db.delete(bannerId);
  },
});

export const reorderBanners = mutation({
  args: {
    adminUserId: v.string(),
    orderedIds: v.array(v.id("homepageBanners")),
  },
  handler: async (ctx, { adminUserId, orderedIds }) => {
    await requireContentAdmin(ctx, adminUserId);
    const now = Date.now();
    for (let i = 0; i < orderedIds.length; i++) {
      await ctx.db.patch(orderedIds[i], {
        sortOrder: i,
        updatedAt: now,
      });
    }
  },
});
