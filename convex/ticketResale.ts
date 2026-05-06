import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Taxa padrão da plataforma por revenda — altere conforme necessário
export const RESALE_FEE_PERCENTAGE = 0.10;

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getResaleListingByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const listing = await ctx.db
      .query("ticketResaleListings")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!listing) return null;

    const ticket = await ctx.db.get(listing.ticketId);
    const event = ticket ? await ctx.db.get(ticket.eventId) : null;
    const ticketType = ticket ? await ctx.db.get(ticket.ticketTypeId) : null;
    const seller = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", listing.sellerId))
      .first();

    let ticketLot = null;
    let eventDayDoc = null;
    if (ticketType?.lotId) {
      ticketLot = await ctx.db.get(ticketType.lotId);
    }
    if (ticketType?.dayId) {
      eventDayDoc = await ctx.db.get(ticketType.dayId);
    }

    let passportDays:
      | { name: string; date: number; startTime?: number }[]
      | undefined;
    if (
      ticket?.passportEligibleDayIds &&
      ticket.passportEligibleDayIds.length > 0
    ) {
      const dayDocs = await Promise.all(
        ticket.passportEligibleDayIds.map((id) => ctx.db.get(id))
      );
      passportDays = [];
      for (const d of dayDocs) {
        if (d) {
          passportDays.push({
            name:
              (d.name && d.name.trim()) ||
              new Date(d.date).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }),
            date: d.date,
            startTime: d.startTime,
          });
        }
      }
      passportDays.sort((a, b) => a.date - b.date);
    }

    return {
      ...listing,
      ticket,
      event,
      ticketType,
      seller,
      ticketLot,
      eventDay: eventDayDoc,
      passportDays,
    };
  },
});

export const getListingForTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    return ctx.db
      .query("ticketResaleListings")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .order("desc")
      .first();
  },
});

export const getSellerResaleListings = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const listings = await ctx.db
      .query("ticketResaleListings")
      .withIndex("by_seller", (q) => q.eq("sellerId", userId))
      .order("desc")
      .collect();

    return Promise.all(
      listings.map(async (l) => {
        const ticket = await ctx.db.get(l.ticketId);
        const event = ticket ? await ctx.db.get(ticket.eventId) : null;
        const ticketType = ticket ? await ctx.db.get(ticket.ticketTypeId) : null;
        return { ...l, event, ticketType };
      })
    );
  },
});

export const getEventResaleListings = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const listings = await ctx.db
      .query("ticketResaleListings")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .order("desc")
      .collect();

    return Promise.all(
      listings.map(async (l) => {
        const ticketType = await ctx.db.get(
          (await ctx.db.get(l.ticketId))?.ticketTypeId as any
        );
        const seller = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", l.sellerId))
          .first();
        return { ...l, ticketType, sellerEmail: seller?.email };
      })
    );
  },
});

export const getAdminResaleListings = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    let q = ctx.db.query("ticketResaleListings").order("desc");
    const listings = await (status
      ? ctx.db
          .query("ticketResaleListings")
          .withIndex("by_status", (q2) => q2.eq("status", status as any))
          .order("desc")
          .take(limit ?? 100)
      : q.take(limit ?? 100));

    return Promise.all(
      listings.map(async (l) => {
        const ticket = await ctx.db.get(l.ticketId);
        const event = ticket ? await ctx.db.get(ticket.eventId) : null;
        const ticketType = ticket ? await ctx.db.get(ticket.ticketTypeId) : null;
        return { ...l, event, ticketType };
      })
    );
  },
});

export const getSellerResaleBalance = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();
    return user?.resaleBalance ?? 0;
  },
});

