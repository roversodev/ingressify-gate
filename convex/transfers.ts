import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const createTransferRequest = mutation({
  args: {
    ticketId: v.id("tickets"),
    toUserEmail: v.string(),
    fromUserId: v.string(), // Adicionar o userId do remetente
    transferDayId: v.optional(v.id("eventDays")),
  },
  handler: async (ctx, { ticketId, toUserEmail, fromUserId, transferDayId }) => {
    // Verificar se o ticket pertence ao usuário
    const ticket = await ctx.db.get(ticketId);

    // Verificar se o ticket está válido
    if (!ticket) {
      return {
        success: false,
        errorType: 'TICKET_NOT_FOUND',
        message: 'Ticket não encontrado'
      };
    }

    if (ticket.status !== "valid") {
      return {
        success: false,
        errorType: 'TICKET_INVALID_STATUS',
        message: 'Apenas tickets válidos podem ser transferidos',
        ticket
      };
    }

    // Verificar se o ticket pertence ao usuário informado
    if (ticket.userId !== fromUserId) {
      return {
        success: false,
        errorType: 'TICKET_NOT_OWNED',
        message: 'Você não pode transferir este ticket',
        ticket
      };
    }

    const isPassport = Array.isArray(ticket.passportEligibleDayIds) && ticket.passportEligibleDayIds.length > 0;
    if (transferDayId) {
      if (!isPassport) {
        return {
          success: false,
          errorType: "INVALID_TRANSFER_DAY",
          message: "Este ingresso não permite transferência por dia",
        };
      }
      const eligibleDays = new Set((ticket.passportEligibleDayIds || []).map((id) => String(id)));
      const validatedDays = new Set((ticket.validatedDayIds || []).map((id) => String(id)));
      if (!eligibleDays.has(String(transferDayId))) {
        return {
          success: false,
          errorType: "INVALID_TRANSFER_DAY",
          message: "Dia selecionado não pertence a este passaporte",
        };
      }
      if (validatedDays.has(String(transferDayId))) {
        return {
          success: false,
          errorType: "TRANSFER_DAY_ALREADY_USED",
          message: "Este dia do passaporte já foi utilizado/transferido",
        };
      }
    }

    // Verificar se o evento permite transferências
    const event = await ctx.db.get(ticket.eventId);
    if (!event) {
      return {
        success: false,
        errorType: 'EVENT_NOT_FOUND',
        message: 'Evento não encontrado',
        ticket
      };
    }

    if (event.allowTicketTransfers === false) {
      return {
        success: false,
        errorType: 'TRANSFERS_DISABLED',
        message: 'O organizador desabilitou a transferência de ingressos para este evento',
        ticket,
        event
      };
    }

    // Verificar se já existe transferência pendente
    const existingTransfer = await ctx.db
      .query("transferRequests")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (existingTransfer) {
      return {
        success: false,
        errorType: 'TRANSFER_ALREADY_PENDING',
        message: 'Já existe uma transferência pendente para este ticket',
        ticket,
        event,
        existingTransfer
      };
    }

    // Verificar se o usuário destinatário existe
    const toUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", toUserEmail))
      .first();

    if (!toUser) {
      return {
        success: false,
        errorType: 'RECIPIENT_NOT_FOUND',
        message: 'Usuário destinatário não encontrado. Verifique se o email está correto.',
        ticket,
        event
      };
    }

    if (toUser.userId === fromUserId) {
      return {
        success: false,
        errorType: 'SELF_TRANSFER_NOT_ALLOWED',
        message: 'Você não pode transferir um ticket para si mesmo',
        ticket,
        event
      };
    }

    try {
      // Gerar token único para a transferência
      const transferToken = crypto.randomUUID();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 horas

      // Criar solicitação de transferência
      const transferRequestId = await ctx.db.insert("transferRequests", {
        ticketId,
        fromUserId,
        toUserId: toUser.userId,
        toUserEmail,
        ...(transferDayId ? { transferDayId } : {}),
        transferToken,
        status: "pending",
        expiresAt,
        createdAt: Date.now(),
      });

      // Notificar destinatário via Push
      if (toUser.oneSignalPlayerIds && toUser.oneSignalPlayerIds.length > 0) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendPush, {
          playerIds: toUser.oneSignalPlayerIds,
          title: "Transferência de Ingresso 🎟️",
          message: `Você recebeu uma transferência de ingresso! Toque para ver.`,
          data: { type: "transfer_received", transferRequestId },
        });
      }

      // TODO: Enviar email para o destinatário
      // await sendTransferEmail(toUserEmail, transferToken);

      return {
        success: true,
        transferRequestId,
        transferToken,
        expiresAt,
        ticket,
        event,
        toUser: {
          userId: toUser.userId,
          name: toUser.name,
          email: toUser.email
        }
      };
    } catch (error) {
      console.error("Erro inesperado em createTransferRequest:", error);
      return {
        success: false,
        errorType: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor. Tente novamente.',
        ticket,
        event
      };
    }
  },
});

