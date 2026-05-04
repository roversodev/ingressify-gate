import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  normalizeCourtesyEmail,
  PENDING_COURTESY_USER_ID,
} from "./courtesyHelpers";
import { incrementCouponUsageInCtx } from "./coupons";

/** Registra um uso de cupom por transação (idempotente via metadata.couponUsageRecorded). */
async function recordCouponUseOnceForTransaction(
  ctx: MutationCtx,
  transactionId: string
) {
  const tx = await ctx.db
    .query("transactions")
    .withIndex("by_transactionId", (q) => q.eq("transactionId", transactionId))
    .first();
  if (!tx?.eventId) return;

  const meta = (tx.metadata || {}) as Record<string, any>;
  if (meta.couponUsageRecorded === true) return;

  const raw = meta.couponCode;
  if (raw == null || String(raw).trim() === "") return;

  const did = await incrementCouponUsageInCtx(ctx, {
    eventId: tx.eventId,
    couponCode: String(raw).trim(),
  });

  if (!did) return;

  const latest = await ctx.db.get(tx._id);
  await ctx.db.patch(tx._id, {
    metadata: {
      ...(latest?.metadata || {}),
      couponUsageRecorded: true,
    },
  });
}

/** Chamada por webhooks ou suporte para conciliar uso de cupom em transações já emitidas. */
export const recordCouponUseForTransactionIfNeeded = mutation({
  args: { transactionId: v.string() },
  handler: async (ctx, { transactionId }) => {
    await recordCouponUseOnceForTransaction(ctx, transactionId);
    return { ok: true as const };
  },
});

async function getEventAndValidator(ctx: any, eventId: Id<"events">, userId: string) {
  const event = await ctx.db.get(eventId);
  if (!event) {
    return {
      ok: false as const,
      errorType: "EVENT_NOT_FOUND" as const,
      message: "Evento não encontrado",
    };
  }

  const isOwner = event.userId === userId;
  let validatorDoc: any = null;

  if (!isOwner) {
    validatorDoc = await ctx.db
      .query("ticketValidators")
      .withIndex("by_event_user", (q: any) => q.eq("eventId", eventId).eq("userId", userId))
      .filter((q: any) => q.eq(q.field("status"), "accepted"))
      .first();

    if (!validatorDoc) {
      return {
        ok: false as const,
        errorType: "PERMISSION_DENIED" as const,
        message: "Você não tem permissão para validar ingressos deste evento",
      };
    }
  }

  return {
    ok: true as const,
    event,
    isOwner,
    validatorDoc,
  };
}

async function getTicketMeta(ctx: any, ticket: any) {
  const ticketType = await ctx.db.get(ticket.ticketTypeId);
  if (!ticketType) {
    return {
      ok: false as const,
      errorType: "TICKET_TYPE_NOT_FOUND" as const,
      message: "Tipo de ingresso não encontrado",
    };
  }

  const day = ticketType.dayId ? await ctx.db.get(ticketType.dayId) : null;
  const lot = ticketType.lotId ? await ctx.db.get(ticketType.lotId) : null;

  return {
    ok: true as const,
    ticketType,
    day,
    lot,
  };
}

function computeRemainingUnits(ticket: any) {
  const usedQuantity = ticket.status === "used" ? ticket.quantity : 0;
  const remaining = ticket.status === "used" ? 0 : ticket.quantity;
  return { usedQuantity, remaining };
}

function isEmailish(value: string) {
  return value.includes("@") && value.includes(".");
}

export const getUserTicketForEvent = query({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
  },
  handler: async (ctx, { eventId, userId }) => {
    const ticket = await ctx.db
      .query("tickets")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", userId).eq("eventId", eventId)
      )
      .first();

    return ticket;
  },
});

export const getTicketWithDetails = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) return null;

    const event = await ctx.db.get(ticket.eventId);
    const ticketType = await ctx.db.get(ticket.ticketTypeId);

    return {
      ...ticket,
      event,
      ticketType,
    };
  },
});

export const getValidPaidTicketsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used"))
      )
      .collect();
  },
});

export const getRecentBuyerIdsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used"))
      )
      .order("desc")
      .take(30);

    const seen = new Set<string>();
    const uniqueIds: string[] = [];
    for (const ticket of tickets) {
      if (
        ticket.userId &&
        ticket.userId !== "pending" &&
        ticket.userId !== PENDING_COURTESY_USER_ID &&
        !seen.has(ticket.userId)
      ) {
        seen.add(ticket.userId);
        uniqueIds.push(ticket.userId);
      }
      if (uniqueIds.length >= 5) break;
    }
    return uniqueIds;
  },
});

export const getValidTicketsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("status"), "valid"))
      .collect();
  },
});

