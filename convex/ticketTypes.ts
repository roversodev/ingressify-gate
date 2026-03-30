// NOVO ARQUIVO: Gerenciamento de tipos de ingressos
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getEventTicketTypes = query({
  args: { 
    eventId: v.id("events"),
    dayId: v.optional(v.id("eventDays")),
    lotId: v.optional(v.id("ticketLots")),
  },
  handler: async (ctx, { eventId, dayId, lotId }) => {
    let q = ctx.db
      .query("ticketTypes")
      .withIndex("by_event_sort", (qq) => 
        qq.eq("eventId", eventId)
      )
      .filter((qq) => qq.eq(qq.field("isActive"), true))
      .filter((qq) => qq.eq(qq.field("isCourtesy"), false))

    if (dayId) {
      q = q.filter((qq) => qq.eq(qq.field("dayId"), dayId));
    }
    if (lotId) {
      q = q.filter((qq) => qq.eq(qq.field("lotId"), lotId));
    }

    const ticketTypes = await q.order("asc").collect();

    // Recalcular disponibilidade dinamicamente para corrigir inconsistências
    const ticketTypesWithAvailability = await Promise.all(
      ticketTypes.map(async (ticketType) => {
        const soldTickets = await ctx.db
          .query("tickets")
          .withIndex("by_ticket_type", (q) => q.eq("ticketTypeId", ticketType._id))
          .filter((q) => 
            q.or(
              q.eq(q.field("status"), "valid"),
              q.eq(q.field("status"), "used"),
              q.eq(q.field("status"), "pending_payment"),
              q.eq(q.field("status"), "transfered")
            )
          )
          .collect();

        const soldQuantityRaw = soldTickets.length;
        
        const soldQuantity = soldQuantityRaw;

        return {
          ...ticketType,
          availableQuantity: ticketType.totalQuantity - soldQuantity
        };
      })
    );

    return ticketTypesWithAvailability;
  },
});

export const getAllEventTicketTypes = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db
      .query("ticketTypes")
      .withIndex("by_event_sort", (q) => 
        q.eq("eventId", eventId)
      )
      .collect();
  },
});

export const createTicketType = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    totalQuantity: v.number(),
    price: v.number(),
    sortOrder: v.number(),
    isCourtesy: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    maxPerUser: v.optional(v.number()),
    activationSettings: v.optional(v.object({
      enabled: v.boolean(),
      activationType: v.union(
        v.literal("manual"),
        v.literal("datetime"),
        v.literal("soldout"),
        v.literal("percentage")
      ),
      activateAt: v.optional(v.number()),
      triggerTicketTypeId: v.optional(v.id("ticketTypes")),
      triggerPercentage: v.optional(v.number()),
      deactivationType: v.optional(v.union(
        v.literal("never"),
        v.literal("datetime"),
        v.literal("soldout")
      )),
      deactivateAt: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const { price, isCourtesy, isActive, maxPerUser, activationSettings, ...ticketTypeData } = args;
    
    return await ctx.db.insert("ticketTypes", {
      ...ticketTypeData,
      availableQuantity: args.totalQuantity,
      currentPrice: price,
      isCourtesy: isCourtesy || false,
      isActive: isActive === undefined ? true : isActive,
      maxPerUser: maxPerUser,
      activationSettings: activationSettings,
    });
  },
});

export const checkAvailability = query({
  args: { 
    ticketTypeId: v.id("ticketTypes"),
    requestedQuantity: v.number(),
  },
  handler: async (ctx, { ticketTypeId, requestedQuantity }) => {
    const ticketType = await ctx.db.get(ticketTypeId);
    if (!ticketType) return { available: false, reason: "Tipo de ingresso não encontrado" };
    
    if (!ticketType.isActive) {
      return { available: false, reason: "Tipo de ingresso não está ativo" };
    }
    
    // Adicionar validação para cortesia
    if (ticketType.isCourtesy) {
      return { available: false, reason: "Ingressos cortesia não estão disponíveis para venda" };
    }
    
    if (ticketType.availableQuantity < requestedQuantity) {
      return { 
        available: false, 
        reason: `Apenas ${ticketType.availableQuantity} ingressos disponíveis`,
        availableQuantity: ticketType.availableQuantity
      };
    }
    
    return { 
      available: true, 
      price: ticketType.currentPrice,
      totalAmount: ticketType.currentPrice * requestedQuantity
    };
  },
});