export const getAdminResaleWithdrawals = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    const withdrawals = await (status
      ? ctx.db
          .query("resaleWithdrawals")
          .withIndex("by_status", (q) => q.eq("status", status as any))
          .order("desc")
          .collect()
      : ctx.db
          .query("resaleWithdrawals")
          .withIndex("by_requested_at")
          .order("desc")
          .collect());

    return Promise.all(
      withdrawals.map(async (w) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", w.userId))
          .first();
        return { ...w, userName: user?.name, userEmail: user?.email };
      })
    );
  },
});

export const getMyResaleWithdrawals = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("resaleWithdrawals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getResaleStatsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const all = await ctx.db
      .query("ticketResaleListings")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const active = all.filter((l) => l.status === "active").length;
    const sold = all.filter((l) => l.status === "sold").length;
    const totalRevenue = all
      .filter((l) => l.status === "sold")
      .reduce((sum, l) => sum + l.resalePrice, 0);
    const platformEarnings = all
      .filter((l) => l.status === "sold")
      .reduce((sum, l) => sum + l.platformFeeAmount, 0);

    return { active, sold, total: all.length, totalRevenue, platformEarnings };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createResaleListing = mutation({
  args: {
    ticketId: v.id("tickets"),
    sellerId: v.string(),
    resalePrice: v.number(),
  },
  handler: async (ctx, { ticketId, sellerId, resalePrice }) => {
    if (resalePrice <= 0) {
      return { success: false, errorType: "INVALID_PRICE", message: "Preço deve ser maior que zero" };
    }

    const ticket = await ctx.db.get(ticketId);
    if (!ticket) return { success: false, errorType: "TICKET_NOT_FOUND", message: "Ingresso não encontrado" };
    if (ticket.userId !== sellerId) return { success: false, errorType: "NOT_OWNER", message: "Você não é o dono deste ingresso" };
    if (ticket.status !== "valid") return { success: false, errorType: "INVALID_STATUS", message: "Apenas ingressos válidos podem ser revendidos" };
    if (ticket.isListedForResale) return { success: false, errorType: "ALREADY_LISTED", message: "Este ingresso já está sendo revendido" };

    const event = await ctx.db.get(ticket.eventId);
    if (!event) return { success: false, errorType: "EVENT_NOT_FOUND", message: "Evento não encontrado" };
    if (event.allowTicketResale === false) return { success: false, errorType: "RESALE_DISABLED", message: "O produtor desativou a revenda para este evento" };
    if (event.eventEndDate < Date.now()) return { success: false, errorType: "EVENT_ENDED", message: "O evento já encerrou" };

    const existingActive = await ctx.db
      .query("transferRequests")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (existingActive) return { success: false, errorType: "TRANSFER_PENDING", message: "Há uma transferência pendente para este ingresso" };

    const seller = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", sellerId))
      .first();

    if (!seller) {
      return {
        success: false,
        errorType: "SELLER_PROFILE_MISSING",
        message: "Complete seu cadastro na Ingressify antes de colocar o ingresso à venda.",
      };
    }

    const feeAmount = parseFloat((resalePrice * RESALE_FEE_PERCENTAGE).toFixed(2));
    const sellerReceives = parseFloat((resalePrice - feeAmount).toFixed(2));
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hora

    const listingId = await ctx.db.insert("ticketResaleListings", {
      ticketId,
      eventId: ticket.eventId,
      sellerId,
      sellerName: seller.name,
      resalePrice,
      platformFeePercentage: RESALE_FEE_PERCENTAGE,
      platformFeeAmount: feeAmount,
      sellerReceives,
      status: "active",
      token,
      createdAt: Date.now(),
      expiresAt,
    });

    await ctx.db.patch(ticketId, { isListedForResale: true });

    // Auto-expire após 1 hora
    await ctx.scheduler.runAt(expiresAt, internal.ticketResale.expireListingInternal, { listingId });

    return { success: true, listingId, token, expiresAt };
  },
});

export const cancelResaleListing = mutation({
  args: { listingId: v.id("ticketResaleListings"), userId: v.string() },
  handler: async (ctx, { listingId, userId }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing) return { success: false, message: "Listing não encontrado" };
    if (listing.sellerId !== userId) return { success: false, message: "Não autorizado" };
    if (listing.status !== "active") return { success: false, message: "Listing não está ativo" };

    await ctx.db.patch(listingId, { status: "cancelled" });
    await ctx.db.patch(listing.ticketId, { isListedForResale: false });

    return { success: true };
  },
});