export const updateTicketStatus = mutation({
  args: {
    ticketId: v.id("tickets"),
    status: v.union(
      v.literal("valid"),
      v.literal("used"),
      v.literal("refunded"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, { ticketId, status }) => {
    await ctx.db.patch(ticketId, { status });
  },
});

export const validateTicket = mutation({
  args: {
    ticketId: v.id("tickets"),
    eventId: v.id("events"),
    userId: v.string()
  },
  handler: async (ctx, { ticketId, eventId, userId }) => {
    try {
      const event = await ctx.db.get(eventId);
      if (!event) {
        return {
          success: false,
          errorType: 'EVENT_NOT_FOUND',
          message: 'Evento não encontrado'
        };
      }

      // Verificar se o usuário é o dono do evento ou um validador autorizado
      const isOwner = event.userId === userId;
      let validatorDoc: any = null;
      
      if (!isOwner) {
        // Verificar se o usuário é um validador aceito
        validatorDoc = await ctx.db
          .query("ticketValidators")
          .withIndex("by_event_user", (q) => q.eq("eventId", eventId).eq("userId", userId))
          .filter((q) => q.eq(q.field("status"), "accepted"))
          .first();

        if (!validatorDoc) {
          return {
            success: false,
            errorType: 'PERMISSION_DENIED',
            message: 'Você não tem permissão para validar ingressos deste evento'
          };
        }
      }

      const ticket = await ctx.db.get(ticketId);
      if (!ticket) {
        return {
          success: false,
          errorType: 'TICKET_NOT_FOUND',
          message: 'Ingresso não encontrado'
        };
      }
      
      if (ticket.eventId !== eventId) {
        return {
          success: false,
          errorType: 'EVENT_MISMATCH',
          message: 'Este ingresso não pertence a este evento',
          ticket,
          event
        };
      }
      
      // Buscar informações do tipo de ingresso
      const ticketType = await ctx.db.get(ticket.ticketTypeId);
      const isPassport = !!ticketType?.isPassport;

      // Aplicar permissões de escopo do validador (dias, lotes, tipos)
      if (!isOwner && validatorDoc) {
        const allowedDayIds = (validatorDoc as any).allowedDayIds || [];
        const allowedLotIds = (validatorDoc as any).allowedLotIds || [];
        const allowedTicketTypeIds = (validatorDoc as any).allowedTicketTypeIds || [];

        const hasRestrictions =
          allowedDayIds.length > 0 ||
          allowedLotIds.length > 0 ||
          allowedTicketTypeIds.length > 0;

        if (hasRestrictions) {
          const ticketDayId = (ticketType as any)?.dayId;
          const ticketLotId = (ticketType as any)?.lotId;
          const ticketTypeId = ticket.ticketTypeId;

          const dayOk =
            allowedDayIds.length === 0 ||
            isPassport || // Passaporte ignora trava de dia fixo do ticketType, pois ele vale para vários
            (ticketDayId && allowedDayIds.some((id: any) => String(id) === String(ticketDayId)));

          const lotOk =
            allowedLotIds.length === 0 ||
            (ticketLotId && allowedLotIds.some((id: any) => id === ticketLotId));

          const typeOk =
            allowedTicketTypeIds.length === 0 ||
            allowedTicketTypeIds.some((id: any) => id === ticketTypeId);

          if (!dayOk || !lotOk || !typeOk) {
            return {
              success: false,
              errorType: 'PERMISSION_DENIED',
              message: 'Você não tem permissão para validar este ingresso',
              ticket,
              event,
              ticketType,
            };
          }
        }
      }
      
      // Verificar se há transferência pendente
      const pendingTransfer = await ctx.db
        .query("transferRequests")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .first();
      
      if (pendingTransfer) {
        return {
          success: false,
          errorType: 'TRANSFER_PENDING',
          message: 'Ingresso em processo de transferência',
          ticket,
          event
        };
      }
      
      // Verificar status do ingresso
      if (ticket.status === "used") {
        return {
          success: false,
          errorType: 'ALREADY_USED',
          message: 'Ingresso já utilizado',
          ticket,
          event,
          ticketType
        };
      }
      
      if (ticket.status === "refunded") {
        return {
          success: false,
          errorType: 'REFUNDED',
          message: 'Ingresso reembolsado',
          ticket,
          event
        };
      }
      
      if (ticket.status === "cancelled") {
        return {
          success: false,
          errorType: 'CANCELLED',
          message: 'Ingresso cancelado',
          ticket,
          event
        };
      }
      
      if (ticket.status === "transfered") {
        return {
          success: false,
          errorType: 'TRANSFERRED',
          message: 'Ingresso transferido',
          ticket,
          event
        };
      }
      
      if (ticket.status !== "valid") {
        return {
          success: false,
          errorType: 'INVALID_STATUS',
          message: 'Ingresso inválido',
          ticket,
          event
        };
      }
      
      if (isPassport) {
        // Obter os dias do evento para identificação
        const eventDays = await ctx.db
          .query("eventDays")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect();

        // Determinar qual dia está sendo validado
        let dayToValidate: string | null = null;
        const validatedDayIds: string[] = Array.isArray(ticket.validatedDayIds) 
          ? ticket.validatedDayIds.map(id => String(id)) 
          : [];

        if (!isOwner) {
          const allowedDayIds = (validatorDoc as any).allowedDayIds || [];
          // Se for passaporte e o validador tiver dias permitidos, usamos o primeiro dia da lista dele como referência de baixa
          // mas permitimos que ele leia se tiver qualquer dia (a trava de permissão geral já tratou isso acima)
          dayToValidate = allowedDayIds.length > 0 ? String(allowedDayIds[0]) : null;
        } else {
          // Se for o dono, identifica o dia pela data atual (usando UTC para ser robusto)
          const now = Date.now();
          const d = new Date(now);
          const todayStr = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
          
          const currentDayDoc = eventDays.find(day => {
            const dd = new Date(day.date);
            const dayStr = `${dd.getUTCFullYear()}-${dd.getUTCMonth()}-${dd.getUTCDate()}`;
            return dayStr === todayStr;
          });
          dayToValidate = currentDayDoc ? String(currentDayDoc._id) : null;
        }

        // Verificar se este dia específico já foi validado (vale para dono e validador)
        if (dayToValidate && validatedDayIds.includes(dayToValidate)) {
          return {
            success: false,
            errorType: 'ALREADY_USED_FOR_DAY',
            message: 'Este passaporte já foi validado para este dia.',
            ticket,
            event
          };
        }

        // Inicializar usos se estiver indefinido
        const initialUses = ticket.passportUsesRemaining ?? eventDays.length;
        
        if (initialUses <= 0) {
          return {
            success: false,
            errorType: 'NO_USES_REMAINING',
            message: 'Este passaporte não possui mais usos disponíveis.',
            ticket,
            event
          };
        }

        const now = Date.now();
        const remainingUses = initialUses - 1;
        
        // Garantir que o array seja atualizado corretamente com strings
        const newValidatedDayIds = dayToValidate 
          ? [...validatedDayIds, dayToValidate] 
          : validatedDayIds;
        
        // O passaporte só fica "used" se zerar os usos
        const newStatus = remainingUses === 0 ? "used" : "valid";

        await ctx.db.patch(ticketId, {
          status: newStatus,
          validatedAt: now,
          validatedBy: userId,
          passportUsesRemaining: remainingUses,
          validatedDayIds: newValidatedDayIds as Id<"eventDays">[]
        });

        return {
          success: true,
          isPassport: true,
          remainingUses,
          ticket: { 
            ...ticket, 
            status: newStatus, 
            validatedAt: now, 
            validatedBy: userId,
            passportUsesRemaining: remainingUses,
            validatedDayIds: newValidatedDayIds
          },
          event,
          ticketType,
        };
      }

      // Ingresso Comum (Uso Único)
      await ctx.db.patch(ticketId, {
        status: "used",
        validatedAt: Date.now(),
        validatedBy: userId,
      });

      return {
        success: true,
        isPassport: false,
        ticket: { ...ticket, status: "used", validatedAt: Date.now(), validatedBy: userId },
        event,
        ticketType,
      };
      
    } catch (error) {
      // Log do erro real no servidor
      console.error('Erro interno na validação:', error);
      
      return {
        success: false,
        errorType: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor'
      };
    }
  },
});

export const previewScan = query({
  args: {
    ticketId: v.id("tickets"),
    eventId: v.id("events"),
    userId: v.string(),
  },
  handler: async (ctx, { ticketId, eventId, userId }) => {
    const permission = await getEventAndValidator(ctx, eventId, userId);
    if (!permission.ok) {
      return {
        success: false,
        errorType: permission.errorType,
        message: permission.message,
      };
    }

    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      return {
        success: false,
        errorType: "TICKET_NOT_FOUND",
        message: "Ingresso não encontrado",
      };
    }

    if (ticket.eventId !== eventId) {
      return {
        success: false,
        errorType: "EVENT_MISMATCH",
        message: "Este ingresso não pertence a este evento",
      };
    }

    const meta = await getTicketMeta(ctx, ticket);
    if (!meta.ok) {
      return {
        success: false,
        errorType: meta.errorType,
        message: meta.message,
      };
    }

    const { ticketType, day, lot } = meta;
    const isPassport = !!ticketType?.isPassport;

    if (day && day.eventId !== eventId) {
      return {
        success: false,
        errorType: "INVALID_METADATA",
        message: "Dia inválido para este evento",
      };
    }

    if (lot && lot.eventId !== eventId) {
      return {
        success: false,
        errorType: "INVALID_METADATA",
        message: "Lote inválido para este evento",
      };
    }

    const isOwner = permission.isOwner;
    const validatorDoc = permission.validatorDoc;

    if (!isOwner && validatorDoc) {
      const allowedDayIds = (validatorDoc as any).allowedDayIds || [];
      const allowedLotIds = (validatorDoc as any).allowedLotIds || [];
      const allowedTicketTypeIds = (validatorDoc as any).allowedTicketTypeIds || [];

      const hasRestrictions =
        allowedDayIds.length > 0 ||
        allowedLotIds.length > 0 ||
        allowedTicketTypeIds.length > 0;

      if (hasRestrictions) {
        const ticketDayId = (ticketType as any)?.dayId;
        const ticketLotId = (ticketType as any)?.lotId;
        const ticketTypeId = ticket.ticketTypeId;

        const dayOk =
          allowedDayIds.length === 0 ||
          isPassport ||
          (ticketDayId && allowedDayIds.some((id: any) => String(id) === String(ticketDayId)));

        const lotOk =
          allowedLotIds.length === 0 ||
          (ticketLotId && allowedLotIds.some((id: any) => String(id) === String(ticketLotId)));

        const typeOk =
          allowedTicketTypeIds.length === 0 ||
          allowedTicketTypeIds.some((id: any) => String(id) === String(ticketTypeId));

        if (!dayOk || !lotOk || !typeOk) {
          return {
            success: false,
            errorType: "PERMISSION_DENIED",
            message: "Você não tem permissão para validar este ingresso",
          };
        }
      }
    }

    const pendingTransfer = await ctx.db
      .query("transferRequests")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (pendingTransfer) {
      return {
        success: false,
        errorType: "TRANSFER_PENDING",
        message: "Ingresso em processo de transferência",
      };
    }

    if (ticket.status === "refunded") {
      return {
        success: false,
        errorType: "REFUNDED",
        message: "Ingresso reembolsado",
      };
    }

    if (ticket.status === "cancelled") {
      return {
        success: false,
        errorType: "CANCELLED",
        message: "Ingresso cancelado",
      };
    }

    if (ticket.status === "transfered") {
      return {
        success: false,
        errorType: "TRANSFERRED",
        message: "Ingresso transferido",
      };
    }

    const holder = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", ticket.userId))
      .first();

    if (isPassport) {
      const eventDays = await ctx.db
        .query("eventDays")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();

      let dayToValidate: string | null = null;
      const validatedDayIds: string[] = Array.isArray(ticket.validatedDayIds)
        ? ticket.validatedDayIds.map((id: any) => String(id))
        : [];

      if (!isOwner) {
        const allowedDayIds = (validatorDoc as any)?.allowedDayIds || [];
        dayToValidate = allowedDayIds.length > 0 ? String(allowedDayIds[0]) : null;
      } else {
        const now = Date.now();
        const d = new Date(now);
        const todayStr = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

        const currentDayDoc = eventDays.find((dayDoc: any) => {
          const dd = new Date(dayDoc.date);
          const dayStr = `${dd.getUTCFullYear()}-${dd.getUTCMonth()}-${dd.getUTCDate()}`;
          return dayStr === todayStr;
        });
        dayToValidate = currentDayDoc ? String(currentDayDoc._id) : null;
      }

      const alreadyUsedForDay = dayToValidate ? validatedDayIds.includes(dayToValidate) : false;
      const initialUses = ticket.passportUsesRemaining ?? eventDays.length;
      const remainingUses = Math.max(0, initialUses);

      if (remainingUses <= 0) {
        return {
          success: false,
          errorType: "NO_USES_REMAINING",
          message: "Este passaporte não possui mais usos disponíveis.",
        };
      }

      if (alreadyUsedForDay) {
        return {
          success: false,
          errorType: "ALREADY_USED_FOR_DAY",
          message: "Este passaporte já foi validado para este dia.",
        };
      }

      return {
        success: true,
        mode: "passport",
        ticket: {
          _id: ticket._id,
          status: ticket.status,
          quantity: ticket.quantity,
          purchasedAt: ticket.purchasedAt,
          validatedAt: ticket.validatedAt,
          validatedBy: ticket.validatedBy,
          passportUsesRemaining: remainingUses,
          validatedDayIds,
          userId: ticket.userId,
        },
        ticketType: {
          _id: ticketType._id,
          name: ticketType.name,
          dayId: ticketType.dayId,
          lotId: ticketType.lotId,
          isPassport: true,
        },
        day,
        lot,
        holder: holder
          ? { name: holder.name, email: holder.email, cpf: holder.cpf, phone: holder.phone }
          : null,
        dayToValidateId: dayToValidate,
        remainingUses,
        batchMax: 1,
      };
    }

    const { remaining } = computeRemainingUnits(ticket);
    if (ticket.status === "used" || remaining <= 0) {
      return {
        success: false,
        errorType: "ALREADY_USED",
        message: "Ingresso já utilizado",
      };
    }

    const sameTypeTickets = await ctx.db
      .query("tickets")
      .withIndex("by_user_event", (q) => q.eq("userId", ticket.userId).eq("eventId", eventId))
      .filter((q) => q.eq(q.field("ticketTypeId"), ticket.ticketTypeId))
      .filter((q) => q.eq(q.field("status"), "valid"))
      .take(200);

    let sameTypeRemaining = 0;
    for (const t of sameTypeTickets) {
      const r = computeRemainingUnits(t).remaining;
      sameTypeRemaining += r;
      if (sameTypeRemaining >= 50) break;
    }

    return {
      success: true,
      mode: "single",
      ticket: {
        _id: ticket._id,
        status: ticket.status,
        quantity: ticket.quantity,
        purchasedAt: ticket.purchasedAt,
        validatedAt: ticket.validatedAt,
        validatedBy: ticket.validatedBy,
        userId: ticket.userId,
      },
      ticketType: {
        _id: ticketType._id,
        name: ticketType.name,
        dayId: ticketType.dayId,
        lotId: ticketType.lotId,
        isPassport: false,
      },
      day,
      lot,
      holder: holder
        ? { name: holder.name, email: holder.email, cpf: holder.cpf, phone: holder.phone }
        : null,
      remainingUnits: remaining,
      batchMax: Math.min(50, remaining),
      sameTypeRemaining: Math.min(50, sameTypeRemaining),
    };
  },
});

export const confirmScan = mutation({
  args: {
    ticketId: v.id("tickets"),
    eventId: v.id("events"),
    userId: v.string(),
    quantity: v.optional(v.number()),
    readAllSameType: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const permission = await getEventAndValidator(ctx, args.eventId, args.userId);
    if (!permission.ok) {
      return {
        success: false,
        errorType: permission.errorType,
        message: permission.message,
      };
    }

    const maxUnits = 50;
    const quantityRequested = Math.max(1, Math.floor(args.quantity ?? 1));
    if (quantityRequested > maxUnits) {
      return {
        success: false,
        errorType: "BATCH_LIMIT",
        message: "Limite máximo de 50 ingressos por operação",
      };
    }

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      return {
        success: false,
        errorType: "TICKET_NOT_FOUND",
        message: "Ingresso não encontrado",
      };
    }

    if (ticket.eventId !== args.eventId) {
      return {
        success: false,
        errorType: "EVENT_MISMATCH",
        message: "Este ingresso não pertence a este evento",
      };
    }

    const meta = await getTicketMeta(ctx, ticket);
    if (!meta.ok) {
      return {
        success: false,
        errorType: meta.errorType,
        message: meta.message,
      };
    }

    const { ticketType, day, lot } = meta;
    const isPassport = !!ticketType?.isPassport;

    if (day && day.eventId !== args.eventId) {
      return {
        success: false,
        errorType: "INVALID_METADATA",
        message: "Dia inválido para este evento",
      };
    }

    if (lot && lot.eventId !== args.eventId) {
      return {
        success: false,
        errorType: "INVALID_METADATA",
        message: "Lote inválido para este evento",
      };
    }

    const isOwner = permission.isOwner;
    const validatorDoc = permission.validatorDoc;

    if (!isOwner && validatorDoc) {
      const allowedDayIds = (validatorDoc as any).allowedDayIds || [];
      const allowedLotIds = (validatorDoc as any).allowedLotIds || [];
      const allowedTicketTypeIds = (validatorDoc as any).allowedTicketTypeIds || [];

      const hasRestrictions =
        allowedDayIds.length > 0 ||
        allowedLotIds.length > 0 ||
        allowedTicketTypeIds.length > 0;

      if (hasRestrictions) {
        const ticketDayId = (ticketType as any)?.dayId;
        const ticketLotId = (ticketType as any)?.lotId;
        const ticketTypeId = ticket.ticketTypeId;

        const dayOk =
          allowedDayIds.length === 0 ||
          isPassport ||
          (ticketDayId && allowedDayIds.some((id: any) => String(id) === String(ticketDayId)));

        const lotOk =
          allowedLotIds.length === 0 ||
          (ticketLotId && allowedLotIds.some((id: any) => String(id) === String(ticketLotId)));

        const typeOk =
          allowedTicketTypeIds.length === 0 ||
          allowedTicketTypeIds.some((id: any) => String(id) === String(ticketTypeId));

        if (!dayOk || !lotOk || !typeOk) {
          return {
            success: false,
            errorType: "PERMISSION_DENIED",
            message: "Você não tem permissão para validar este ingresso",
          };
        }
      }
    }

    const pendingTransfer = await ctx.db
      .query("transferRequests")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (pendingTransfer) {
      return {
        success: false,
        errorType: "TRANSFER_PENDING",
        message: "Ingresso em processo de transferência",
      };
    }

    if (ticket.status === "refunded") {
      return {
        success: false,
        errorType: "REFUNDED",
        message: "Ingresso reembolsado",
      };
    }

    if (ticket.status === "cancelled") {
      return {
        success: false,
        errorType: "CANCELLED",
        message: "Ingresso cancelado",
      };
    }

    if (ticket.status === "transfered") {
      return {
        success: false,
        errorType: "TRANSFERRED",
        message: "Ingresso transferido",
      };
    }

    if (ticket.status !== "valid" && ticket.status !== "used") {
      return {
        success: false,
        errorType: "INVALID_STATUS",
        message: "Ingresso inválido",
      };
    }

    const now = Date.now();

    if (isPassport) {
      if (args.readAllSameType) {
        return {
          success: false,
          errorType: "INVALID_BATCH",
          message: "Operação em lote não disponível para passaporte",
        };
      }

      const eventDays = await ctx.db
        .query("eventDays")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();

      let dayToValidate: string | null = null;
      const validatedDayIds: string[] = Array.isArray(ticket.validatedDayIds)
        ? ticket.validatedDayIds.map((id: any) => String(id))
        : [];

      if (!isOwner) {
        const allowedDayIds = (validatorDoc as any)?.allowedDayIds || [];
        dayToValidate = allowedDayIds.length > 0 ? String(allowedDayIds[0]) : null;
      } else {
        const d = new Date(now);
        const todayStr = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

        const currentDayDoc = eventDays.find((dayDoc: any) => {
          const dd = new Date(dayDoc.date);
          const dayStr = `${dd.getUTCFullYear()}-${dd.getUTCMonth()}-${dd.getUTCDate()}`;
          return dayStr === todayStr;
        });
        dayToValidate = currentDayDoc ? String(currentDayDoc._id) : null;
      }

      if (dayToValidate && validatedDayIds.includes(dayToValidate)) {
        return {
          success: false,
          errorType: "ALREADY_USED_FOR_DAY",
          message: "Este passaporte já foi validado para este dia.",
        };
      }

      const initialUses = ticket.passportUsesRemaining ?? eventDays.length;
      if (initialUses <= 0) {
        return {
          success: false,
          errorType: "NO_USES_REMAINING",
          message: "Este passaporte não possui mais usos disponíveis.",
        };
      }

      const remainingUses = initialUses - 1;
      const newValidatedDayIds = dayToValidate ? [...validatedDayIds, dayToValidate] : validatedDayIds;
      const newStatus = remainingUses === 0 ? "used" : "valid";

      await ctx.db.patch(args.ticketId, {
        status: newStatus,
        validatedAt: now,
        validatedBy: args.userId,
        passportUsesRemaining: remainingUses,
        validatedDayIds: newValidatedDayIds as Id<"eventDays">[],
      });

      await ctx.db.insert("ticketRedemptions", {
        ticketId: args.ticketId,
        eventId: args.eventId,
        ticketTypeId: ticket.ticketTypeId,
        validatorUserId: args.userId,
        redeemedAt: now,
        quantity: 1,
        dayId: dayToValidate ? (dayToValidate as any) : undefined,
      });

      return {
        success: true,
        mode: "passport",
        redeemed: [{ ticketId: args.ticketId, quantity: 1 }],
        totalRedeemed: 1,
        remainingUses,
        ticket: { _id: args.ticketId, status: newStatus, passportUsesRemaining: remainingUses },
        ticketType: { _id: ticketType._id, name: ticketType.name, isPassport: true },
      };
    }

    const redeemAcross = async (t: any, amount: number) => {
      const redeemQty = amount >= t.quantity && t.status === "valid" ? t.quantity : 0;
      if (redeemQty <= 0) return { redeemed: 0, newTicket: t };
      const newStatus = "used";
      await ctx.db.patch(t._id, {
        status: newStatus,
        validatedAt: now,
        validatedBy: args.userId,
      });

      await ctx.db.insert("ticketRedemptions", {
        ticketId: t._id,
        eventId: args.eventId,
        ticketTypeId: t.ticketTypeId,
        validatorUserId: args.userId,
        redeemedAt: now,
        quantity: redeemQty,
      });

      return {
        redeemed: redeemQty,
        newTicket: { ...t, status: newStatus, validatedAt: now, validatedBy: args.userId },
      };
    };

    if (args.readAllSameType) {
      const sameTypeTickets = await ctx.db
        .query("tickets")
        .withIndex("by_user_event", (q) => q.eq("userId", ticket.userId).eq("eventId", args.eventId))
        .filter((q) => q.eq(q.field("ticketTypeId"), ticket.ticketTypeId))
        .filter((q) => q.eq(q.field("status"), "valid"))
        .take(200);

      const ordered = [
        ticket,
        ...sameTypeTickets.filter((t: any) => String(t._id) !== String(ticket._id)),
      ];

      let remainingCap = maxUnits;
      const redeemed: Array<{ ticketId: Id<"tickets">; quantity: number }> = [];

      for (const t of ordered) {
        if (remainingCap <= 0) break;
        const res = await redeemAcross(t, remainingCap);
        if (res.redeemed > 0) {
          redeemed.push({ ticketId: t._id, quantity: res.redeemed });
          remainingCap -= res.redeemed;
        }
      }

      if (redeemed.length === 0) {
        return {
          success: false,
          errorType: "ALREADY_USED",
          message: "Ingressos já utilizados",
        };
      }

      return {
        success: true,
        mode: "batch",
        redeemed,
        totalRedeemed: redeemed.reduce((acc, r) => acc + r.quantity, 0),
        ticketType: { _id: ticketType._id, name: ticketType.name, isPassport: false },
      };
    }

    const { remaining } = computeRemainingUnits(ticket);
    if (ticket.status === "used" || remaining <= 0) {
      return {
        success: false,
        errorType: "ALREADY_USED",
        message: "Ingresso já utilizado",
      };
    }

    const res = await redeemAcross(ticket, Math.max(quantityRequested, ticket.quantity));
    if (res.redeemed <= 0) {
      return {
        success: false,
        errorType: "ALREADY_USED",
        message: "Ingresso já utilizado",
      };
    }

    return {
      success: true,
      mode: "single",
      redeemed: [{ ticketId: ticket._id, quantity: res.redeemed }],
      totalRedeemed: res.redeemed,
      ticket: { _id: ticket._id, status: res.newTicket.status, quantity: ticket.quantity },
      ticketType: { _id: ticketType._id, name: ticketType.name, isPassport: false },
    };
  },
});