export const updateTicketType = mutation({
  args: {
    ticketTypeId: v.id("ticketTypes"),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    totalQuantity: v.number(),
    sortOrder: v.number(),
    isCourtesy: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    maxPerUser: v.optional(v.number()),
    activationSettings: v.optional(v.object({
      enabled: v.boolean(),
      activationType: v.union(
        v.literal("manual"),
        v.literal("datetime"),
        v.literal("soldout"),
        v.literal("percentage")
      ),
      activateAt: v.optional(v.number()),
      triggerTicketTypeId: v.optional(v.id("ticketTypes")),
      triggerPercentage: v.optional(v.number()),
      deactivationType: v.optional(v.union(
        v.literal("never"),
        v.literal("datetime"),
        v.literal("soldout")
      )),
      deactivateAt: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const { ticketTypeId, price, isCourtesy, isActive, maxPerUser, activationSettings, ...updates } = args;
    
    const ticketType = await ctx.db.get(ticketTypeId);
    if (!ticketType) throw new Error("Tipo de ingresso não encontrado");
    
    // Calcular nova quantidade disponível baseada na diferença
    const quantityDifference = args.totalQuantity - ticketType.totalQuantity;
    const newAvailableQuantity = ticketType.availableQuantity + quantityDifference;
    
    // Verificar se a nova quantidade disponível não é negativa
    if (newAvailableQuantity < 0) {
      throw new Error("Não é possível reduzir a quantidade total abaixo dos ingressos já vendidos");
    }
    
    await ctx.db.patch(ticketTypeId, {
      ...updates,
      currentPrice: price,
      availableQuantity: newAvailableQuantity,
      totalQuantity: args.totalQuantity,
      isCourtesy: isCourtesy || false,
      isActive: isActive === undefined ? true : isActive,
      maxPerUser: maxPerUser,
      activationSettings: activationSettings,
    });
    
    return ticketTypeId;
  },
});

export const deleteTicketType = mutation({
  args: {
    ticketTypeId: v.id("ticketTypes"),
  },
  handler: async (ctx, { ticketTypeId }) => {
    const ticketType = await ctx.db.get(ticketTypeId);
    if (!ticketType) throw new Error("Tipo de ingresso não encontrado");
    
    // Verificar se há ingressos vendidos para este tipo
    const soldTickets = await ctx.db
      .query("tickets")
      .withIndex("by_ticket_type", (q) => q.eq("ticketTypeId", ticketTypeId))
      .filter((q) => 
        q.or(
          q.eq(q.field("status"), "valid"),
          q.eq(q.field("status"), "used")
        )
      )
      .collect();
    
    if (soldTickets.length > 0) {
      throw new Error("Não é possível deletar tipo de ingresso com ingressos já vendidos");
    }
    
    // Deletar o tipo de ingresso permanentemente
    await ctx.db.delete(ticketTypeId);
    
    return ticketTypeId;
  },
});

export const getAllEventTicketTypesIncludingCourtesy = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .order("asc")
      .collect();
  },
});


export const getEventCourtesyTicketTypes = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("isCourtesy"), true))
      .order("asc")
      .collect();

    // Calcular quantidade disponível para cada tipo
    const ticketTypesWithAvailability = await Promise.all(
      ticketTypes.map(async (ticketType) => {
        const soldTickets = await ctx.db
          .query("tickets")
          .withIndex("by_ticket_type", (q) => q.eq("ticketTypeId", ticketType._id))
          .filter((q) => q.neq(q.field("status"), "cancelled"))
          .collect();

        const soldQuantity = soldTickets.length;
        const availableQuantity = ticketType.totalQuantity - soldQuantity;

        return {
          ...ticketType,
          soldQuantity,
          availableQuantity,
        };
      })
    );

    return ticketTypesWithAvailability;
  },
});

