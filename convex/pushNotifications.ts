import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal as _internal } from "./_generated/api";
import { v } from "convex/values";
const internal = _internal as any;

/** Taxa em BRL para notificação à base inteira do app. */
export const PUSH_NOTIFICATION_FEE_ALL_APP = 250;
/** Taxa em BRL para compradores do evento ou apenas check-ins. */
export const PUSH_NOTIFICATION_FEE_TARGETED = 20;

export function getPushNotificationFee(
  targetType: "event_buyers" | "event_checkins" | "all_app",
): number {
  return targetType === "all_app"
    ? PUSH_NOTIFICATION_FEE_ALL_APP
    : PUSH_NOTIFICATION_FEE_TARGETED;
}

/** @deprecated Use getPushNotificationFee ou constantes específicas. */
export const PUSH_NOTIFICATION_FEE = PUSH_NOTIFICATION_FEE_ALL_APP;

/** Produtor cria uma solicitação de push notification para o admin aprovar. */
export const createRequest = mutation({
  args: {
    eventId: v.id("events"),
    title: v.string(),
    message: v.string(),
    targetType: v.union(
      v.literal("event_buyers"),
      v.literal("event_checkins"),
      v.literal("all_app"),
    ),
    scheduledFor: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    actionUrl: v.optional(v.string()),
    createdByUserId: v.string(),
    createdByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Verifica que o usuário é dono ou membro da organização do evento
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Evento não encontrado.");

    const isDirectOwner = event.userId === args.createdByUserId;
    const isOrgMember = event.organizationId
      ? !!(await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization_user", (q) =>
            q.eq("organizationId", event.organizationId!).eq("userId", args.createdByUserId),
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .first())
      : false;

    if (!isDirectOwner && !isOrgMember) {
      throw new Error("Você não tem permissão para criar notificações neste evento.");
    }

    if (args.title.trim().length < 3) throw new Error("Título muito curto.");
    if (args.message.trim().length < 5) throw new Error("Mensagem muito curta.");
    if (args.title.length > 100) throw new Error("Título muito longo (máx. 100 caracteres).");
    if (args.message.length > 500) throw new Error("Mensagem muito longa (máx. 500 caracteres).");

    const fee = getPushNotificationFee(args.targetType);

    const id = await ctx.db.insert("pushNotificationRequests", {
      title: args.title.trim(),
      message: args.message.trim(),
      imageUrl: args.imageUrl,
      actionUrl: args.actionUrl,
      eventId: args.eventId,
      createdByUserId: args.createdByUserId,
      createdByName: args.createdByName,
      targetType: args.targetType,
      scheduledFor: args.scheduledFor,
      status: "pending",
      fee,
      createdAt: now,
      updatedAt: now,
    });

    // Notifica admins da plataforma sobre a nova solicitação pendente
    await ctx.scheduler.runAfter(0, internal.pushNotifications.notifyAdminsNewRequest, {
      requestId: id,
      eventName: event.name ?? "Evento",
      requesterName: args.createdByName ?? "Produtor",
    });

    return { id, fee };
  },
});

/** Lista as notificações do evento (apenas para dono ou membro da organização). */
export const listMyRequests = query({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
  },
  handler: async (ctx, { eventId, userId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return [];

    const isDirectOwner = event.userId === userId;
    const isOrgMember = event.organizationId
      ? !!(await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization_user", (q) =>
            q.eq("organizationId", event.organizationId!).eq("userId", userId),
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .first())
      : false;

    if (!isDirectOwner && !isOrgMember) return [];

    return ctx.db
      .query("pushNotificationRequests")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .order("desc")
      .collect();
  },
});