// Função para buscar tickets por IDs
export const getTicketsByIds = query({
  args: {
    ticketIds: v.array(v.id("tickets")),
  },
  handler: async (ctx, { ticketIds }) => {
    const tickets = [];
    for (const ticketId of ticketIds) {
      const ticket = await ctx.db.get(ticketId);
      if (ticket) {
        tickets.push(ticket);
      }
    }
    return tickets;
  },
});

// Função para cancelar ticket
export const cancelTicket = mutation({
  args: {
    ticketId: v.id("tickets"),
    reason: v.string(),
  },
  handler: async (ctx, { ticketId, reason }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      throw new Error("Ticket não encontrado");
    }

    // Atualizar status do ticket
    await ctx.db.patch(ticketId, { 
      status: "cancelled" 
    });

    // Se o ticket foi pago, devolver quantidade ao tipo de ingresso
    if (ticket.totalAmount > 0) {
      const ticketType = await ctx.db.get(ticket.ticketTypeId);
      if (ticketType) {
        await ctx.db.patch(ticket.ticketTypeId, {
          availableQuantity: ticketType.availableQuantity + ticket.quantity,
        });
      }
    }

    console.log(`Ticket ${ticketId} cancelado. Motivo: ${reason}`);
    return { success: true };
  },
});

// Função para buscar tickets por transaction ID da FreePay
export const getTicketsByTransactionId = query({
  args: {
    transactionId: v.string(),
  },
  handler: async (ctx, { transactionId }) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_transaction", (q) => q.eq("transactionId", transactionId))
      .collect();
  },
});