/** Tipos de ingresso disponíveis para envio de cortesias: qualquer tipo ativo (venda ou cortesia), com labels de Dia/Lote para UX */
export const getEventTicketTypesForCourtesy = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    // Incluir todos os tipos ativos (não filtrar por isCourtesy — qualquer tipo pode ser enviado como cortesia)
    const activeTicketTypes = ticketTypes
      .filter((tt) => tt.isActive === true)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const days = await ctx.db
      .query("eventDays")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .order("asc")
      .collect();
    const lots = await ctx.db
      .query("ticketLots")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .order("asc")
      .collect();
    const dayMap = Object.fromEntries(days.map((d) => [d._id, d]));
    const lotMap = Object.fromEntries(lots.map((l) => [l._id, l]));

    const ticketTypesWithAvailability = await Promise.all(
      activeTicketTypes.map(async (ticketType) => {
        const soldTickets = await ctx.db
          .query("tickets")
          .withIndex("by_ticket_type", (q) => q.eq("ticketTypeId", ticketType._id))
          .filter((q) =>
            q.or(
              q.eq(q.field("status"), "valid"),
              q.eq(q.field("status"), "used"),
              q.eq(q.field("status"), "pending_payment"),
              q.eq(q.field("status"), "transfered")
            )
          )
          .collect();
        const soldQuantity = soldTickets.length;
        const availableQuantity = Math.max(0, ticketType.totalQuantity - soldQuantity);
        const day = ticketType.dayId ? dayMap[ticketType.dayId] : null;
        const lot = ticketType.lotId ? lotMap[ticketType.lotId] : null;
        return {
          _id: ticketType._id,
          name: ticketType.name,
          totalQuantity: ticketType.totalQuantity,
          availableQuantity,
          soldQuantity,
          isCourtesy: ticketType.isCourtesy ?? false,
          dayId: ticketType.dayId,
          lotId: ticketType.lotId,
          dayName: day?.name ?? (day ? new Date(day.date).toLocaleDateString("pt-BR") : null),
          lotName: lot?.name ?? null,
        };
      })
    );

    return ticketTypesWithAvailability;
  },
});


export const getById = query({
  args: { ticketTypeId: v.id("ticketTypes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.ticketTypeId);
  },
});

export const checkUserPurchaseLimit = query({
  args: {
    ticketTypeId: v.id("ticketTypes"),
    userId: v.string(),
    requestedQuantity: v.number(),
  },
  handler: async (ctx, { ticketTypeId, userId, requestedQuantity }) => {
    const ticketType = await ctx.db.get(ticketTypeId);
    if (!ticketType || !ticketType.maxPerUser) {
      return { withinLimit: true }; // Sem limite definido
    }

    // Buscar tickets já comprados pelo usuário para este tipo
    const userTickets = await ctx.db
      .query("tickets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => 
        q.and(
          q.eq(q.field("ticketTypeId"), ticketTypeId),
          q.neq(q.field("status"), "cancelled"),
          q.neq(q.field("status"), "refunded")
        )
      )
      .collect();

    const currentQuantity = userTickets.reduce((sum, ticket) => sum + ticket.quantity, 0);
    const totalAfterPurchase = currentQuantity + requestedQuantity;

    if (totalAfterPurchase > ticketType.maxPerUser) {
      return {
        withinLimit: false,
        currentQuantity,
        maxAllowed: ticketType.maxPerUser,
        availableForUser: Math.max(0, ticketType.maxPerUser - currentQuantity),
        message: `Limite de ${ticketType.maxPerUser} ingressos por pessoa. Você já possui ${currentQuantity}.`
      };
    }

    return { withinLimit: true, currentQuantity, maxAllowed: ticketType.maxPerUser };
  },
});

// Função otimizada para buscar dados dos ingressos para a página de gerenciamento
export const getTicketTypesForManagement = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Buscar todos os tipos de ingressos do evento
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event_sort", (q) => q.eq("eventId", eventId))
      .collect();

    // Buscar contagem de ingressos vendidos para cada tipo
    const ticketTypesWithStats = await Promise.all(
      ticketTypes.map(async (ticketType) => {
        const soldTickets = await ctx.db
          .query("tickets")
          .withIndex("by_ticket_type", (q) => q.eq("ticketTypeId", ticketType._id))
          .filter((q) => 
            q.or(
              q.eq(q.field("status"), "valid"),
              q.eq(q.field("status"), "used"),
              q.eq(q.field("status"), "pending_payment"),
            )
          )
          .collect();

        const soldCountRaw = soldTickets.length;

        const soldCount = soldCountRaw
        
        const validCountRaw = soldTickets.filter(t => t.status === "valid").length;
        const usedCountRaw = soldTickets.filter(t => t.status === "used").length;


        const validCount = validCountRaw;
        const usedCount = usedCountRaw;
        
        const availableQuantity = ticketType.totalQuantity - soldCount;

        return {
          _id: ticketType._id,
          name: ticketType.name,
          description: ticketType.description,
          currentPrice: ticketType.currentPrice,
          totalQuantity: ticketType.totalQuantity,
          isActive: ticketType.isActive,
          isCourtesy: ticketType.isCourtesy || false,
          sortOrder: ticketType.sortOrder,
          maxPerUser: ticketType.maxPerUser,
          dayId: ticketType.dayId,
          lotId: ticketType.lotId,
          soldCount: soldCount,
          validCount,
          usedCount,
          availableQuantity: availableQuantity,
          activationSettings: ticketType.activationSettings,
          isPassport: ticketType.isPassport || false,
        };
      })
    );

    return ticketTypesWithStats;
  },
});