export const completeResalePurchase = mutation({
  args: {
    token: v.string(),
    buyerId: v.optional(v.string()),
    buyerEmail: v.string(),
    buyerName: v.string(),
    transactionId: v.string(),
    /** Valor líquido retornado pelo Mercado Pago no pagamento (ex.: transaction_details.net_received_amount) */
    netReceivedAmount: v.optional(v.number()),
  },
  handler: async (ctx, { token, buyerId, buyerEmail, buyerName, transactionId, netReceivedAmount }) => {
    const listing = await ctx.db
      .query("ticketResaleListings")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!listing) return { success: false, errorType: "NOT_FOUND", message: "Listing não encontrado" };
    if (listing.status === "refunded") {
      return {
        success: false,
        errorType: "REFUNDED",
        message: "Esta revenda foi reembolsada pelo Mercado Pago.",
      };
    }

    // Idempotência: webhook + polling podem chamar os dois — mesmo MP payment id
    if (listing.status === "sold") {
      if (listing.transactionId === transactionId) {
        if (netReceivedAmount !== undefined) {
          await ctx.db.patch(listing._id, { netReceivedAmount });
        }
        return {
          success: true,
          newTicketId: listing.newTicketId,
          idempotent: true,
        };
      }
      return {
        success: false,
        errorType: "ALREADY_SOLD",
        message: "Este ingresso já foi vendido",
      };
    }

    if (listing.status !== "active")
      return { success: false, errorType: "NOT_AVAILABLE", message: "Este ingresso não está mais disponível para revenda" };
    if (listing.expiresAt < Date.now()) {
      await ctx.db.patch(listing._id, { status: "expired" });
      await ctx.db.patch(listing.ticketId, { isListedForResale: false });
      return { success: false, errorType: "EXPIRED", message: "O link de revenda expirou" };
    }

    const originalTicket = await ctx.db.get(listing.ticketId);
    if (!originalTicket) return { success: false, errorType: "TICKET_NOT_FOUND", message: "Ingresso não encontrado" };

    // Criar novo ingresso para o comprador
    const newTicketId = await ctx.db.insert("tickets", {
      eventId: originalTicket.eventId,
      ticketTypeId: originalTicket.ticketTypeId,
      userId: buyerId ?? `pending:${buyerEmail}`,
      quantity: originalTicket.quantity,
      unitPrice: listing.resalePrice,
      totalAmount: listing.resalePrice,
      purchasedAt: Date.now(),
      status: "valid",
      transactionId,
      acquiredViaResale: true,
      passportEligibleDayIds: originalTicket.passportEligibleDayIds,
      passportUsesRemaining: originalTicket.passportUsesRemaining,
    });

    // Marcar ingresso original como transferido
    await ctx.db.patch(listing.ticketId, {
      status: "transfered",
      isListedForResale: false,
    });

    // Atualizar listing
    await ctx.db.patch(listing._id, {
      status: "sold",
      soldAt: Date.now(),
      buyerId: buyerId ?? undefined,
      buyerEmail,
      buyerName,
      transactionId,
      newTicketId,
      ...(netReceivedAmount !== undefined ? { netReceivedAmount } : {}),
    });

    // Creditar saldo para o vendedor (mesmo userId do ingresso original)
    const seller = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", listing.sellerId))
      .first();

    if (seller) {
      const currentBalance = seller.resaleBalance ?? 0;
      await ctx.db.patch(seller._id, {
        resaleBalance: parseFloat((currentBalance + listing.sellerReceives).toFixed(2)),
      });

      if (seller.oneSignalPlayerIds?.length) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendPush, {
          playerIds: seller.oneSignalPlayerIds,
          title: "Ingresso vendido! 🎉",
          message: `Seu ingresso foi vendido por R$ ${listing.resalePrice.toFixed(2)}. Saldo disponível: R$ ${(currentBalance + listing.sellerReceives).toFixed(2)}.`,
          data: { type: "resale_sold", listingId: listing._id },
        });
      }
    }

    // Push do comprador fica fora do bloco do vendedor (sempre que houver buyerId)
    if (buyerId) {
      const buyer = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", buyerId))
        .first();
      if (buyer?.oneSignalPlayerIds?.length) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendPush, {
          playerIds: buyer.oneSignalPlayerIds,
          title: "Ingresso adquirido! 🎟️",
          message: `Você adquiriu um ingresso via revenda. Confira em Meus Ingressos.`,
          data: { type: "resale_purchased", ticketId: newTicketId },
        });
      }
    }

    return { success: true, newTicketId };
  },
});