// Buscar ingressos por transactionId
export const getByTransactionId = query({
  args: {
    transactionId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.transactionId) {
      return [];
    }
    
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.transactionId))
      .collect();
      
    return tickets;
  },
});

// Função para criar tickets a partir de uma transação
export const createTicketsFromTransaction = mutation({
  args: {
    transactionId: v.string(),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerCpf: v.optional(v.string()),
    status: v.optional(v.string()), // Novo argumento opcional
    rebuildExportSummary: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      // Buscar a transação
      const transaction = await ctx.db
        .query("transactions")
        .withIndex("by_transactionId", (q) => q.eq("transactionId", args.transactionId))
        .first();
      
      if (!transaction) {
        return {
          success: false,
          error: `Transação ${args.transactionId} não encontrada`
        };
      }
      
      // Determinar o status inicial (padrão "valid" se não informado)
      const initialStatus = args.status === "pending_payment" ? "pending_payment" : "valid";

      // Cópia mutável: pode ser atualizada se resetarmos ticketsCreated (ingressos removidos manualmente)
      let metadata: Record<string, any> = { ...(transaction.metadata || {}) };
      const exportSummaryExisting: any | undefined = metadata.exportSummary;
      const needsExportSummaryPatch =
        args.rebuildExportSummary === true ||
        !exportSummaryExisting ||
        exportSummaryExisting.ticketResumo == null ||
        exportSummaryExisting.subtotalIngressos == null ||
        exportSummaryExisting.valorPago == null;

      const parseTicketSelections = () => {
        let ticketSelections: any[] = [];
        try {
          if (metadata.ticketSelections) {
            ticketSelections =
              typeof metadata.ticketSelections === "string"
                ? JSON.parse(metadata.ticketSelections)
                : metadata.ticketSelections;
          }
        } catch (e) {
          console.error("Erro ao processar ticketSelections:", e);
          return null;
        }
        return ticketSelections;
      };

      const patchExportSummaryIfNeeded = async () => {
        if (!needsExportSummaryPatch) return;

        const ticketSelections = parseTicketSelections();
        if (!ticketSelections || ticketSelections.length === 0) return;

        // Pré-calcular um resumo leve para export (evita N+1 no relatório)
        const exportTicketResumoParts: string[] = [];
        let exportSubtotalIngressos = 0;
        for (const sel of ticketSelections) {
          if (!sel?.ticketTypeId || !sel?.quantity) continue;
          const tt = await ctx.db.get(sel.ticketTypeId as Id<"ticketTypes">);
          if (!tt) continue;
          exportTicketResumoParts.push(`${tt.name} x${sel.quantity}`);
          exportSubtotalIngressos += (tt.currentPrice || 0) * (sel.quantity || 0);
        }

        const exportDesconto = metadata.discountAmount ? Number(metadata.discountAmount) : 0;
        const exportInstallments = metadata.installments ? Number(metadata.installments) : 1;
        const exportJurosParcelamento = metadata.interestAmount ? Number(metadata.interestAmount) : 0;
        const exportValorPago =
          metadata.chargedAmount
            ? Number(metadata.chargedAmount)
            : typeof transaction.amount === "number"
              ? transaction.amount
              : 0;

        const exportCliente =
          typeof args.customerName === "string" && args.customerName.trim() !== ""
            ? args.customerName
            : typeof metadata.name === "string"
              ? metadata.name
              : typeof metadata.customerName === "string"
                ? metadata.customerName
                : "";

        const exportEmail =
          typeof args.customerEmail === "string" && args.customerEmail.trim() !== ""
            ? args.customerEmail
            : typeof metadata.email === "string"
              ? metadata.email
              : typeof metadata.customerEmail === "string"
                ? metadata.customerEmail
                : "";

        const exportCpfRaw =
          typeof args.customerCpf === "string" && args.customerCpf.trim() !== ""
            ? args.customerCpf
            : typeof metadata.cpf === "string"
              ? metadata.cpf
              : typeof metadata.customerCpf === "string"
                ? metadata.customerCpf
                : "";
        const exportCpf =
          typeof exportCpfRaw === "string" && exportCpfRaw.trim() !== ""
            ? exportCpfRaw.replace(/\D/g, "")
            : "";

        const exportWhatsapp =
          typeof metadata.phone === "string"
            ? metadata.phone
            : typeof metadata.customerPhone === "string"
              ? metadata.customerPhone
              : "";

        await ctx.db.patch(transaction._id, {
          metadata: {
            ...(transaction.metadata || {}),
            ticketsCreated: true,
            exportSummary: {
              cliente: exportCliente,
              email: exportEmail,
              cpf: exportCpf,
              whatsapp: exportWhatsapp,
              installments: exportInstallments,
              jurosParcelamento: exportJurosParcelamento,
              subtotalIngressos: exportSubtotalIngressos,
              desconto: exportDesconto,
              ticketResumo: exportTicketResumoParts.join(" / "),
              valorPago: exportValorPago,
            },
          },
        });
      };

      if (metadata.ticketsCreated === true) {
        const existingTicketsWhenFlagged = await ctx.db
          .query("tickets")
          .withIndex("by_transaction", (q) => q.eq("transactionId", args.transactionId))
          .collect();
        if (existingTicketsWhenFlagged.length > 0) {
          await patchExportSummaryIfNeeded();
          await recordCouponUseOnceForTransaction(ctx, args.transactionId);
          return {
            success: true,
            ticketIds: existingTicketsWhenFlagged.map((t) => t._id),
          };
        }
        // Flag ticketsCreated sem ingressos no DB (ex.: exclusão manual ou falha parcial): recriar
        await ctx.db.patch(transaction._id, {
          metadata: { ...metadata, ticketsCreated: false },
        });
        metadata = { ...metadata, ticketsCreated: false };
      }

      // Verificar se já existem tickets para esta transação (idempotência)
      const existingTickets = await ctx.db
        .query("tickets")
        .withIndex("by_transaction", (q) => q.eq("transactionId", args.transactionId))
        .collect();
      
      if (existingTickets.length > 0) {
        console.log('🔄 Tickets já existem para esta transação:', args.transactionId);
        await patchExportSummaryIfNeeded();
        await recordCouponUseOnceForTransaction(ctx, args.transactionId);
        return { 
          success: true,
          ticketIds: existingTickets.map((t) => t._id)
        };
      }
      
      // Buscar os detalhes do evento e seleções de tickets do metadata da transação
      const eventId = transaction.eventId;
      let ticketOwnerUserId = transaction.userId;
      if (!ticketOwnerUserId || ticketOwnerUserId === "" || ticketOwnerUserId === "pending") {
        ticketOwnerUserId = PENDING_COURTESY_USER_ID;
      }

      // Buscar os tipos de tickets e quantidades do metadata
      let ticketSelections = [];
      
      try {
        // Tentar extrair ticketSelections do metadata
        if (metadata.ticketSelections) {
          ticketSelections = typeof metadata.ticketSelections === 'string' 
            ? JSON.parse(metadata.ticketSelections) 
            : metadata.ticketSelections;
        }
      } catch (e) {
        console.error('Erro ao processar ticketSelections:', e);
        return {
          success: false,
          error: 'Formato inválido de ticketSelections no metadata'
        };
      }
      
      if (!eventId || !ticketSelections || ticketSelections.length === 0) {
        return {
          success: false,
          error: 'Dados insuficientes para criar tickets'
        };
      }

      const rawBuyerEmail =
        (typeof args.customerEmail === "string" && args.customerEmail.trim() !== "")
          ? args.customerEmail
          : (typeof metadata.email === "string" ? metadata.email :
            typeof metadata.customerEmail === "string" ? metadata.customerEmail : "");
      const normalizedBuyerEmail =
        typeof rawBuyerEmail === "string" && rawBuyerEmail.trim() !== ""
          ? normalizeCourtesyEmail(rawBuyerEmail)
          : undefined;
      const pendingRecipientForPurchase =
        ticketOwnerUserId === PENDING_COURTESY_USER_ID && normalizedBuyerEmail
          ? normalizedBuyerEmail
          : undefined;

      // Pré-calcular um resumo leve para export (evita N+1 no relatório)
      // Mantemos somente agregados por transação (sem listar QR codes/tickets individuais)
      const exportTicketResumoParts: string[] = [];
      let exportSubtotalIngressos = 0;
      for (const sel of ticketSelections) {
        if (!sel?.ticketTypeId || !sel?.quantity) continue;
        const tt = await ctx.db.get(sel.ticketTypeId as Id<"ticketTypes">);
        if (!tt) continue;
        exportTicketResumoParts.push(`${tt.name} x${sel.quantity}`);
        exportSubtotalIngressos += (tt.currentPrice || 0) * (sel.quantity || 0);
      }
      const exportDesconto = metadata.discountAmount ? Number(metadata.discountAmount) : 0;
      const exportInstallments = metadata.installments ? Number(metadata.installments) : 1;
      const exportJurosParcelamento = metadata.interestAmount ? Number(metadata.interestAmount) : 0;
      const exportValorPago =
        metadata.chargedAmount ? Number(metadata.chargedAmount) :
        (typeof transaction.amount === "number" ? transaction.amount : 0);

      const exportCliente =
        (typeof args.customerName === "string" && args.customerName.trim() !== "")
          ? args.customerName
          : (typeof metadata.name === "string" ? metadata.name :
            typeof metadata.customerName === "string" ? metadata.customerName : "");
      const exportEmail = rawBuyerEmail;
      const exportCpfRaw =
        (typeof args.customerCpf === "string" && args.customerCpf.trim() !== "")
          ? args.customerCpf
          : (typeof metadata.cpf === "string" ? metadata.cpf :
            typeof metadata.customerCpf === "string" ? metadata.customerCpf : "");
      const exportCpf =
        typeof exportCpfRaw === "string" && exportCpfRaw.trim() !== ""
          ? exportCpfRaw.replace(/\D/g, "")
          : "";
      const exportWhatsapp =
        (typeof metadata.phone === "string" ? metadata.phone :
          typeof metadata.customerPhone === "string" ? metadata.customerPhone : "");
      
      // Criar os tickets
      const ticketIds = [];

      const normalizedCpf =
        typeof args.customerCpf === "string" && args.customerCpf.trim() !== ""
          ? args.customerCpf.replace(/\D/g, "")
          : undefined;
      
      for (const selection of ticketSelections) {
        // Buscar o tipo de ingresso usando a query específica para garantir o tipo correto
        const ticketType = await ctx.db
          .query("ticketTypes")
          .filter((q) => q.eq(q.field("_id"), selection.ticketTypeId))
          .first();
          
        if (!ticketType) {
          return {
            success: false,
            error: `Tipo de ingresso ${selection.ticketTypeId} não encontrado`
          };
        }

        // Verificar se o tipo de ingresso está ativo
        if (!ticketType.isActive) {
          return {
            success: false,
            error: `O ingresso "${ticketType.name}" não está mais disponível para compra.`
          };
        }
        
        if (ticketType.availableQuantity < selection.quantity) {
          return {
            success: false,
            error: `Ops! Os ingressos "${ticketType.name}" acabaram de esgotar. Por favor, escolha outro tipo de ingresso ou tente novamente mais tarde.`
          };
        }
        
        // Determinar usos de passaporte
        let passportUses = 0;
        let eligibleDayIds: any[] = [];
        if (ticketType.isPassport) {
          const days = await ctx.db
            .query("eventDays")
            .withIndex("by_event", (q) => q.eq("eventId", eventId))
            .collect();
          passportUses = days.length || 1;
          eligibleDayIds = days.map((d: any) => d._id);
        }

        // Para camarote/bistro, cada ingresso comprado gera múltiplos QR codes
        const isCamarote = (ticketType as any).isCamarote === true;
        const qrcodesPerTicket = isCamarote ? ((ticketType as any).qrcodesPerTicket || 4) : 1;

        // Calcular total de QR codes que serão gerados nesta compra
        let totalQrcodesInPurchase = 0;
        for (const sel of ticketSelections) {
          const selTicketType = await ctx.db.get(sel.ticketTypeId);
          const selIsCamarote = selTicketType ? ((selTicketType as any).isCamarote === true) : false;
          const selQrcodesPerTicket = selIsCamarote ? (((selTicketType as any).qrcodesPerTicket || 4)) : 1;
          totalQrcodesInPurchase += sel.quantity * selQrcodesPerTicket;
        }
        const discountPerQrcode = metadata.discountAmount && totalQrcodesInPurchase > 0 
          ? parseFloat(metadata.discountAmount) / totalQrcodesInPurchase 
          : undefined;

        // Criar um ticket para cada quantidade (ou múltiplos QR codes se for camarote)
        for (let i = 0; i < selection.quantity; i++) {
          // Para camarote, criar múltiplos tickets (QR codes)
          const ticketsToCreate = isCamarote ? qrcodesPerTicket : 1;
          for (let j = 0; j < ticketsToCreate; j++) {
            const ticketId = await ctx.db.insert("tickets", {
              eventId,
              ticketTypeId: selection.ticketTypeId,
              userId: ticketOwnerUserId,
              quantity: 1,
              unitPrice: ticketType.currentPrice / ticketsToCreate,
              totalAmount: (ticketType.currentPrice / ticketsToCreate) - (discountPerQrcode || 0),
              purchasedAt: Date.now(),
              status: initialStatus as any,
              transactionId: args.transactionId,
              paymentIntentId: args.transactionId,
              promoterCode: metadata.promoterCode,
              couponCode: metadata.couponCode,
              discountAmount: discountPerQrcode,
              originalAmount: ticketType.currentPrice / ticketsToCreate,
              passportUsesRemaining: ticketType.isPassport ? passportUses : undefined,
              validatedDayIds: ticketType.isPassport ? [] : undefined,
              passportEligibleDayIds: ticketType.isPassport ? eligibleDayIds : undefined,
              ...(pendingRecipientForPurchase
                ? { pendingRecipientEmail: pendingRecipientForPurchase }
                : {}),
            });
            
            ticketIds.push(ticketId);
          }
        }
        
        const newAvailableQuantity = ticketType.availableQuantity - selection.quantity;
        await ctx.db.patch(ticketType._id, {
          availableQuantity: newAvailableQuantity,
        });
      }
      
      await ctx.db.patch(transaction._id, {
        metadata: {
          ...(transaction.metadata || {}),
          ticketsCreated: true,
          exportSummary: {
            cliente: exportCliente,
            email: exportEmail,
            cpf: exportCpf,
            whatsapp: exportWhatsapp,
            installments: exportInstallments,
            jurosParcelamento: exportJurosParcelamento,
            subtotalIngressos: exportSubtotalIngressos,
            desconto: exportDesconto,
            ticketResumo: exportTicketResumoParts.join(" / "),
            valorPago: exportValorPago,
          },
        },
      });

      await recordCouponUseOnceForTransaction(ctx, args.transactionId);

      return { 
        success: true,
        ticketIds 
      };
    } catch (error) {
      console.error('Erro inesperado ao criar tickets:', error);
      return {
        success: false,
        error: 'Erro interno do servidor. Tente novamente.'
      };
    }
  },
});