// Função otimizada para criar/atualizar tipos de ingressos
export const upsertTicketType = mutation({
  args: {
    ticketTypeId: v.optional(v.id("ticketTypes")), // Se não fornecido, cria novo
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    totalQuantity: v.number(),
    isActive: v.optional(v.boolean()),
    isCourtesy: v.optional(v.boolean()),
    isPassport: v.optional(v.boolean()),
    maxPerUser: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
    dayId: v.optional(v.id("eventDays")),
    lotId: v.optional(v.id("ticketLots")),
    activationSettings: v.optional(v.object({
      enabled: v.boolean(),
      activationType: v.union(
        v.literal("manual"),
        v.literal("datetime"),
        v.literal("soldout"),
        v.literal("percentage")
      ),
      activateAt: v.optional(v.number()),
      triggerTicketTypeId: v.optional(v.id("ticketTypes")),
      triggerPercentage: v.optional(v.number()),
      deactivationType: v.optional(v.union(
        v.literal("never"),
        v.literal("datetime"),
        v.literal("soldout")
      )),
      deactivateAt: v.optional(v.number()),
    })),
    buyXGetY: v.optional(v.object({
      enabled: v.boolean(),
      buyQuantity: v.number(),
      getQuantity: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const { ticketTypeId, eventId, dayId, lotId, ...ticketData } = args;

    // Verificar se o usuário tem permissão para editar o evento
    const event = await ctx.db.get(eventId);
    if (!event) {
      return {
        success: false,
        message: "Evento não encontrado"
      };
    }

    // Se é atualização
    if (ticketTypeId) {
      const existingTicketType = await ctx.db.get(ticketTypeId);
      if (!existingTicketType) {
        return {
          success: false,
          message: "Tipo de ingresso não encontrado"
        };
      }

      // Calcular ingressos vendidos para validação e atualização da quantidade disponível
      const soldTickets = await ctx.db
        .query("tickets")
        .withIndex("by_ticket_type", (q) => q.eq("ticketTypeId", ticketTypeId))
        .filter((q) =>
          q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used"))
        )
        .collect();

      const soldQuantity = soldTickets.length;

      // Verificar se há ingressos vendidos antes de alterar quantidade
      if (ticketData.totalQuantity < soldQuantity) {
        return {
          success: false,
          message: `Não é possível reduzir a quantidade para ${ticketData.totalQuantity}. Já foram vendidos ${soldQuantity} ingressos.`
        };
      }

      // Calcular nova quantidade disponível
      const newAvailableQuantity = ticketData.totalQuantity - soldQuantity;

      await ctx.db.patch(ticketTypeId, {
        name: ticketData.name,
        description: ticketData.description,
        totalQuantity: ticketData.totalQuantity,
        availableQuantity: newAvailableQuantity, // Atualizar quantidade disponível
        currentPrice: ticketData.price, // Mapear price para currentPrice
        isActive: ticketData.isActive ?? true,
        isCourtesy: ticketData.isCourtesy ?? false,
        isPassport: ticketData.isPassport ?? existingTicketType.isPassport,
        maxPerUser: ticketData.maxPerUser,
        activationSettings: ticketData.activationSettings,
        buyXGetY: ticketData.buyXGetY,
        sortOrder: ticketData.sortOrder ?? existingTicketType.sortOrder,
        dayId,
        lotId,
      });

      return {
        success: true,
        ticketTypeId
      };
    } 
    // Se é criação
    else {
      // Determinar sortOrder se não fornecido
      let sortOrder = ticketData.sortOrder;
      if (sortOrder === undefined) {
        const existingTicketTypes = await ctx.db
          .query("ticketTypes")
          .withIndex("by_event_active", (q) => q.eq("eventId", eventId))
          .collect();
        
        sortOrder = existingTicketTypes.length > 0 
          ? Math.max(...existingTicketTypes.map(t => t.sortOrder || 0)) + 1 
          : 0;
      }

      const newTicketTypeId = await ctx.db.insert("ticketTypes", {
        eventId,
        name: ticketData.name,
        description: ticketData.description,
        totalQuantity: ticketData.totalQuantity,
        availableQuantity: ticketData.totalQuantity, // Inicialmente igual à quantidade total
        currentPrice: ticketData.price, // Mapear price para currentPrice
        isActive: ticketData.isActive ?? true,
        isCourtesy: ticketData.isCourtesy ?? false,
        isPassport: ticketData.isPassport ?? false,
        maxPerUser: ticketData.maxPerUser,
        activationSettings: ticketData.activationSettings,
        buyXGetY: ticketData.buyXGetY,
        sortOrder,
        dayId,
        lotId,
      });

      return {
        success: true,
        ticketTypeId: newTicketTypeId
      };
    }
  },
});



// Função para validar disponibilidade e status de ativação dos tickets no checkout
export const validateTicketsForCheckout = query({
  args: {
    eventId: v.id("events"),
    ticketSelections: v.array(
      v.object({
        ticketTypeId: v.id("ticketTypes"),
        quantity: v.number(),
      })
    ),
    userId: v.optional(v.string()), // Para validar limites por usuário
  },
  handler: async (ctx, args) => {
    const validationErrors: string[] = [];
    const ticketValidations: Array<{
      ticketTypeId: string;
      name: string;
      isValid: boolean;
      isActive: boolean;
      availableQuantity: number;
      requestedQuantity: number;
      error?: string;
    }> = [];

    // Verificar se o evento existe e não está cancelado
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      validationErrors.push("Evento não encontrado");
      return { isValid: false, errors: validationErrors, ticketValidations };
    }

    if (event.is_cancelled) {
      validationErrors.push("Este evento foi cancelado");
      return { isValid: false, errors: validationErrors, ticketValidations };
    }

    // Validar cada seleção de ticket
    for (const selection of args.ticketSelections) {
      const ticketType = await ctx.db.get(selection.ticketTypeId);
      
      if (!ticketType) {
        const error = `Tipo de ingresso não encontrado`;
        validationErrors.push(error);
        ticketValidations.push({
          ticketTypeId: selection.ticketTypeId,
          name: "Desconhecido",
          isValid: false,
          isActive: false,
          availableQuantity: 0,
          requestedQuantity: selection.quantity,
          error
        });
        continue;
      }

      let isValid = true;
      let error: string | undefined;

      // Verificar se o tipo de ingresso está ativo
      if (!ticketType.isActive) {
        isValid = false;
        error = `O ingresso "${ticketType.name}" não está mais disponível para venda`;
        validationErrors.push(error);
      }

      // Verificar disponibilidade
      if (selection.quantity > ticketType.availableQuantity) {
        isValid = false;
        error = `Quantidade solicitada (${selection.quantity}) excede a disponibilidade (${ticketType.availableQuantity}) para "${ticketType.name}"`;
        validationErrors.push(error);
      }

      // Verificar se a quantidade solicitada é válida
      if (selection.quantity <= 0) {
        isValid = false;
        error = `Quantidade inválida para "${ticketType.name}"`;
        validationErrors.push(error);
      }

      // Verificar limite por usuário se userId foi fornecido
      let userCurrentQuantity = 0;
      let userAvailableQuantity = 0;
      if (args.userId && ticketType.maxPerUser) {
        // Buscar tickets já comprados pelo usuário para este tipo
        const userTickets = await ctx.db
          .query("tickets")
          .withIndex("by_user", (q) => q.eq("userId", args.userId || ""))
          .filter((q) => 
            q.and(
              q.eq(q.field("ticketTypeId"), selection.ticketTypeId),
              q.neq(q.field("status"), "cancelled"),
              q.neq(q.field("status"), "refunded")
            )
          )
          .collect();

        userCurrentQuantity = userTickets.reduce((sum, ticket) => sum + ticket.quantity, 0);
        const totalAfterPurchase = userCurrentQuantity + selection.quantity;
        userAvailableQuantity = Math.max(0, ticketType.maxPerUser - userCurrentQuantity);

        if (totalAfterPurchase > ticketType.maxPerUser) {
          isValid = false;
          error = `Limite de ${ticketType.maxPerUser} ingressos por pessoa para "${ticketType.name}". Você já possui ${userCurrentQuantity}. Disponível: ${userAvailableQuantity}`;
          validationErrors.push(error);
        }
      }

      ticketValidations.push({
        ticketTypeId: selection.ticketTypeId,
        name: ticketType.name,
        isValid,
        isActive: ticketType.isActive,
        availableQuantity: ticketType.availableQuantity,
        requestedQuantity: selection.quantity,
        error
      });
    }

    return {
      isValid: validationErrors.length === 0,
      errors: validationErrors,
      ticketValidations,
      eventStatus: {
        exists: !!event,
        isCancelled: event?.is_cancelled || false,
        name: event?.name || ""
      }
    };
  },
});


export const getEventDaysAndLots = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const days = await ctx.db
      .query("eventDays")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .order("asc")
      .collect();

    const lots = await ctx.db
      .query("ticketLots")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .order("asc")
      .collect();

    return { days, lots };
  },
});