// Aceitar transferência
export const acceptTransfer = mutation({
  args: {
    transferToken: v.string(),
  },
  handler: async (ctx, { transferToken }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        success: false,
        errorType: 'NOT_AUTHENTICATED',
        message: 'Não autenticado'
      };
    }

    const transferRequest = await ctx.db
      .query("transferRequests")
      .withIndex("by_token", (q) => q.eq("transferToken", transferToken))
      .first();

    if (!transferRequest) {
      return {
        success: false,
        errorType: 'TRANSFER_NOT_FOUND',
        message: 'Solicitação de transferência não encontrada'
      };
    }

    if (transferRequest.status !== "pending") {
      return {
        success: false,
        errorType: 'TRANSFER_NOT_AVAILABLE',
        message: 'Esta transferência não está mais disponível',
        transferRequest
      };
    }

    if (transferRequest.expiresAt < Date.now()) {
      // Marcar como expirada
      await ctx.db.patch(transferRequest._id, { status: "expired" });
      return {
        success: false,
        errorType: 'TRANSFER_EXPIRED',
        message: 'Esta transferência expirou',
        transferRequest
      };
    }

    if (transferRequest.toUserId !== identity.subject) {
      return {
        success: false,
        errorType: 'TRANSFER_NOT_FOR_YOU',
        message: 'Esta transferência não é para você',
        transferRequest
      };
    }

    // Transferir o ticket
    const ticket = await ctx.db.get(transferRequest.ticketId);
    if (!ticket) {
      return {
        success: false,
        errorType: 'TICKET_NOT_FOUND',
        message: 'Ticket não encontrado',
        transferRequest
      };
    }

    try {
      // Atualizar o dono do ticket
      await ctx.db.patch(transferRequest.ticketId, {
        userId: identity.subject,
      });

      // Marcar transferência como aceita
      await ctx.db.patch(transferRequest._id, {
        status: "accepted",
        acceptedAt: Date.now(),
      });

      // Registrar no histórico
      await ctx.db.insert("transferHistory", {
        ticketId: transferRequest.ticketId,
        fromUserId: transferRequest.fromUserId,
        toUserId: identity.subject,
        transferredAt: Date.now(),
        transferRequestId: transferRequest._id,
      });

      // Buscar remetente para notificar
      const fromUser = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", transferRequest.fromUserId))
        .first();

      if (fromUser && fromUser.oneSignalPlayerIds && fromUser.oneSignalPlayerIds.length > 0) {
         await ctx.scheduler.runAfter(0, internal.notifications.sendPush, {
          playerIds: fromUser.oneSignalPlayerIds,
          title: "Transferência Aceita ✅",
          message: `Sua transferência de ingresso foi aceita!`,
          data: { type: "transfer_accepted", transferRequestId: transferRequest._id },
        });
      }

      return { 
        success: true,
        ticket,
        transferRequest
      };
    } catch (error) {
      console.error("Erro inesperado em acceptTransfer:", error);
      return {
        success: false,
        errorType: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor. Tente novamente.',
        transferRequest,
        ticket
      };
    }
  },
});

// Cancelar transferência
export const cancelTransfer = mutation({
  args: {
    transferRequestId: v.id("transferRequests"),
    userId: v.string(),
  },
  handler: async (ctx, { transferRequestId, userId }) => {

    const transferRequest = await ctx.db.get(transferRequestId);
    if (!transferRequest) {
      return {
        success: false,
        errorType: 'TRANSFER_NOT_FOUND',
        message: 'Solicitação não encontrada'
      };
    }

    if (transferRequest.fromUserId !== userId) {
      return {
        success: false,
        errorType: 'TRANSFER_NOT_OWNED',
        message: 'Você não pode cancelar esta transferência',
        transferRequest
      };
    }

    if (transferRequest.status !== "pending") {
      return {
        success: false,
        errorType: 'TRANSFER_CANNOT_BE_CANCELLED',
        message: 'Esta transferência não pode ser cancelada',
        transferRequest
      };
    }

    try {
      await ctx.db.patch(transferRequestId, {
        status: "cancelled",
        cancelledAt: Date.now(),
      });

      // Buscar destinatário para notificar
      const toUser = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", transferRequest.toUserId!))
        .first();

      if (toUser && toUser.oneSignalPlayerIds && toUser.oneSignalPlayerIds.length > 0) {
         await ctx.scheduler.runAfter(0, internal.notifications.sendPush, {
          playerIds: toUser.oneSignalPlayerIds,
          title: "Transferência Cancelada 🚫",
          message: `O remetente cancelou a transferência do ingresso.`,
          data: { type: "transfer_cancelled", transferRequestId },
        });
      }

      return { 
        success: true,
        transferRequest
      };
    } catch (error) {
      console.error("Erro inesperado em cancelTransfer:", error);
      return {
        success: false,
        errorType: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor. Tente novamente.',
        transferRequest
      };
    }
  },
});