/** Produtor cancela uma notificação pendente. */
export const cancelRequest = mutation({
  args: {
    requestId: v.id("pushNotificationRequests"),
    userId: v.string(),
  },
  handler: async (ctx, { requestId, userId }) => {
    const req = await ctx.db.get(requestId);
    if (!req) throw new Error("Solicitação não encontrada.");
    if (req.createdByUserId !== userId) throw new Error("Sem permissão.");
    if (req.status !== "pending" && req.status !== "approved") {
      throw new Error("Só é possível cancelar notificações pendentes ou aprovadas.");
    }

    await ctx.db.patch(requestId, { status: "cancelled", updatedAt: Date.now() });
  },
});



// ─── Queries (admin) ─────────────────────────────────────────────────────────

/** Lista todas as notificações com filtro opcional de status. */
export const listAll = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("sending"),
        v.literal("sent"),
        v.literal("cancelled"),
        v.literal("failed"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    let q = ctx.db.query("pushNotificationRequests").order("desc");

    const all = await q.collect();

    const filtered = status ? all.filter((r) => r.status === status) : all;
    const paginated = filtered.slice(0, limit ?? 100);

    // Busca evento e organização para cada notificação
    const withMeta = await Promise.all(
      paginated.map(async (r) => {
        const event = await ctx.db.get(r.eventId);
        const org = event?.organizationId ? await ctx.db.get(event.organizationId) : null;
        return {
          ...r,
          eventName: event?.name ?? "Evento removido",
          organizationId: event?.organizationId ?? null,
          organizationName: org?.name ?? null,
          fee: r.fee ?? getPushNotificationFee(r.targetType),
        };
      }),
    );

    return withMeta;
  },
});

/** Contagem de pendentes (para badge no sidebar). */
export const pendingCount = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("pushNotificationRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending.length;
  },
});

/** Stats resumidas para o dashboard de notificações. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("pushNotificationRequests").collect();
    const now = Date.now();
    const sent = all.filter((r) => r.status === "sent");
    const totalRevenue = sent.reduce(
      (sum, r) => sum + (r.fee ?? getPushNotificationFee(r.targetType)),
      0,
    );
    return {
      total: all.length,
      pending: all.filter((r) => r.status === "pending").length,
      approved: all.filter((r) => r.status === "approved").length,
      sent: sent.length,
      rejected: all.filter((r) => r.status === "rejected").length,
      failed: all.filter((r) => r.status === "failed").length,
      scheduled: all.filter(
        (r) => r.status === "approved" && r.scheduledFor && r.scheduledFor > now,
      ).length,
      totalRevenue,
      feeAllApp: PUSH_NOTIFICATION_FEE_ALL_APP,
      feeTargeted: PUSH_NOTIFICATION_FEE_TARGETED,
    };
  },
});

// ─── Mutations (admin) ───────────────────────────────────────────────────────


/** Admin aprova a notificação: registra o débito na organização e dispara o envio. */
export const approve = mutation({
  args: {
    requestId: v.id("pushNotificationRequests"),
    adminUserId: v.string(),
  },
  handler: async (ctx, { requestId, adminUserId }) => {
    const req = await ctx.db.get(requestId);
    if (!req) throw new Error("Solicitação não encontrada.");
    if (req.status !== "pending") throw new Error("Apenas solicitações pendentes podem ser aprovadas.");

    // Busca o evento para obter a organização
    const event = await ctx.db.get(req.eventId);
    if (!event) throw new Error("Evento não encontrado.");
    if (!event.organizationId) throw new Error("Evento não está vinculado a uma organização.");

    const fee = req.fee ?? getPushNotificationFee(req.targetType);
    const now = Date.now();

    // ── Registra débito na organização ───────────────────────────────────────
    const eventName = event.name ?? "Evento";
    const withdrawalId = await ctx.db.insert("organizationWithdrawals", {
      organizationId: event.organizationId,
      userId: adminUserId,
      amount: fee,
      status: "pending",
      type: "debit",
      notes: `Serviço de notificação push — ${eventName}: "${req.title}"`,
      eventId: req.eventId,
      requestedAt: now,
    });

    // ── Marca a solicitação como aprovada ────────────────────────────────────
    const isScheduled = !!req.scheduledFor && req.scheduledFor > now;

    await ctx.db.patch(requestId, {
      status: isScheduled ? "approved" : "sending",
      approvedByUserId: adminUserId,
      approvedAt: now,
      updatedAt: now,
      organizationWithdrawalId: withdrawalId,
    });

    // ── Disparo imediato ─────────────────────────────────────────────────────
    if (!isScheduled) {
      await ctx.scheduler.runAfter(0, internal.pushNotifications.sendNotification, { requestId });
    }

    return { scheduled: isScheduled, fee, withdrawalId };
  },
});