/**
 * Mercado Pago notificou reembolso/chargeback de um pagamento de revenda — desfaz efeitos:
 * ingresso do comprador → refunded, original do vendedor → válido, estorna sellerReceives do saldo, listing → refunded.
 */
export const reverseResaleAfterMercadoPagoRefund = mutation({
  args: { mercadoPagoPaymentId: v.string() },
  handler: async (ctx, { mercadoPagoPaymentId }) => {
    const mpId = mercadoPagoPaymentId.trim();
    if (!mpId) return { ok: false as const, reason: "EMPTY_PAYMENT_ID" as const };

    const listing = await ctx.db
      .query("ticketResaleListings")
      .withIndex("by_transaction", (q) => q.eq("transactionId", mpId))
      .first();

    if (!listing) return { ok: false as const, reason: "LISTING_NOT_FOUND" as const };

    if (listing.status === "refunded") {
      return { ok: true as const, idempotent: true as const, listingId: listing._id };
    }

    if (listing.status !== "sold") {
      return {
        ok: false as const,
        reason: "NOT_COMPLETED_SALE" as const,
        listingStatus: listing.status,
      };
    }

    const now = Date.now();

    if (listing.newTicketId) {
      const buyerTicket = await ctx.db.get(listing.newTicketId);
      if (buyerTicket) {
        await ctx.db.patch(listing.newTicketId, { status: "refunded" });
      }
    }

    await ctx.db.patch(listing.ticketId, {
      status: "valid",
      isListedForResale: false,
    });

    const seller = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", listing.sellerId))
      .first();

    if (seller) {
      const next = parseFloat(((seller.resaleBalance ?? 0) - listing.sellerReceives).toFixed(2));
      await ctx.db.patch(seller._id, { resaleBalance: next });
    }

    await ctx.db.patch(listing._id, {
      status: "refunded",
      refundedAt: now,
    });

    return { ok: true as const, listingId: listing._id };
  },
});

export const requestResaleWithdrawal = mutation({
  args: {
    userId: v.string(),
    amount: v.number(),
    pixKey: v.object({
      keyType: v.union(
        v.literal("cpf"),
        v.literal("cnpj"),
        v.literal("email"),
        v.literal("phone"),
        v.literal("random")
      ),
      key: v.string(),
    }),
  },
  handler: async (ctx, { userId, amount, pixKey }) => {
    if (amount <= 0) return { success: false, message: "Valor inválido" };

    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (!user) return { success: false, message: "Usuário não encontrado" };

    const balance = user.resaleBalance ?? 0;
    if (amount > balance) return { success: false, message: "Saldo insuficiente" };

    // Reservar saldo
    await ctx.db.patch(user._id, {
      resaleBalance: parseFloat((balance - amount).toFixed(2)),
    });

    const withdrawalId = await ctx.db.insert("resaleWithdrawals", {
      userId,
      amount,
      pixKey,
      status: "pending",
      requestedAt: Date.now(),
    });

    // Notificar admins via push (busca admins ativos)
    const admins = await ctx.db.query("platformAdmins").collect();
    const adminUserIds = admins.filter((a) => a.isActive).map((a) => a.userId);
    for (const adminId of adminUserIds) {
      const adminUser = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", adminId))
        .first();
      if (adminUser?.oneSignalPlayerIds?.length) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendPush, {
          playerIds: adminUser.oneSignalPlayerIds,
          title: "Solicitação de saque de revenda",
          message: `${user.name} solicitou saque de R$ ${amount.toFixed(2)} do saldo de revenda.`,
          data: { type: "resale_withdrawal_requested", withdrawalId },
        });
      }
    }

    return { success: true, withdrawalId };
  },
});