export const createEventDay = mutation({
  args: {
    eventId: v.id("events"),
    name: v.optional(v.string()),
    date: v.number(),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    order: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    showOnSalesPage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      let order = args.order;
      if (order === undefined) {
        const existing = await ctx.db
          .query("eventDays")
          .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
          .collect();
        order = existing.length > 0 ? Math.max(...existing.map(d => d.order || 0)) + 1 : 0;
      }
      const id = await ctx.db.insert("eventDays", {
        eventId: args.eventId,
        name: args.name,
        date: args.date,
        startTime: args.startTime,
        endTime: args.endTime,
        order,
        isActive: args.isActive ?? true,
        showOnSalesPage: args.showOnSalesPage ?? true,
      });
      return { success: true, dayId: id, message: "Dia do evento criado com sucesso" };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  },
});

export const updateEventDay = mutation({
  args: {
    dayId: v.id("eventDays"),
    name: v.optional(v.string()),
    date: v.optional(v.number()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    order: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    showOnSalesPage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.dayId);
    if (!existing) {
      return { success: false, message: "Dia do evento não encontrado" };
    }
    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.date !== undefined) updates.date = args.date;
    if (args.startTime !== undefined) updates.startTime = args.startTime;
    if (args.endTime !== undefined) updates.endTime = args.endTime;
    updates.order = args.order ?? existing.order;
    updates.isActive = args.isActive ?? existing.isActive;
    if (args.showOnSalesPage !== undefined) updates.showOnSalesPage = args.showOnSalesPage;
    await ctx.db.patch(args.dayId, updates);
    return { success: true, dayId: args.dayId };
  },
});