/** Admin rejeita a notificação com motivo. */
export const reject = mutation({
  args: {
    requestId: v.id("pushNotificationRequests"),
    adminUserId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, { requestId, adminUserId, reason }) => {
    const req = await ctx.db.get(requestId);
    if (!req) throw new Error("Solicitação não encontrada.");
    if (req.status !== "pending") throw new Error("Apenas solicitações pendentes podem ser rejeitadas.");

    await ctx.db.patch(requestId, {
      status: "rejected",
      rejectedByUserId: adminUserId,
      rejectedReason: reason.trim(),
      rejectedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Admin dispara manualmente uma notificação agendada aprovada. */
export const sendNow = mutation({
  args: {
    requestId: v.id("pushNotificationRequests"),
  },
  handler: async (ctx, { requestId }) => {
    const req = await ctx.db.get(requestId);
    if (!req) throw new Error("Solicitação não encontrada.");
    if (req.status !== "approved") throw new Error("Apenas notificações aprovadas podem ser enviadas.");

    await ctx.db.patch(requestId, { status: "sending", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.pushNotifications.sendNotification, { requestId });
  },
});

// ─── Internal: patch de resultado ────────────────────────────────────────────

export const patchSendResult = internalMutation({
  args: {
    requestId: v.id("pushNotificationRequests"),
    oneSignalNotificationId: v.optional(v.string()),
    recipientCount: v.optional(v.number()),
    deviceCount: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    status: v.union(v.literal("sent"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.requestId);

    await ctx.db.patch(args.requestId, {
      status: args.status,
      oneSignalNotificationId: args.oneSignalNotificationId,
      recipientCount: args.recipientCount,
      deviceCount: args.deviceCount,
      failureReason: args.failureReason,
      sentAt: args.status === "sent" ? Date.now() : undefined,
      updatedAt: Date.now(),
    });

    // Confirma ou estorna o débito conforme resultado do envio
    if (req?.organizationWithdrawalId) {
      if (args.status === "sent") {
        await ctx.db.patch(req.organizationWithdrawalId, {
          status: "completed",
          processedAt: Date.now(),
        });
      } else {
        // Falha: cancela o débito — cliente não é cobrado
        await ctx.db.patch(req.organizationWithdrawalId, {
          status: "cancelled",
          processedAt: Date.now(),
          notes: `Estorno automático — falha no envio: ${args.failureReason ?? "erro desconhecido"}`,
        });
      }
    }
  },
});

// ─── Internal action: coleta player IDs e envia via OneSignal ────────────────

export const sendNotification = internalAction({
  args: {
    requestId: v.id("pushNotificationRequests"),
  },
  handler: async (ctx, { requestId }) => {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;

    const req = await ctx.runQuery(internal.pushNotifications.getRequest, { requestId });
    if (!req) {
      await ctx.runMutation(internal.pushNotifications.patchSendResult, {
        requestId,
        status: "failed",
        failureReason: "Solicitação não encontrada ao tentar enviar.",
      });
      return;
    }

    if (!appId || !apiKey) {
      await ctx.runMutation(internal.pushNotifications.patchSendResult, {
        requestId,
        status: "failed",
        failureReason: "Credenciais OneSignal não configuradas.",
      });
      return;
    }

    // Coleta player IDs conforme targetType
    let playerIds: string[] = [];
    let targetedUserIds: string[] = [];

    if (req.targetType === "all_app") {
      // Usa segmento "All" do OneSignal — não rastreia usuários individuais
      playerIds = [];
    } else {
      // Busca tickets do evento
      const tickets = await ctx.runQuery(internal.pushNotifications.getEventTickets, {
        eventId: req.eventId,
        onlyCheckins: req.targetType === "event_checkins",
      });

      targetedUserIds = [...new Set<string>(
        tickets.map((t: any) => t.userId).filter(Boolean) as string[]
      )];

      // Grava os usuários alvo antes de enviar (para o relatório)
      await ctx.runMutation(internal.pushNotifications.patchTargetedUsers, {
        requestId,
        targetedUserIds,
      });

      // Busca player IDs dos usuários
      const users = await ctx.runQuery(internal.pushNotifications.getUsersPlayerIds, {
        userIds: targetedUserIds,
      });

      playerIds = users.flatMap((u: any) => u.oneSignalPlayerIds ?? []);
      playerIds = [...new Set(playerIds)]; // deduplica
    }

    if (req.targetType !== "all_app" && playerIds.length === 0) {
      await ctx.runMutation(internal.pushNotifications.patchSendResult, {
        requestId,
        status: "failed",
        failureReason: "Nenhum usuário com notificação habilitada encontrado.",
      });
      return;
    }

    // Monta payload OneSignal
    const body: Record<string, any> = {
      app_id: appId,
      headings: { pt: req.title, en: req.title },
      contents: { pt: req.message, en: req.message },
      data: { eventId: req.eventId, requestId },
    };

    if (req.targetType === "all_app") {
      body.included_segments = ["All"];
    } else {
      body.include_player_ids = playerIds;
    }

    if (req.actionUrl) body.url = req.actionUrl;
    if (req.imageUrl) {
      body.big_picture = req.imageUrl;
      body.ios_attachments = { image: req.imageUrl };
    }

    // Agendamento: se scheduledFor estiver no futuro, passa send_after em ISO 8601 UTC
    if (req.scheduledFor && req.scheduledFor > Date.now()) {
      body.send_after = new Date(req.scheduledFor).toISOString();
    }

    try {
      const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          Authorization: `Basic ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.id) {
        await ctx.runMutation(internal.pushNotifications.patchSendResult, {
          requestId,
          status: "failed",
          failureReason: `OneSignal erro ${res.status}: ${JSON.stringify(json).slice(0, 200)}`,
        });
        return;
      }

      await ctx.runMutation(internal.pushNotifications.patchSendResult, {
        requestId,
        status: "sent",
        oneSignalNotificationId: json.id,
        recipientCount: json.recipients ?? playerIds.length,
        deviceCount: json.recipients ?? playerIds.length,
      });
    } catch (err) {
      await ctx.runMutation(internal.pushNotifications.patchSendResult, {
        requestId,
        status: "failed",
        failureReason: String(err),
      });
    }
  },
});

// ─── Internal queries (usadas pelo action) ───────────────────────────────────

export const getRequest = internalQuery({
  args: { requestId: v.id("pushNotificationRequests") },
  handler: async (ctx, { requestId }) => ctx.db.get(requestId),
});

export const getEventTickets = internalQuery({
  args: {
    eventId: v.id("events"),
    onlyCheckins: v.boolean(),
  },
  handler: async (ctx, { eventId, onlyCheckins }) => {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => {
        const validStatus = q.or(
          q.eq(q.field("status"), "valid"),
          q.eq(q.field("status"), "used"),
        );
        if (onlyCheckins) {
          return q.and(validStatus, q.eq(q.field("status"), "used"));
        }
        return validStatus;
      })
      .collect();

    return tickets;
  },
});

export const getUsersPlayerIds = internalQuery({
  args: { userIds: v.array(v.string()) },
  handler: async (ctx, { userIds }) => {
    if (userIds.length === 0) return [];
    const users = await Promise.all(
      userIds.map((uid) =>
        ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", uid))
          .first(),
      ),
    );
    return users.filter(Boolean).map((u) => ({
      oneSignalPlayerIds: u!.oneSignalPlayerIds ?? [],
    }));
  },
});

/** Busca os OneSignal player IDs de todos os admins ativos da plataforma. */
export const getAdminPlayerIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db
      .query("platformAdmins")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const activeAdmins = admins.filter((a) =>
      a.role === "superadmin" || a.role === "admin",
    );

    const users = await Promise.all(
      activeAdmins.map((a) =>
        ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", a.userId))
          .first(),
      ),
    );

    return users
      .filter(Boolean)
      .flatMap((u) => u!.oneSignalPlayerIds ?? []);
  },
});

/** Retorna os destinatários de uma notificação para admins da plataforma (sem restrição de ownership). */
export const getRequestRecipientsAdmin = query({
  args: {
    requestId: v.id("pushNotificationRequests"),
  },
  handler: async (ctx, { requestId }) => {
    const req = await ctx.db.get(requestId);
    if (!req) return null;

    const event = await ctx.db.get(req.eventId);
    const targetedUserIds = req.targetedUserIds ?? [];

    if (targetedUserIds.length === 0) {
      return {
        targetType: req.targetType,
        targetedUserCount: req.targetedUserCount ?? 0,
        deviceCount: req.deviceCount ?? req.recipientCount ?? 0,
        eventName: event?.name ?? "—",
        recipients: [],
      };
    }

    const recipients = await Promise.all(
      targetedUserIds.map(async (uid) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", uid))
          .first();

        const tickets = await ctx.db
          .query("tickets")
          .withIndex("by_user_event", (q) =>
            q.eq("userId", uid).eq("eventId", req.eventId),
          )
          .filter((q) =>
            q.or(
              q.eq(q.field("status"), "valid"),
              q.eq(q.field("status"), "used"),
            ),
          )
          .collect();

        const checkedIn = tickets.some((t) => t.status === "used");
        const deviceCount = user?.oneSignalPlayerIds?.length ?? 0;

        return {
          userId: uid,
          name: user?.name ?? "Usuário",
          email: user?.email ?? null,
          phone: user?.phone ?? null,
          deviceCount,
          hasNotification: deviceCount > 0,
          ticketCount: tickets.length,
          checkedIn,
        };
      }),
    );

    return {
      targetType: req.targetType,
      targetedUserCount: req.targetedUserCount ?? targetedUserIds.length,
      deviceCount: req.deviceCount ?? req.recipientCount ?? 0,
      eventName: event?.name ?? "—",
      recipients,
    };
  },
});

/** Grava os usuários alvo antes do envio (para o relatório). */
export const patchTargetedUsers = internalMutation({
  args: {
    requestId: v.id("pushNotificationRequests"),
    targetedUserIds: v.array(v.string()),
  },
  handler: async (ctx, { requestId, targetedUserIds }) => {
    await ctx.db.patch(requestId, {
      targetedUserIds,
      targetedUserCount: targetedUserIds.length,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Preview do público-alvo antes de enviar a notificação.
 * Retorna: total de usuários únicos elegíveis e quantos têm push ativo.
 * Reactivo — atualiza automaticamente quando o targetType muda.
 */
export const getAudiencePreview = query({
  args: {
    eventId: v.id("events"),
    targetType: v.union(
      v.literal("event_buyers"),
      v.literal("event_checkins"),
      v.literal("all_app"),
    ),
  },
  handler: async (ctx, { eventId, targetType }) => {
    if (targetType === "all_app") {
      const allUsers = await ctx.db.query("users").collect();
      const pushEnabled = allUsers.filter(
        (u) => Array.isArray(u.oneSignalPlayerIds) && u.oneSignalPlayerIds.length > 0,
      ).length;
      return { uniqueUsers: allUsers.length, pushEnabled, isAllApp: true };
    }

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const eligible = tickets.filter((t) => {
      if (targetType === "event_checkins") return t.status === "used";
      return t.status === "valid" || t.status === "used";
    });

    const uniqueUserIds = [...new Set(eligible.map((t) => t.userId))];

    const users = await Promise.all(
      uniqueUserIds.map((uid) =>
        ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", uid))
          .first(),
      ),
    );

    const pushEnabled = users.filter(
      (u) => u && Array.isArray(u.oneSignalPlayerIds) && u.oneSignalPlayerIds.length > 0,
    ).length;

    return { uniqueUsers: uniqueUserIds.length, pushEnabled, isAllApp: false };
  },
});

/** Retorna os destinatários de uma notificação com dados completos (apenas dono/membro org). */
export const getRequestRecipients = query({
  args: {
    requestId: v.id("pushNotificationRequests"),
    userId: v.string(),
  },
  handler: async (ctx, { requestId, userId }) => {
    const req = await ctx.db.get(requestId);
    if (!req) return null;

    const event = await ctx.db.get(req.eventId);
    if (!event) return null;

    const isOwner = event.userId === userId;
    const isOrgMember = event.organizationId
      ? !!(await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization_user", (q) =>
            q.eq("organizationId", event.organizationId!).eq("userId", userId),
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .first())
      : false;

    if (!isOwner && !isOrgMember) return null;

    const targetedUserIds = req.targetedUserIds ?? [];
    if (targetedUserIds.length === 0) {
      return {
        targetType: req.targetType,
        targetedUserCount: req.targetedUserCount ?? 0,
        deviceCount: req.deviceCount ?? req.recipientCount ?? 0,
        recipients: [],
      };
    }

    const recipients = await Promise.all(
      targetedUserIds.map(async (uid) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", uid))
          .first();

        const tickets = await ctx.db
          .query("tickets")
          .withIndex("by_user_event", (q) =>
            q.eq("userId", uid).eq("eventId", req.eventId),
          )
          .filter((q) =>
            q.or(
              q.eq(q.field("status"), "valid"),
              q.eq(q.field("status"), "used"),
            ),
          )
          .collect();

        const checkedIn = tickets.some((t) => t.status === "used");
        const deviceCount = user?.oneSignalPlayerIds?.length ?? 0;

        return {
          userId: uid,
          name: user?.name ?? "Usuário",
          email: user?.email ?? null,
          phone: user?.phone ?? null,
          deviceCount,
          hasNotification: deviceCount > 0,
          ticketCount: tickets.length,
          checkedIn,
        };
      }),
    );

    return {
      targetType: req.targetType,
      targetedUserCount: req.targetedUserCount ?? targetedUserIds.length,
      deviceCount: req.deviceCount ?? req.recipientCount ?? 0,
      recipients,
    };
  },
});

/** Envia push notification para todos os admins ativos avisando sobre nova solicitação pendente. */
export const notifyAdminsNewRequest = internalAction({
  args: {
    requestId: v.id("pushNotificationRequests"),
    eventName: v.string(),
    requesterName: v.string(),
  },
  handler: async (ctx, { eventName, requesterName }) => {
    const playerIds: string[] = await ctx.runQuery(
      internal.pushNotifications.getAdminPlayerIds,
      {},
    );

    if (playerIds.length === 0) return;

    await ctx.runAction(internal.notifications.sendPush, {
      playerIds,
      title: "Nova solicitação de notificação push",
      message: `${requesterName} solicitou envio de push para o evento "${eventName}". Acesse o painel para aprovar ou rejeitar.`,
      data: { screen: "notificacoes" },
    });
  },
});