// Função para buscar ingressos por email do usuário
export const getTicketsByEmail = query({
  args: {
    email: v.string(),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, { email, eventId }) => {
    // Primeiro, encontrar o usuário pelo email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      return [];
    }

    // Depois, buscar os ingressos desse usuário
    let ticketsQuery = ctx.db.query("tickets").withIndex("by_user", (q) => 
      q.eq("userId", user.userId)
    );

    // Se eventId for fornecido, filtrar por evento específico
    if (eventId) {
      ticketsQuery = ticketsQuery.filter((q) => 
        q.eq(q.field("eventId"), eventId)
      );
    }

    return await ticketsQuery.collect();
  },
});

// Função para buscar ingressos por CPF do usuário
export const getTicketsByCpf = query({
  args: {
    cpf: v.string(),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, { cpf, eventId }) => {
    // Buscar usuários com este CPF
    // Como não temos índice por CPF, precisamos buscar todos e filtrar
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("cpf"), cpf))
      .collect();

    if (users.length === 0) {
      return [];
    }

    // Buscar ingressos para todos os usuários encontrados com este CPF
    const tickets = [];
    for (const user of users) {
      let ticketsQuery = ctx.db.query("tickets").withIndex("by_user", (q) => 
        q.eq("userId", user.userId)
      );

      // Se eventId for fornecido, filtrar por evento específico
      if (eventId) {
        ticketsQuery = ticketsQuery.filter((q) => 
          q.eq(q.field("eventId"), eventId)
        );
      }

      const userTickets = await ticketsQuery.collect();
      tickets.push(...userTickets);
    }

    return tickets;
  },
});