export const deleteEventDay = mutation({
  args: { dayId: v.id("eventDays") },
  handler: async (ctx, { dayId }) => {
    const day = await ctx.db.get(dayId);
    if (!day) {
      return { success: false, message: "Dia do evento não encontrado" };
    }
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", day.eventId))
      .filter((q) => q.eq(q.field("dayId"), dayId))
      .collect();
    for (const tt of ticketTypes) {
      const soldTickets = await ctx.db
        .query("tickets")
        .withIndex("by_ticket_type", (q) => q.eq("ticketTypeId", tt._id))
        .filter((q) => q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used")))
        .collect();
      if (soldTickets.length > 0) {
        return { success: false, message: "Não é possível deletar o dia com ingressos vendidos" };
      }
    }
    const lots = await ctx.db
      .query("ticketLots")
      .withIndex("by_event_day", (q) => q.eq("eventId", day.eventId).eq("dayId", dayId))
      .collect();
    for (const lot of lots) {
      const lotTicketTypes = await ctx.db
        .query("ticketTypes")
        .withIndex("by_event", (q) => q.eq("eventId", day.eventId))
        .filter((q) => q.eq(q.field("lotId"), lot._id))
        .collect();
      for (const tt of lotTicketTypes) {
        const soldTickets = await ctx.db
          .query("tickets")
          .withIndex("by_ticket_type", (q) => q.eq("ticketTypeId", tt._id))
          .filter((q) => q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used")))
          .collect();
        if (soldTickets.length > 0) {
          return { success: false, message: "Não é possível deletar o dia pois há lotes com ingressos vendidos" };
        }
        await ctx.db.delete(tt._id);
      }
      await ctx.db.delete(lot._id);
    }
    for (const tt of ticketTypes) {
      await ctx.db.delete(tt._id);
    }
    await ctx.db.delete(dayId);
    return { success: true };
  },
});

export const createTicketLot = mutation({
  args: {
    eventId: v.id("events"),
    dayId: v.optional(v.id("eventDays")),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    openAt: v.optional(v.number()),
    closeAt: v.optional(v.number()),
    maxPerCpf: v.optional(v.number()),
    showOnSalesPage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      let order = args.order;
      if (order === undefined) {
        const existing = await ctx.db
          .query("ticketLots")
          .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
          .collect();
        order = existing.length > 0 ? Math.max(...existing.map(l => l.order || 0)) + 1 : 0;
      }
      const id = await ctx.db.insert("ticketLots", {
        eventId: args.eventId,
        dayId: args.dayId,
        name: args.name,
        description: args.description,
        order,
        isActive: args.isActive ?? true,
        openAt: args.openAt,
        closeAt: args.closeAt,
        maxPerCpf: args.maxPerCpf,
        showOnSalesPage: args.showOnSalesPage ?? true,
      });
      return { success: true, lotId: id, message: "Lote criado com sucesso" };
    } catch (error: any) {
      return { success: false, message: error.message || "Erro ao criar lote" };
    }
  },
});

export const updateTicketLot = mutation({
  args: {
    lotId: v.id("ticketLots"),
    dayId: v.optional(v.union(v.id("eventDays"), v.null())),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    order: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    openAt: v.optional(v.number()),
    closeAt: v.optional(v.number()),
    maxPerCpf: v.optional(v.number()),
    showOnSalesPage: v.optional(v.boolean()),
    activationSettings: v.optional(v.object({
      enabled: v.boolean(),
      activationType: v.union(
        v.literal("manual"),
        v.literal("datetime"),
        v.literal("soldout"),
        v.literal("percentage")
      ),
      activateAt: v.optional(v.number()),
      triggerTicketTypeId: v.optional(v.id("ticketTypes")),
      triggerPercentage: v.optional(v.number()),
      deactivationType: v.optional(v.union(
        v.literal("never"),
        v.literal("datetime"),
        v.literal("soldout")
      )),
      deactivateAt: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.lotId);
    if (!existing) {
      return { success: false, message: "Lote não encontrado" };
    }
    const nextDayId = args.dayId === null ? undefined : (args.dayId ?? existing.dayId);
    await ctx.db.patch(args.lotId, {
      dayId: nextDayId,
      name: args.name ?? existing.name,
      description: args.description ?? existing.description,
      order: args.order ?? existing.order,
      isActive: args.isActive ?? existing.isActive,
      openAt: args.openAt ?? existing.openAt,
      closeAt: args.closeAt ?? existing.closeAt,
      maxPerCpf: args.maxPerCpf ?? existing.maxPerCpf,
      showOnSalesPage: args.showOnSalesPage ?? existing.showOnSalesPage,
      activationSettings: args.activationSettings ?? (existing as any).activationSettings,
    });

    if (args.isActive !== undefined) {
      const ticketTypes = await ctx.db
        .query("ticketTypes")
        .withIndex("by_event", (q) => q.eq("eventId", existing.eventId))
        .filter((q) => q.eq(q.field("lotId"), args.lotId))
        .collect();

      for (const tt of ticketTypes) {
        await ctx.db.patch(tt._id, { isActive: args.isActive });
      }
    }
    return { success: true, lotId: args.lotId };
  },
});

export const deleteTicketLot = mutation({
  args: { lotId: v.id("ticketLots") },
  handler: async (ctx, { lotId }) => {
    const lot = await ctx.db.get(lotId);
    if (!lot) {
      return { success: false, message: "Lote não encontrado" };
    }
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", lot.eventId))
      .filter((q) => q.eq(q.field("lotId"), lotId))
      .collect();
    for (const tt of ticketTypes) {
      const soldTickets = await ctx.db
        .query("tickets")
        .withIndex("by_ticket_type", (q) => q.eq("ticketTypeId", tt._id))
        .filter((q) => q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used")))
        .collect();
      if (soldTickets.length > 0) {
        return { success: false, message: "Não é possível deletar lote com ingressos vendidos" };
      }
    }
    for (const tt of ticketTypes) {
      await ctx.db.delete(tt._id);
    }
    await ctx.db.delete(lotId);
    return { success: true };
  },
});



// Reordenar lotes (setores) dentro de um dia
export const reorderTicketLots = mutation({
  args: {
    lotIds: v.array(v.id("ticketLots")),
  },
  handler: async (ctx, { lotIds }) => {
    for (let i = 0; i < lotIds.length; i++) {
      await ctx.db.patch(lotIds[i], { order: i });
    }
  },
});

// Reordenar dias do evento
export const reorderEventDays = mutation({
  args: {
    dayIds: v.array(v.id("eventDays")),
  },
  handler: async (ctx, { dayIds }) => {
    for (let i = 0; i < dayIds.length; i++) {
      await ctx.db.patch(dayIds[i], { order: i });
    }
  },
});

// Reordenar tipos de ingressos dentro de um lote
export const reorderTicketTypes = mutation({
  args: {
    ticketTypeIds: v.array(v.id("ticketTypes")),
  },
  handler: async (ctx, { ticketTypeIds }) => {
    for (let i = 0; i < ticketTypeIds.length; i++) {
      await ctx.db.patch(ticketTypeIds[i], { sortOrder: i });
    }
  },
});

// Mover lote para outro dia
export const moveTicketLotToDay = mutation({
  args: {
    lotId: v.id("ticketLots"),
    newDayId: v.optional(v.union(v.id("eventDays"), v.null())),
  },
  handler: async (ctx, { lotId, newDayId }) => {
    const lot = await ctx.db.get(lotId);
    if (!lot) throw new Error("Lote não encontrado");
    
    await ctx.db.patch(lotId, { dayId: newDayId as Id<"eventDays"> });
    
    // Também atualizar o dayId de todos os ingressos dentro desse lote
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", lot.eventId))
      .filter((q) => q.eq(q.field("lotId"), lotId))
      .collect();
      
    for (const tt of ticketTypes) {
      await ctx.db.patch(tt._id, { dayId: newDayId as Id<"eventDays"> });
    }
  },
});

// Mover ingresso para outro lote
export const moveTicketTypeToLot = mutation({
  args: {
    ticketTypeId: v.id("ticketTypes"),
    newLotId: v.optional(v.union(v.id("ticketLots"), v.null())),
    newDayId: v.optional(v.union(v.id("eventDays"), v.null())),
  },
  handler: async (ctx, { ticketTypeId, newLotId, newDayId }) => {
    const updates: any = {};
    if (newLotId !== undefined) updates.lotId = newLotId;
    if (newDayId !== undefined) updates.dayId = newDayId;
    
    if (newLotId === null) updates.lotId = undefined;
    if (newDayId === null) updates.dayId = undefined;

    if (newLotId && newLotId !== null) {
      const lot = await ctx.db.get(newLotId);
      if (lot) {
        updates.isActive = (lot as any).isActive !== false;
      }
    }

    await ctx.db.patch(ticketTypeId, updates);
  },
});