// Aceitar transferência (versão simplificada sem autenticação backend)
export const acceptTransferSimple = mutation({
  args: { 
    transferRequestId: v.id("transferRequests"),
    toUserId: v.string()
  },
  handler: async (ctx, { transferRequestId, toUserId }) => {
    const transferRequest = await ctx.db.get(transferRequestId);
    if (!transferRequest) {
      return {
        success: false,
        errorType: 'TRANSFER_NOT_FOUND',
        message: 'Solicitação não encontrada'
      };
    }

    if (transferRequest.status !== "pending") {
      return {
        success: false,
        errorType: 'TRANSFER_NOT_AVAILABLE',
        message: 'Esta transferência não está mais disponível',
        transferRequest
      };
    }

    if (transferRequest.expiresAt < Date.now()) {
      // Marcar como expirada
      await ctx.db.patch(transferRequest._id, { status: "expired" });
      return {
        success: false,
        errorType: 'TRANSFER_EXPIRED',
        message: 'Esta transferência expirou',
        transferRequest
      };
    }

    // Buscar o ticket original
    const originalTicket = await ctx.db.get(transferRequest.ticketId);
    if (!originalTicket) {
      return {
        success: false,
        errorType: 'TICKET_NOT_FOUND',
        message: 'Ticket não encontrado',
        transferRequest
      };
    }

    try {
      // Criar um novo ticket (clone) com novo ID para o destinatário
      const newTicketId = await ctx.db.insert("tickets", {
        eventId: originalTicket.eventId,
        ticketTypeId: originalTicket.ticketTypeId,
        userId: toUserId,
        quantity: originalTicket.quantity,
        unitPrice: originalTicket.unitPrice,
        totalAmount: originalTicket.totalAmount,
        purchasedAt: originalTicket.purchasedAt,
        status: "valid",
        transactionId: originalTicket.transactionId,
        promoterCode: originalTicket.promoterCode,
        couponCode: originalTicket.couponCode,
        discountAmount: originalTicket.discountAmount,
        originalAmount: originalTicket.originalAmount,
        paymentIntentId: originalTicket.paymentIntentId,
      });

      // Marcar o ticket original como cancelado (ou inválido)
      await ctx.db.patch(transferRequest.ticketId, {
        status: "transfered",
      });

      // Marcar transferência como aceita
      await ctx.db.patch(transferRequestId, {
        status: "accepted",
        acceptedAt: Date.now(),
        toUserId: toUserId,
      });

      // Criar histórico com referência ao novo ticket
      await ctx.db.insert("transferHistory", {
        ticketId: newTicketId, // Usar o ID do novo ticket
        fromUserId: transferRequest.fromUserId,
        toUserId: toUserId,
        transferredAt: Date.now(),
        transferRequestId: transferRequestId,
      });

      // Buscar remetente para notificar
      const fromUser = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", transferRequest.fromUserId))
        .first();

      if (fromUser && fromUser.oneSignalPlayerIds && fromUser.oneSignalPlayerIds.length > 0) {
         await ctx.scheduler.runAfter(0, internal.notifications.sendPush, {
          playerIds: fromUser.oneSignalPlayerIds,
          title: "Transferência Aceita ✅",
          message: `Sua transferência de ingresso foi aceita!`,
          data: { type: "transfer_accepted", transferRequestId },
        });
      }

      return { 
        success: true, 
        newTicketId,
        originalTicket,
        transferRequest
      };
    } catch (error) {
      console.error("Erro inesperado em acceptTransferSimple:", error);
      return {
        success: false,
        errorType: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor. Tente novamente.',
        transferRequest,
        originalTicket
      };
    }
  },
});