// Função para buscar ingressos com detalhes por email ou CPF
export const getTicketsWithDetailsByEmailOrCpf = query({
  args: {
    email: v.optional(v.string()),
    cpf: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, { email, cpf, eventId }) => {
    if (!email && !cpf) {
      throw new Error("É necessário fornecer email ou CPF");
    }

    // Buscar usuários por email ou CPF
    let users: { userId: string; name: string; email: string; cpf: string; phone: string; }[] = [];
    if (email) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (user && user.cpf && user.phone) {
        users.push({
          userId: user.userId,
          name: user.name,
          email: user.email,
          cpf: user.cpf,
          phone: user.phone
        });
      }
    } else if (cpf) {
      users = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("cpf"), cpf))
        .collect() as { userId: string; name: string; email: string; cpf: string; phone: string; }[];
    }

    if (users.length === 0) {
      return [];
    }

    // Buscar ingressos para todos os usuários encontrados
    const tickets = [];
    for (const user of users) {
      let ticketsQuery = ctx.db.query("tickets").withIndex("by_user", (q) => 
        q.eq("userId", user.userId)
      );

      // Se eventId for fornecido, filtrar por evento específico
      if (eventId) {
        ticketsQuery = ticketsQuery.filter((q) => 
          q.eq(q.field("eventId"), eventId)
        );
      }

      const userTickets = await ticketsQuery.collect();
      
      // Adicionar detalhes de evento e tipo de ingresso para cada ingresso
      for (const ticket of userTickets) {
        const event = await ctx.db.get(ticket.eventId);
        const ticketType = await ctx.db.get(ticket.ticketTypeId);
        const userDetails = {
          name: user.name,
          email: user.email,
          cpf: user.cpf,
          phone: user.phone
        };
        
        tickets.push({
          ...ticket,
          event,
          ticketType,
          user: userDetails
        });
      }
    }

    return tickets;
  },
});