export const updateResaleWithdrawalStatus = mutation({
  args: {
    withdrawalId: v.id("resaleWithdrawals"),
    status: v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    adminNotes: v.optional(v.string()),
    transactionId: v.optional(v.string()),
  },
  handler: async (ctx, { withdrawalId, status, adminNotes, transactionId }) => {
    const withdrawal = await ctx.db.get(withdrawalId);
    if (!withdrawal) return { success: false, message: "Saque não encontrado" };

    const updates: any = { status };
    if (adminNotes) updates.adminNotes = adminNotes;
    if (transactionId) updates.transactionId = transactionId;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      updates.processedAt = Date.now();
    }

    // Se falhou ou cancelado, devolver saldo
    if (status === "failed" || status === "cancelled") {
      const user = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", withdrawal.userId))
        .first();
      if (user) {
        await ctx.db.patch(user._id, {
          resaleBalance: parseFloat(((user.resaleBalance ?? 0) + withdrawal.amount).toFixed(2)),
        });
      }
    }

    await ctx.db.patch(withdrawalId, updates);

    // Notificar usuário
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", withdrawal.userId))
      .first();

    if (user?.oneSignalPlayerIds?.length) {
      const msgs: Record<string, { title: string; message: string }> = {
        completed: {
          title: "Saque realizado! 💸",
          message: `Seu saque de R$ ${withdrawal.amount.toFixed(2)} foi processado com sucesso.`,
        },
        failed: {
          title: "Saque falhou",
          message: `Não foi possível processar seu saque de R$ ${withdrawal.amount.toFixed(2)}. O valor foi devolvido ao seu saldo.`,
        },
        cancelled: {
          title: "Saque cancelado",
          message: `Seu saque de R$ ${withdrawal.amount.toFixed(2)} foi cancelado. O valor foi devolvido ao seu saldo.`,
        },
        processing: {
          title: "Saque em processamento",
          message: `Seu saque de R$ ${withdrawal.amount.toFixed(2)} está sendo processado.`,
        },
      };
      const msg = msgs[status];
      if (msg) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendPush, {
          playerIds: user.oneSignalPlayerIds,
          ...msg,
          data: { type: "resale_withdrawal_update", withdrawalId, status },
        });
      }
    }

    return { success: true };
  },
});

// ─── Internal ─────────────────────────────────────────────────────────────────

export const expireListingInternal = internalMutation({
  args: { listingId: v.id("ticketResaleListings") },
  handler: async (ctx, { listingId }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing || listing.status !== "active") return;
    await ctx.db.patch(listingId, { status: "expired" });
    await ctx.db.patch(listing.ticketId, { isListedForResale: false });

    // Notificar vendedor
    const seller = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", listing.sellerId))
      .first();
    if (seller?.oneSignalPlayerIds?.length) {
      await ctx.scheduler.runAfter(0, internal.notifications.sendPush, {
        playerIds: seller.oneSignalPlayerIds,
        title: "Link de revenda expirado",
        message: "Seu link de revenda expirou após 1 hora sem compra. Você pode criar um novo.",
        data: { type: "resale_expired", listingId },
      });
    }
  },
});