// Recusar transferência
export const rejectTransfer = mutation({
  args: { transferRequestId: v.id("transferRequests") },
  handler: async (ctx, { transferRequestId }) => {
    const transferRequest = await ctx.db.get(transferRequestId);
    if (!transferRequest) {
      return {
        success: false,
        errorType: 'TRANSFER_NOT_FOUND',
        message: 'Solicitação não encontrada'
      };
    }

    if (transferRequest.status !== "pending") {
      return {
        success: false,
        errorType: 'TRANSFER_CANNOT_BE_REJECTED',
        message: 'Esta transferência não pode ser recusada',
        transferRequest
      };
    }

    try {
      await ctx.db.patch(transferRequestId, {
        status: "cancelled",
        cancelledAt: Date.now(),
      });

      // Buscar remetente para notificar
      const fromUser = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", transferRequest.fromUserId))
        .first();

      if (fromUser && fromUser.oneSignalPlayerIds && fromUser.oneSignalPlayerIds.length > 0) {
         await ctx.scheduler.runAfter(0, internal.notifications.sendPush, {
          playerIds: fromUser.oneSignalPlayerIds,
          title: "Transferência Recusada ❌",
          message: `Sua transferência de ingresso foi recusada pelo destinatário.`,
          data: { type: "transfer_rejected", transferRequestId },
        });
      }

      return { 
        success: true,
        transferRequest
      };
    } catch (error) {
      console.error("Erro inesperado em rejectTransfer:", error);
      return {
        success: false,
        errorType: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor. Tente novamente.',
        transferRequest
      };
    }
  },
});

// Listar transferências do usuário
export const getUserTransfers = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const sentTransfers = await ctx.db
      .query("transferRequests")
      .withIndex("by_from_user", (q) => q.eq("fromUserId", userId))
      .collect();

    const receivedTransfers = await ctx.db
      .query("transferRequests")
      .withIndex("by_to_email", (q) => q.eq("toUserEmail", "")) // Precisamos ajustar isso
      .collect();

    return { sent: sentTransfers, received: receivedTransfers };
  },
});

// Verificar transferência por token
export const getTransferByToken = query({
  args: { transferToken: v.string() },
  handler: async (ctx, { transferToken }) => {
    const transferRequest = await ctx.db
      .query("transferRequests")
      .withIndex("by_token", (q) => q.eq("transferToken", transferToken))
      .first();

    if (!transferRequest) return null;

    const ticket = await ctx.db.get(transferRequest.ticketId);
    const event = ticket ? await ctx.db.get(ticket.eventId) : null;
    const fromUser = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", transferRequest.fromUserId))
      .first();

    return {
      ...transferRequest,
      ticket,
      event,
      fromUser,
    };
  },
});

// Buscar transferências pendentes recebidas por um usuário
export const getPendingReceivedTransfers = query({
  args: { userEmail: v.string() },
  handler: async (ctx, { userEmail }) => {
    const pendingTransfers = await ctx.db
      .query("transferRequests")
      .withIndex("by_to_email", (q) => q.eq("toUserEmail", userEmail))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // Buscar detalhes dos tickets e eventos para cada transferência
    const transfersWithDetails = await Promise.all(
      pendingTransfers.map(async (transfer) => {
        const ticket = await ctx.db.get(transfer.ticketId);
        const event = ticket ? await ctx.db.get(ticket.eventId) : null;
        const fromUser = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", transfer.fromUserId))
          .first();

        return {
          ...transfer,
          ticket,
          event,
          fromUser,
        };
      })
    );

    return transfersWithDetails;
  },
});


// Verificar se há transferência pendente para um ticket
export const getPendingTransferForTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    return await ctx.db
      .query("transferRequests")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
  },
});

// Buscar transferência aceita para um ticket (para saber para quem foi transferido)
export const getAcceptedTransferForTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const transferRequest = await ctx.db
      .query("transferRequests")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .first();

    if (!transferRequest) return null;

    // Buscar destinatário
    const toUser = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", transferRequest.toUserId!))
      .first();

    return {
      ...transferRequest,
      toUserName: toUser?.name || transferRequest.toUserEmail || "Usuário desconhecido",
      toUserEmail: transferRequest.toUserEmail,
    };
  },
});

// Buscar histórico de transferência para um ticket
export const getTransferHistoryForTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    // Tenta encontrar no histórico (para o destinatário, onde ticketId é o novo ticket)
    let history = await ctx.db
      .query("transferHistory")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .first();
    
    // Se não encontrou no histórico, pode ser que este seja o ticket original (remetente)
    // Nesse caso, procuramos na tabela de solicitações de transferência
    if (!history) {
      const request = await ctx.db
        .query("transferRequests")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
        .filter((q) => q.eq(q.field("status"), "accepted"))
        .first();

      if (request) {
        // Simulamos o objeto de histórico com os dados da solicitação
        history = {
          _id: request._id as unknown as Id<"transferHistory">, // Mock ID
          _creationTime: request._creationTime,
          ticketId: request.ticketId,
          fromUserId: request.fromUserId,
          toUserId: request.toUserId!,
          transferredAt: request.acceptedAt!,
          transferRequestId: request._id,
        };
      }
    }

    if (!history) return null;
    
    // Buscar informações do usuário que fez a transferência
    const fromUser = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", history.fromUserId))
      .first();

    // Buscar informações do usuário que recebeu a transferência
    const toUser = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", history.toUserId))
      .first();
    
    return {
      ...history,
      fromUserName: fromUser?.name || "Usuário desconhecido",
      toUserEmail: toUser?.email || "Email desconhecido"
    };
  },
});