// Função para buscar todos os ingressos de um usuário
export const getUserTickets = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, { userEmail }) => {
    // Primeiro, encontrar o usuário pelo email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", userEmail))
      .first();

    if (!user) {
      return [];
    }

    // Buscar os ingressos desse usuário
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .collect();

    // Adicionar detalhes de evento e tipo de ingresso
    const ticketsWithDetails = [];
    for (const ticket of tickets) {
      const event = await ctx.db.get(ticket.eventId);
      const ticketType = await ctx.db.get(ticket.ticketTypeId);
      
      ticketsWithDetails.push({
        ...ticket,
        event,
        ticketType,
      });
    }

    return ticketsWithDetails;
  },
});

// Função para buscar ingressos de um usuário para um evento específico
export const getUserTicketsByEvent = query({
  args: {
    userEmail: v.string(),
    eventId: v.id("events"),
  },
  handler: async (ctx, { userEmail, eventId }) => {
    // Primeiro, encontrar o usuário pelo email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", userEmail))
      .first();

    if (!user) {
      return [];
    }

    // Buscar os ingressos desse usuário para o evento específico
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .filter((q) => q.eq(q.field("eventId"), eventId))
      .collect();

    // Adicionar detalhes de evento e tipo de ingresso
    const ticketsWithDetails = [];
    for (const ticket of tickets) {
      const event = await ctx.db.get(ticket.eventId);
      const ticketType = await ctx.db.get(ticket.ticketTypeId);
      
      ticketsWithDetails.push({
        ...ticket,
        event,
        ticketType,
      });
    }

    return ticketsWithDetails;
  },
});

// Função para deletar todos os ingressos de um evento
// export const deleteTicketsByEvent = mutation({
//   args: {
//     eventId: v.id("events"),
//   },
//   handler: async (ctx, { eventId }) => {
//     // Buscar todos os tickets do evento
//     const tickets = await ctx.db
//       .query("tickets")
//       .withIndex("by_event", (q) => q.eq("eventId", eventId))
//       .collect();
    
//     console.log(`Encontrados ${tickets.length} tickets para deletar`);
    
//     // Deletar cada ticket
//     for (const ticket of tickets) {
//       await ctx.db.delete(ticket._id);
//       console.log(`Ticket deletado: ${ticket._id}`);
//     }
    
//     console.log(`Todos os ${tickets.length} tickets do evento ${eventId} foram deletados`);
    
//     return {
//       deletedCount: tickets.length,
//       eventId: eventId
//     };
//   },
// });


// Function to validate 92% of valid tickets for an event
// export const validateMajorityTickets = mutation({
//   args: {
//     eventId: v.id("events"),
//   },
//   handler: async (ctx, { eventId }) => {
//     try {
//       // Get all valid tickets for the event
//       const validTickets = await ctx.db
//         .query("tickets")
//         .withIndex("by_event", (q) => q.eq("eventId", eventId))
//         .filter((q) => q.eq(q.field("status"), "valid"))
//         .collect();

//       // Calculate 92% of tickets to validate
//       const ticketsToValidate = Math.floor(validTickets.length * 0.92);
      
//       // Keep track of validation results
//       const results = {
//         totalValid: validTickets.length,
//         validated: 0,
//         failed: 0
//       };

//       // Validate tickets up to the 92% threshold
//       for (let i = 0; i < ticketsToValidate; i++) {
//         const ticket = validTickets[i];
        
//         try {
//           // Update ticket status to used
//           await ctx.db.patch(ticket._id, { status: "used" });
//           results.validated++;
//         } catch (error) {
//           console.error(`Failed to validate ticket ${ticket._id}:`, error);
//           results.failed++;
//         }
//       }

//       return {
//         success: true,
//         message: `Validated ${results.validated} out of ${results.totalValid} tickets`,
//         results
//       };

//     } catch (error) {
//       console.error('Error in bulk ticket validation:', error);
//       return {
//         success: false,
//         errorType: 'INTERNAL_ERROR',
//         message: 'Internal server error during bulk validation'
//       };
//     }
//   }
// });