// Nova função para estatísticas de transferências do evento
export const getEventTransferStats = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Buscar todos os tickets do evento
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    
    const ticketIds = tickets.map(t => t._id);
    
    // Buscar transferências pendentes
    const pendingTransfers = await ctx.db
      .query("transferRequests")
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
    
    const eventPendingTransfers = pendingTransfers.filter(t => 
      ticketIds.includes(t.ticketId)
    );
    
    // Buscar histórico de transferências
    const transferHistory = await ctx.db
      .query("transferHistory")
      .collect();
    
    const eventTransferHistory = transferHistory.filter(t => 
      ticketIds.includes(t.ticketId)
    );
    
    // Estatísticas por período (últimos 30 dias)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentTransfers = eventTransferHistory.filter(t => 
      t._creationTime >= thirtyDaysAgo
    );
    
    return {
      totalTransfers: eventTransferHistory.length,
      pendingTransfers: eventPendingTransfers.length,
      recentTransfers: recentTransfers.length,
      transferRate: tickets.length > 0 ? (eventTransferHistory.length / tickets.length) * 100 : 0
    };
  }
});

// Nova função para detalhes de transferências do evento
export const getEventTransferDetails = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Buscar todos os tickets do evento
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    
    const ticketIds = tickets.map(t => t._id);
    
    // Buscar transferências pendentes com detalhes
    const pendingTransfers = await ctx.db
      .query("transferRequests")
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
    
    const eventPendingTransfers = await Promise.all(
      pendingTransfers
        .filter(t => ticketIds.includes(t.ticketId))
        .map(async (transfer) => {
          const ticket = await ctx.db.get(transfer.ticketId);
          const ticketType = ticket ? await ctx.db.get(ticket.ticketTypeId) : null;
          const fromUser = await ctx.db
            .query("users")
            .withIndex("by_user_id", (q) => q.eq("userId", transfer.fromUserId))
            .first();
          
          return {
            transferId: transfer._id,
            fromUserName: fromUser?.name || "Usuário desconhecido",
            toUserEmail: transfer.toUserEmail,
            ticketType: ticketType?.name || "Tipo desconhecido",
            createdAt: transfer._creationTime,
            expiresAt: transfer.expiresAt
          };
        })
    );
    
    // Buscar histórico de transferências com detalhes
    const transferHistory = await ctx.db
      .query("transferHistory")
      .collect();
    
    const eventTransferHistory = await Promise.all(
      transferHistory
        .filter(t => ticketIds.includes(t.ticketId))
        .map(async (transfer) => {
          const ticket = await ctx.db.get(transfer.ticketId);
          const ticketType = ticket ? await ctx.db.get(ticket.ticketTypeId) : null;
          const fromUser = await ctx.db
            .query("users")
            .withIndex("by_user_id", (q) => q.eq("userId", transfer.fromUserId))
            .first();
          const toUser = await ctx.db
            .query("users")
            .withIndex("by_user_id", (q) => q.eq("userId", transfer.toUserId))
            .first();
          
          return {
            transferId: transfer._id,
            fromUserName: fromUser?.name || "Usuário desconhecido",
            toUserName: toUser?.name || "Usuário desconhecido",
            ticketType: ticketType?.name || "Tipo desconhecido",
            transferredAt: transfer._creationTime
          };
        })
    );
    
    return {
      pendingTransfers: eventPendingTransfers,
      completedTransfers: eventTransferHistory.sort((a, b) => b.transferredAt - a.transferredAt)
    };
  }
});

// Para passaporte: listar dias transferidos (aceitos) e destinatários
export const getAcceptedTransfersForTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const accepted = await ctx.db
      .query("transferRequests")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    // Mantém apenas transferências por dia (passaporte)
    return accepted
      .filter((r) => !!r.transferDayId)
      .map((r) => ({
        transferDayId: r.transferDayId!,
        toUserEmail: r.toUserEmail,
        acceptedAt: r.acceptedAt ?? null,
      }));
  },
});