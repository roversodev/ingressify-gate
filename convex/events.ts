import { query, mutation } from "./_generated/server";
import { GenericId, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Id } from "./_generated/dataModel";
import { feeCalculations } from "../lib/fees";
const { calculateProducerAmount } = feeCalculations;

export type Metrics = {
  soldTickets: number;
  refundedTickets: number;
  cancelledTickets: number;
  revenue: number;
  refundedAmount: number; // Novo campo
  grossRevenue: number; // Receita bruta (sem descontos)
  totalDiscounts: number; // Total de descontos aplicados
  totalTickets: number;
};

export const get = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("events")
      .filter((q) => 
        q.and(
          q.eq(q.field("is_cancelled"), undefined),
          q.or(
            q.eq(q.field("isPublicOnHomepage"), true),
            q.eq(q.field("isPublicOnHomepage"), undefined)
          ),
          q.or(
            q.eq(q.field("isOnFire"), false),
            q.eq(q.field("isOnFire"), undefined)
          )
        )
      )
      .collect();
    
    // Adicionar o menor preço para cada evento
    const eventsWithLowestPrice = await Promise.all(
      events.map(async (event) => {
        // Buscar tipos de ingressos ativos para o evento
        const ticketTypes = await ctx.db
          .query("ticketTypes")
          .withIndex("by_event_active", (q) => 
            q.eq("eventId", event._id).eq("isActive", true)
          )
          .collect();
        
        // Encontrar o menor preço entre os tipos de ingressos pagos (não cortesia)
        const paidTicketTypes = ticketTypes.filter(type => !type.isCourtesy && type.currentPrice > 0);
        const lowestPrice = paidTicketTypes.length > 0
          ? Math.min(...paidTicketTypes.map(type => type.currentPrice))
          : 0;
        
        // Retornar o evento com o menor preço
        return {
          ...event,
          lowestPrice
        };
      })
    );
    
    return eventsWithLowestPrice;
  },
});

export const getById = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    return {
      _id: event._id,
      name: event.name,
      userId: event.userId,
      organizationId: event.organizationId,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      is_cancelled: event.is_cancelled,
    };
  },
});

// Nova função otimizada para o EventDashboard - retorna apenas dados básicos
export const getEventBasicInfo = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    // Retornar apenas os dados básicos do evento sem cálculos pesados
    return {
      _id: event._id,
      name: event.name,
      description: event.description,
      location: event.location,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      slug: event.slug,
      userId: event.userId,
      imageStorageId: event.imageStorageId,
      organizationId: event.organizationId,
      _creationTime: event._creationTime,
      customSections: event.customSections,
      isPublicOnHomepage: event.isPublicOnHomepage,
      allowTicketTransfers: event.allowTicketTransfers,
      customScripts: event.customScripts,
    };
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", q => q.eq("slug", slug))
      .first();
    
    if (!event) return null;

    const imageUrl = event.imageStorageId
      ? await ctx.storage.getUrl(event.imageStorageId)
      : null;

    return {
      ...event,
      imageUrl,
    };
  },
});

// Nova função para calcular métricas do evento de forma otimizada
export const getEventMetrics = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Buscar tipos de ingressos (leve)
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Calcular total de ingressos
    const totalTickets = ticketTypes.reduce((sum, type) => sum + type.totalQuantity, 0);

    // Encontrar o menor preço entre os tipos de ingressos pagos
    const paidTicketTypes = ticketTypes.filter(type => !type.isCourtesy && type.currentPrice > 0);
    const lowestPrice = paidTicketTypes.length > 0
      ? Math.min(...paidTicketTypes.map(type => type.currentPrice))
      : 0;

    const parseTicketSelectionsQuantity = (raw: any): number => {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return 0;
        return parsed.reduce((sum, sel) => sum + (typeof sel?.quantity === "number" ? sel.quantity : 0), 0);
      } catch {
        return 0;
      }
    };

    const courtesyTickets = ticketTypes
      .filter((t: any) => t.isCourtesy)
      .reduce((sum, t: any) => sum + Math.max(0, (t.totalQuantity || 0) - (t.availableQuantity || 0)), 0);

    // Buscar transações pagas para calcular receita
    const paidTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("status"), "paid"))
      .collect();

    const refundedTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("status"), "refunded"))
      .collect();

    const cancelledTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("status"), "cancelled"))
      .collect();

    // Buscar configurações de taxa do evento
    const eventFeeSettings = await ctx.db
      .query("eventFeeSettings")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .first();

    // Calcular receita líquida usando transações
    let netRevenue = 0;
    let grossRevenue = 0;
    let totalDiscounts = 0;

    for (const transaction of paidTransactions) {
      const discountAmount = transaction.metadata?.discountAmount || 0;
      const paymentMethod = transaction.paymentMethod === "CARD" ? "CARD" : "PIX";
      
      // Usar snapshot das taxas se disponível na transação, caso contrário usar as configurações atuais
      const feeSettings = transaction.metadata?.feeSnapshot || eventFeeSettings || undefined;

      // Calcular valor líquido para o produtor
      const sellerAmount = calculateProducerAmount(
        transaction.amount,
        discountAmount,
        paymentMethod,
        feeSettings,
      );
      
      netRevenue += sellerAmount;
      grossRevenue += transaction.amount;
      totalDiscounts += discountAmount;
    }

    const refundedAmount = refundedTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const refundedTicketsQuantity = refundedTransactions.reduce((sum, tx) => {
      return sum + parseTicketSelectionsQuantity(tx.metadata?.ticketSelections);
    }, 0);
    const cancelledTicketsQuantity = cancelledTransactions.reduce((sum, tx) => {
      return sum + parseTicketSelectionsQuantity(tx.metadata?.ticketSelections);
    }, 0);
    const soldTicketsQuantityFromPaidTransactions = paidTransactions.reduce((sum, tx) => {
      return sum + parseTicketSelectionsQuantity(tx.metadata?.ticketSelections);
    }, 0);

    const metrics: Metrics = {
      soldTickets: soldTicketsQuantityFromPaidTransactions + courtesyTickets,
      refundedTickets: refundedTicketsQuantity,
      cancelledTickets: cancelledTicketsQuantity,
      revenue: netRevenue,
      refundedAmount,
      grossRevenue,
      totalDiscounts,
      totalTickets,
    };

    return {
      metrics,
      lowestPrice,
    };
  },
});


// Obter ingressos do usuário com informações do evento
export const getUserTickets = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const ticketsWithEvents = await Promise.all(
      tickets.map(async (ticket) => {
        const event = await ctx.db.get(ticket.eventId);
        return {
          ...ticket,
          event,
        };
      })
    );

    return ticketsWithEvents;
  },
});

// Função simplificada para compra direta
export const purchaseTicketsDirect = mutation({
  args: {
    eventId: v.id("events"),
    ticketTypeId: v.id("ticketTypes"),
    userId: v.string(),
    quantity: v.number(),
    paymentInfo: v.object({
      paymentIntentId: v.string(),
      totalAmount: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // Verificar se evento existe e está ativo
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Evento não encontrado");
    if (event.is_cancelled) throw new Error("Evento cancelado");

    // Verificar tipo de ingresso
    const ticketType = await ctx.db.get(args.ticketTypeId);
    if (!ticketType) throw new Error("Tipo de ingresso não encontrado");
    if (!ticketType.isActive) throw new Error("Tipo de ingresso não disponível");

    // Verificar disponibilidade
    if (ticketType.availableQuantity < args.quantity) {
      throw new Error(`Apenas ${ticketType.availableQuantity} ingressos disponíveis`);
    }

    // Calcular preço
    const unitPrice = ticketType.currentPrice;
    const expectedTotal = unitPrice * args.quantity;

    if (Math.abs(expectedTotal - args.paymentInfo.totalAmount) > 1) {
      throw new Error("Valor do pagamento não confere");
    }

    // Criar ticket
    const ticketId = await ctx.db.insert("tickets", {
      eventId: args.eventId,
      ticketTypeId: args.ticketTypeId,
      userId: args.userId,
      quantity: args.quantity,
      unitPrice,
      totalAmount: args.paymentInfo.totalAmount,
      purchasedAt: Date.now(),
      status: "valid",
      paymentIntentId: args.paymentInfo.paymentIntentId,
    });

    // Atualizar disponibilidade
    await ctx.db.patch(args.ticketTypeId, {
      availableQuantity: ticketType.availableQuantity - args.quantity,
    });

    return { ticketId, success: true };
  },
});

// Função para obter disponibilidade de um evento
export const getEventAvailability = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event_active", (q) =>
        q.eq("eventId", eventId).eq("isActive", true)
      )
      .collect();

    // Get all tickets for this event
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Count validated tickets (status = "used")
    const validatedTickets = tickets.filter(t => t.status === "used")
      .reduce((sum, ticket) => sum + ticket.quantity, 0);

    // Count purchased tickets (status = "valid" or "used")
    const purchasedTickets = tickets.filter(t => t.status === "valid" || t.status === "used")
      .reduce((sum, ticket) => sum + ticket.quantity, 0);

    const totalAvailable = ticketTypes.reduce((sum, type) => sum + type.availableQuantity, 0);
    const totalCapacity = ticketTypes.reduce((sum, type) => sum + type.totalQuantity, 0);
    const totalTickets = ticketTypes.reduce((sum, type) => sum + type.totalQuantity, 0);

    // Find lowest price among active ticket types (excluding courtesy tickets)
    const paidTicketTypes = ticketTypes.filter(type => !type.isCourtesy && type.currentPrice > 0);
    const lowestPrice = paidTicketTypes.length > 0
      ? Math.min(...paidTicketTypes.map(type => type.currentPrice))
      : 0;

    return {
      isSoldOut: totalAvailable === 0,
      totalAvailable,
      totalCapacity,
      totalTickets,
      lowestPrice,
      validatedTickets,
      purchasedTickets,
      ticketTypes: ticketTypes.map(type => ({
        id: type._id,
        name: type.name,
        price: type.currentPrice,
        available: type.availableQuantity,
        total: type.totalQuantity,
      })),
    };
  },
});


export const getEventAvailabilityValidar = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {

    // Get all tickets for this event
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Count validated tickets (status = "used")
    const validatedTickets = tickets.filter(t => t.status === "used")
      .reduce((sum, ticket) => sum + ticket.quantity, 0);

    // Count purchased tickets (status = "valid" or "used")
    const purchasedTickets = tickets.filter(t => t.status === "valid" || t.status === "used")
      .reduce((sum, ticket) => sum + ticket.quantity, 0);

    return {
      validatedTickets,
      purchasedTickets,
    };
  },
});



export const getEventAvailabilityEventPage = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event_active", (q) =>
        q.eq("eventId", eventId).eq("isActive", true)
      )
      .collect();

    // Get all tickets for this event
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Count purchased tickets (status = "valid" or "used")
    const purchasedTickets = tickets.filter(t => t.status === "valid" || t.status === "used")
      .reduce((sum, ticket) => sum + ticket.quantity, 0);

    const totalCapacity = ticketTypes.reduce((sum, type) => sum + type.totalQuantity, 0);
    const totalTickets = ticketTypes.reduce((sum, type) => sum + type.totalQuantity, 0);

    return {
      totalCapacity,
      purchasedTickets,
      totalTickets,
    };
  },
});


export const getEventAvailabilityTotalAvailable = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event_active", (q) =>
        q.eq("eventId", eventId).eq("isActive", true)
      )
      .collect();


    const totalAvailable = ticketTypes.reduce((sum, type) => sum + type.availableQuantity, 0);

    return {
      totalAvailable,
    };
  },
});




export const search = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, { searchTerm }) => {
    const events = await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("is_cancelled"), undefined))
      .collect();

    return events.filter((event) => {
      const searchTermLower = searchTerm.toLowerCase();
      return (
        event.name.toLowerCase().includes(searchTermLower) ||
        event.description.toLowerCase().includes(searchTermLower) ||
        event.location?.toLowerCase().includes(searchTermLower) || false
      );
    });
  },
});

export const getSellerEvents = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const events = await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    const eventsWithMetrics = await Promise.all(
      events.map(async (event) => {
        const tickets = await ctx.db
          .query("tickets")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();

        // Buscar tipos de ingressos para calcular total
        const ticketTypes = await ctx.db
          .query("ticketTypes")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();

        const totalTickets = ticketTypes.reduce((sum, type) => sum + type.totalQuantity, 0);

        const validTickets = tickets.filter(
          (t) => t.status === "valid" || t.status === "used"
        );
        const refundedTickets = tickets.filter((t) => t.status === "refunded");
        const cancelledTickets = tickets.filter(
          (t) => t.status === "cancelled"
        );

        // Buscar configurações de taxa do evento
        const eventFeeSettings = await ctx.db
          .query("eventFeeSettings")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .first();

        // Buscar transações pagas para calcular receita líquida real
        const paidTransactions = await ctx.db
          .query("transactions")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .filter((q) => q.eq(q.field("status"), "paid"))
          .collect();

        const revenueFromTransactions = paidTransactions.reduce((total, tx) => {
          const discountAmount = tx.metadata?.discountAmount || 0;
          const paymentMethod = (tx.paymentMethod === "credit_card" || tx.paymentMethod === "CARD") ? "CARD" : "PIX";
          const sellerAmount = calculateProducerAmount(
            tx.metadata?.baseAmount || tx.amount,
            discountAmount,
            paymentMethod,
            eventFeeSettings || undefined
          );
          return total + sellerAmount;
        }, 0);

        // Na função getSellerEvents, dentro do cálculo de metrics:
        const metrics: Metrics = {
          soldTickets: validTickets.reduce((sum, ticket) => sum + ticket.quantity, 0),
          refundedTickets: refundedTickets.reduce((sum, ticket) => sum + ticket.quantity, 0),
          cancelledTickets: cancelledTickets.reduce((sum, ticket) => sum + ticket.quantity, 0),
          // Receita líquida alinhada com o financeiro (usando transações e taxas)
          revenue: revenueFromTransactions,
          // Receita bruta (valor original sem descontos)
          grossRevenue: validTickets.reduce((total, ticket) => total + (ticket.originalAmount || ticket.totalAmount || 0), 0),
          // Total de descontos aplicados
          totalDiscounts: validTickets.reduce((total, ticket) => total + (ticket.discountAmount || 0), 0),
          refundedAmount: refundedTickets.reduce((total, ticket) => total + ticket.totalAmount, 0),
          totalTickets: totalTickets,
        };

        return {
          ...event,
          totalTickets,
          metrics,
        };
      })
    );

    return eventsWithMetrics;
  },
});

// Função para gerar um slug único
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9]+/g, "-")     // Substitui caracteres não alfanuméricos por hífen
    .replace(/^-+|-+$/g, "")         // Remove hífens do início e do fim
    .replace(/--+/g, "-");           // Evita múltiplos hífens consecutivos
}

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    hasMultipleDays: v.optional(v.boolean()),
    location:  v.optional(v.string()),
    latitude: v.optional(v.float64()),
    longitude: v.optional(v.float64()),
    placeId: v.optional(v.string()),
    eventStartDate: v.number(),
    eventEndDate: v.number(),
    userId: v.string(),
    organizationId: v.id("organizations"),
    customSections: v.optional(v.array(v.object({
      type: v.string(),
      title: v.optional(v.string()),
      content: v.any(),
      order: v.number(),
      isActive: v.boolean(),
    }))),
  },
  handler: async (ctx, args) => {
    const slug = generateSlug(args.name);

    const eventId = await ctx.db.insert("events", {
      ...args,
      slug,
      hasMultipleDays: args.hasMultipleDays ?? false,
      customSections: args.customSections || [],
      organizationId: args.organizationId ?? '',
    });

    return { _id: eventId, slug };
  },
});

export const updateEvent = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    hasMultipleDays: v.optional(v.boolean()),
    slug: v.optional(v.string()),
    description: v.string(),
    location: v.string(),
    latitude: v.optional(v.float64()),
    longitude: v.optional(v.float64()),
    placeId: v.optional(v.string()),
    eventStartDate: v.number(),
    eventEndDate: v.number(),
    customSections: v.optional(v.array(v.object({
      type: v.string(),
      title: v.optional(v.string()),
      content: v.any(),
      order: v.number(),
      isActive: v.boolean(),
    }))),
  },
  handler: async (ctx, { eventId, ...rest }) => {
    // Se o nome mudou, gera um novo slug. Se um slug foi passado, usa ele.
    const slug = rest.slug ? rest.slug : generateSlug(rest.name);

    await ctx.db.patch(eventId, {
      ...rest,
      slug,
      hasMultipleDays: rest.hasMultipleDays ?? false,
      ...(rest.customSections !== undefined && { customSections: rest.customSections }),
    });
  },
});

export const cancelEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Evento não encontrado");

    // Verificar apenas ingressos PAGOS ativos (ignorar cortesias)
    const paidTickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.and(
          q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used")),
          q.gt(q.field("totalAmount"), 0) // Ignorar ingressos cortesia
        )
      )
      .collect();

    if (paidTickets.length > 0) {
      throw new Error(
        "Não é possível cancelar evento com ingressos pagos ativos. Por favor, reembolse todos os ingressos pagos primeiro."
      );
    }

    // Cancelar automaticamente todos os ingressos cortesia
    const courtesyTickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.and(
          q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used")),
          q.eq(q.field("totalAmount"), 0) // Apenas ingressos cortesia
        )
      )
      .collect();

    // Atualizar status de todos os ingressos cortesia para "cancelled"
    for (const ticket of courtesyTickets) {
      await ctx.db.patch(ticket._id, { status: "cancelled" });
    }

    // Cancelar o evento
    await ctx.db.patch(eventId, {
      is_cancelled: true,
    });

    return { success: true };
  },
});

// Na mutation purchaseTickets, adicionar os parâmetros:
export const purchaseTickets = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
    ticketSelections: v.array(v.object({
      ticketTypeId: v.id("ticketTypes"),
      quantity: v.number(),
    })),
    paymentIntentId: v.string(),
    promoterCode: v.optional(v.string()),
    couponCode: v.optional(v.string()),
    discountAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Evento não encontrado");
    }

    // Parse ticket selections
    const selections: Array<{ ticketTypeId: Id<"ticketTypes">, quantity: number }> =
      typeof args.ticketSelections === 'string'
        ? JSON.parse(args.ticketSelections)
        : args.ticketSelections;

    const createdTickets = [];

    // Verificar se o promoter existe (se fornecido)
    let promoter = null;
    if (args.promoterCode) {
      promoter = await ctx.db
        .query("promoters")
        .withIndex("by_event_code", (q) =>
          q.eq("eventId", args.eventId).eq("code", args.promoterCode!)
        )
        .first();

      if (!promoter) {
        console.warn(`Promoter code ${args.promoterCode} not found or inactive`);
      }
    }

    for (const selection of selections) {
      const ticketType = await ctx.db.get(selection.ticketTypeId);
      if (!ticketType) {
        throw new Error(`Tipo de ingresso não encontrado: ${selection.ticketTypeId}`);
      }

      // Check availability
      if (selection.quantity > ticketType.availableQuantity) {
        throw new Error(`Quantidade solicitada (${selection.quantity}) excede disponibilidade (${ticketType.availableQuantity}) para ${ticketType.name}`);
      }

      // Create tickets - INCLUIR INFORMAÇÕES DO CUPOM AQUI
      for (let i = 0; i < selection.quantity; i++) {
        // Calcular o valor real pago por ingresso considerando desconto
        const totalTicketsInPurchase = selections.reduce((sum, sel) => sum + sel.quantity, 0);
        const discountPerTicket = args.discountAmount ? args.discountAmount / totalTicketsInPurchase : 0;
        const actualAmountPaid = Math.max(0, ticketType.currentPrice - discountPerTicket);

        const ticketId = await ctx.db.insert("tickets", {
          eventId: args.eventId,
          userId: args.userId,
          ticketTypeId: selection.ticketTypeId,
          quantity: 1,
          unitPrice: ticketType.currentPrice,
          totalAmount: actualAmountPaid,
          purchasedAt: Date.now(),
          status: "valid",
          paymentIntentId: args.paymentIntentId,
          promoterCode: args.promoterCode,
          couponCode: args.couponCode,
          discountAmount: args.discountAmount,
          originalAmount: ticketType.currentPrice,
        });
        createdTickets.push(ticketId);
      }

      // Update available quantity
      await ctx.db.patch(selection.ticketTypeId, {
        availableQuantity: ticketType.availableQuantity - selection.quantity,
      });
    }

    // Atualizar estatísticas do promoter (se existir)
    if (promoter) {
      const totalSales = createdTickets.length;

      // Buscar todos os ticket types de uma vez
      const ticketTypesPromises = selections.map(sel => ctx.db.get(sel.ticketTypeId));
      const ticketTypesResults = await Promise.all(ticketTypesPromises);

      const totalRevenue = selections.reduce((sum, sel, index) => {
        const ticketType = ticketTypesResults[index];
        return sum + (ticketType?.currentPrice || 0) * sel.quantity;
      }, 0);

      await ctx.db.patch(promoter._id, {
        totalSales: (promoter.totalSales || 0) + totalSales,
        totalRevenue: (promoter.totalRevenue || 0) + totalRevenue,
      });
    }

    return { ticketIds: createdTickets };
  },
});


// Função para gerar ingressos cortesia
export const getOrCreateCourtesyTicketType = mutation({
  args: {
    eventId: v.id("events"),
    organizerId: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if courtesy ticket type already exists for this event
    const existingCourtesyType = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("isCourtesy"), true))
      .first();

    if (existingCourtesyType) {
      return existingCourtesyType._id;
    }

    // Create new courtesy ticket type
    const courtesyTicketTypeId = await ctx.db.insert("ticketTypes", {
      eventId: args.eventId,
      name: "Cortesia",
      description: "Ingresso cortesia",
      totalQuantity: 1000, // High number for courtesy tickets
      availableQuantity: 1000,
      currentPrice: 0,
      isActive: true,
      sortOrder: 999, // Put at the end
      isCourtesy: true,
    });

    return courtesyTicketTypeId;
  },
});

export const generateCourtesyTickets = mutation({
  args: {
    eventId: v.id("events"),
    ticketTypeId: v.optional(v.id("ticketTypes")),
    userEmail: v.string(),
    quantity: v.number(),
    generatedBy: v.string(),
    recipientName: v.optional(v.string()),
    customMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify user exists - DO NOT create if doesn't exist
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .first();

    if (!user) {
      throw new Error(`Usuário com email ${args.userEmail} não está cadastrado no sistema. Apenas usuários cadastrados podem receber ingressos cortesia.`);
    }

    // Buscar o evento
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Evento não encontrado");
    }

    // Verificar permissão: o usuário é o dono do evento OU é membro da organização
    let hasPermission = event.userId === args.generatedBy;
    
    // Se não é o dono e o evento pertence a uma organização, verificar se é membro
    if (!hasPermission && event.organizationId) {
      const membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization_user", (q) => 
          q.eq("organizationId", event.organizationId!).eq("userId", args.generatedBy)
        )
        .filter((q) => 
          q.eq(q.field("status"), "active")
        )
        .first();

      hasPermission = !!membership;
    }

    if (!hasPermission) {
      throw new Error("Você não tem permissão para gerar cortesias para este evento");
    }

    // Get or create courtesy ticket type
    let ticketTypeId = args.ticketTypeId;
    if (!ticketTypeId) {
      ticketTypeId = await getOrCreateCourtesyTicketType(ctx, {
        eventId: args.eventId,
        organizerId: args.generatedBy,
      });
    }

    // Verify ticket type availability
    if (!ticketTypeId) throw new Error("Ticket type ID is required");
    const ticketType = await ctx.db.get(ticketTypeId);
    if (!ticketType) {
      throw new Error("Tipo de ingresso não encontrado");
    }

    if (ticketType.availableQuantity < args.quantity) {
      throw new Error("Quantidade insuficiente disponível");
    }

    // Create courtesy ticket
    // Create individual courtesy tickets (one for each quantity)
    const ticketIds: GenericId<"tickets">[] = [];

    for (let i = 0; i < args.quantity; i++) {
      const ticketId = await ctx.db.insert("tickets", {
        eventId: args.eventId,
        ticketTypeId,
        userId: user.userId,
        quantity: 1, // Sempre 1 para cada ticket individual
        unitPrice: 0,
        totalAmount: 0,
        purchasedAt: Date.now(),
        status: "valid",
      });

      ticketIds.push(ticketId);
    }

    // Update available quantity
    await ctx.db.patch(ticketTypeId, {
      availableQuantity: ticketType.availableQuantity - args.quantity,
    });

    return { ticketIds }; // Retorna array de IDs ao invés de um único ID
  },
});

export const cancelCourtesyTicket = mutation({
  args: {
    ticketId: v.id("tickets"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Cortesia não encontrada");
    }

    const event = await ctx.db.get(ticket.eventId);
    if (!event) {
      throw new Error("Evento não encontrado");
    }

    let hasPermission = event.userId === args.userId;
    if (!hasPermission && event.organizationId) {
      const membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization_user", (q) =>
          q.eq("organizationId", event.organizationId!).eq("userId", args.userId)
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
      hasPermission = !!membership;
    }

    if (!hasPermission) {
      throw new Error("Sem permissão para cancelar esta cortesia");
    }

    const ticketType = await ctx.db.get(ticket.ticketTypeId);
    const isCourtesy =
      ticket.totalAmount === 0 || (ticketType && (ticketType as any).isCourtesy);

    if (!isCourtesy) {
      throw new Error("Este ingresso não é uma cortesia");
    }

    if (ticket.status !== "valid") {
      throw new Error("Apenas cortesias válidas podem ser canceladas");
    }

    await ctx.db.patch(ticket._id, {
      status: "cancelled",
    });

    if (ticketType) {
      const incrementBy = ticket.quantity || 1;
      const rawNextAvailable = (ticketType as any).availableQuantity + incrementBy;
      const nextAvailable =
        typeof (ticketType as any).totalQuantity === "number"
          ? Math.min((ticketType as any).totalQuantity, rawNextAvailable)
          : rawNextAvailable;

      await ctx.db.patch(ticket.ticketTypeId, {
        availableQuantity: nextAvailable,
      });
    }

    return { success: true };
  },
});


export const getEventBuyers = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {

    // Buscar todos os tickets do evento (incluindo cancelados para contexto completo)
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Buscar informações dos usuários, tipos de ingresso e quem validou (se houver)
    const buyersData = await Promise.all(
      tickets.map(async (ticket) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", ticket.userId))
          .first();
        const ticketType = await ctx.db.get(ticket.ticketTypeId);

        // NOVO: buscar quem validou (se houver)
        const validatorUser = ticket.validatedBy
          ? await ctx.db
              .query("users")
              .withIndex("by_user_id", (q) => q.eq("userId", ticket.validatedBy as string))
              .first()
          : null;
        
        return {
          name: user?.name,
          email: user?.email,
          phone: user?.phone,
          ticketStatus: ticket.status,
          purchaseDate: ticket.purchasedAt,
          totalAmount: ticket.totalAmount,
          ticketTypeName: ticketType?.name || "Tipo não encontrado",
          validatedAt: ticket.validatedAt ?? null,
          validatedBy: ticket.validatedBy ?? null,
          validatorName: validatorUser?.name ?? null,
        };
      })
    );

    return buyersData;
  },
});

export const getEventFinancialMetrics = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const now = Date.now();
    const start30d = now - 30 * 24 * 60 * 60 * 1000;

    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    const typeNameById = new Map(ticketTypes.map((t: any) => [String(t._id), t.name]));

    const parseTicketSelections = (raw: any): Array<{ ticketTypeId?: string; quantity?: number; price?: number; name?: string }> => {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed;
      } catch {
        return [];
      }
    };

    const paidTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_event_created_at", (q) => q.eq("eventId", eventId).gte("createdAt", start30d))
      .filter((q) => q.eq(q.field("status"), "paid"))
      .collect();

    // Receita por tipo (últimos 30 dias) usando ticketSelections no metadata
    const revenueByType = new Map<string, { typeName: string; revenue: number; quantity: number }>();
    for (const tx of paidTransactions) {
      const selections = parseTicketSelections((tx as any).metadata?.ticketSelections);
      for (const sel of selections) {
        const ticketTypeId = sel.ticketTypeId ? String(sel.ticketTypeId) : "";
        const quantity = typeof sel.quantity === "number" ? sel.quantity : 0;
        const unitPrice = typeof sel.price === "number" ? sel.price : 0;
        if (!ticketTypeId || quantity <= 0) continue;

        const typeName = sel.name || typeNameById.get(ticketTypeId) || "Ingresso";
        const current = revenueByType.get(ticketTypeId) || { typeName, revenue: 0, quantity: 0 };
        current.revenue += unitPrice * quantity;
        current.quantity += quantity;
        revenueByType.set(ticketTypeId, current);
      }
    }

    const salesByType = Array.from(revenueByType.values()).map((row) => ({
      typeName: row.typeName,
      revenue: row.revenue,
      quantity: row.quantity,
      averagePrice: row.quantity > 0 ? row.revenue / row.quantity : 0,
    }));

    // Métricas por período (últimos 30 dias) — alinhado ao financeiro usando transações
    const eventFeeSettings = await ctx.db
      .query("eventFeeSettings")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .first();

    const dailySales = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = now - (i * 24 * 60 * 60 * 1000);
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);

      const dayTxs = paidTransactions.filter(
        (tx) => tx.createdAt >= dayStart && tx.createdAt < dayEnd
      );

      const dayRevenue = dayTxs.reduce((sum, tx) => {
        const discountAmount = tx.metadata?.discountAmount || 0;
        const paymentMethod = tx.paymentMethod === "CARD" ? "CARD" : "PIX";
        const sellerAmount = calculateProducerAmount(
          tx.amount,
          discountAmount,
          paymentMethod,
          eventFeeSettings || undefined,
        );
        return sum + sellerAmount;
      }, 0);

      const dayQuantity = dayTxs.reduce((sum, tx) => {
        const selections = parseTicketSelections((tx as any).metadata?.ticketSelections);
        return sum + selections.reduce((acc, sel) => acc + (typeof sel?.quantity === "number" ? sel.quantity : 0), 0);
      }, 0);

      dailySales.push({
        date: new Date(dayStart).toISOString().split('T')[0],
        revenue: dayRevenue,
        quantity: dayQuantity,
      });
    }

    return {
      salesByType,
      dailySales
    };
  },
});

// Função otimizada para listar proprietários de ingressos com paginação
export const getEventTicketHoldersOptimized = query({
  args: { 
    eventId: v.id("events"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { eventId, limit = 10 }) => {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.or(
        q.eq(q.field("status"), "valid"),
        q.eq(q.field("status"), "used")
      ))
      .collect();

    // Agrupar tickets por usuário de forma mais eficiente
    const holderMap = new Map();
    const userIds = new Set<string>();

    // Primeiro passo: agrupar tickets e coletar IDs únicos de usuários
    for (const ticket of tickets) {
      userIds.add(ticket.userId);
      const key = ticket.userId;
      
      if (!holderMap.has(key)) {
        holderMap.set(key, {
          userId: ticket.userId,
          tickets: [],
          totalTickets: 0,
          totalValue: 0
        });
      }

      const holder = holderMap.get(key);
      holder.totalTickets += ticket.quantity;
      holder.totalValue += ticket.totalAmount;
    }

    // Segundo passo: buscar dados dos usuários em lote
    const users = await Promise.all(
      Array.from(userIds).map(userId =>
        ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", userId))
          .first()
      )
    );

    // Terceiro passo: mapear dados dos usuários
    const userMap = new Map();
    users.forEach(user => {
      if (user) {
        userMap.set(user.userId, user);
      }
    });

    // Quarto passo: construir resultado final
    const holders = Array.from(holderMap.values())
      .map(holder => {
        const user = userMap.get(holder.userId);
        return {
          ...holder,
          userName: user?.name || "Nome não disponível",
          userEmail: user?.email || "Email não disponível",
        };
      })
      .sort((a, b) => b.totalTickets - a.totalTickets)
      .slice(0, limit);

    return {
      holders,
      totalHolders: holderMap.size,
      totalTickets: Array.from(holderMap.values()).reduce((sum, h) => sum + h.totalTickets, 0),
      totalValue: Array.from(holderMap.values()).reduce((sum, h) => sum + h.totalValue, 0),
    };
  }
});

// Mutation para processar compra via FreePay
export const purchaseTicketsWithFreePay = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.string(), // This is Clerk's user ID
    ticketSelections: v.array(
      v.object({
        ticketTypeId: v.id("ticketTypes"),
        quantity: v.number(),
      })
    ),
    transactionId: v.string(),
    promoterCode: v.optional(v.string()),
    couponCode: v.optional(v.string()),
    discountAmount: v.optional(v.number()),
    customerName: v.string(),
    customerEmail: v.string(),
    customerCpf: v.string(),
  },
  handler: async (ctx, args) => {
    // Verificar idempotência - se já existem ingressos para esta transação
    const existingTickets = await ctx.db
      .query("tickets")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.transactionId))
      .collect();

    if (existingTickets.length > 0) {
      console.log('🔄 Ingressos já existem para transação:', args.transactionId);
      return { ticketIds: existingTickets.map(t => t._id) };
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Evento não encontrado!");
    }

    if (event.is_cancelled) {
      throw new Error("Este evento foi cancelado.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .first();

    if (!user) {
      throw new Error("Usuário (comprador) não encontrado!");
    }

    // Verificar e aplicar promoção/cupom
    let promoter = null;
    if (args.promoterCode) {
      promoter = await ctx.db
        .query("promoters")
        .withIndex("by_event_code", (q) =>
          q.eq("eventId", args.eventId).eq("code", args.promoterCode!)
        )
        .first();
    }

    let coupon = null;
    if (args.couponCode) {
      coupon = await ctx.db
        .query("coupons")
        .withIndex("by_event_code", (q) =>
          q.eq("eventId", args.eventId).eq("code", args.couponCode!)
        )
        .first();
    }

    const totalTicketsRequested = args.ticketSelections.reduce(
      (sum, s) => sum + s.quantity,
      0
    );
    const finalDiscountPerTicket =
      args.discountAmount && totalTicketsRequested > 0
        ? args.discountAmount / totalTicketsRequested
        : undefined;

    const ticketIds: Id<"tickets">[] = [];
    for (const selection of args.ticketSelections) {
      const ticketType = await ctx.db.get(selection.ticketTypeId);
      if (!ticketType) {
        throw new Error(
          `Tipo de ingresso ${selection.ticketTypeId} não encontrado.`
        );
      }
      
      if (ticketType.availableQuantity < selection.quantity) {
        throw new Error(
          `Não há ingressos suficientes para o tipo "${ticketType.name}". Disponíveis: ${ticketType.availableQuantity}, Solicitados: ${selection.quantity}.`
        );
      }

      for (let i = 0; i < selection.quantity; i++) {
        const ticketId = await ctx.db.insert("tickets", {
          eventId: args.eventId,
          ticketTypeId: selection.ticketTypeId,
          userId: args.userId,
          quantity: 1,
          unitPrice: ticketType.currentPrice,
          totalAmount: ticketType.currentPrice,
          purchasedAt: Date.now(),
          status: "valid",
          transactionId: args.transactionId,
          promoterCode: args.promoterCode,
          couponCode: args.couponCode,
          discountAmount: finalDiscountPerTicket,
          originalAmount: ticketType.currentPrice,
          paymentIntentId: args.transactionId,
        });
        ticketIds.push(ticketId);
      }

      await ctx.db.patch(ticketType._id, {
        availableQuantity: ticketType.availableQuantity - selection.quantity,
      });
    }

    return { ticketIds };
  },
});

// Mutation para salvar referência da transação
export const saveTransactionReference = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
    transactionId: v.string(),
    customerId: v.string(),
    amount: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    // Esta função pode ser usada para salvar informações adicionais sobre a transação
    // Por exemplo, em uma tabela separada de transações se necessário
    console.log(`Transaction reference saved: ${args.transactionId} for event ${args.eventId}, customer: ${args.customerId}`);
    return { success: true };
  },
});

export const getOrganizationEvents = query({
  args: { 
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { organizationId }) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();

    const eventsWithMetrics = await Promise.all(
      events.map(async (event) => {
        const tickets = await ctx.db
          .query("tickets")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();

        // Buscar tipos de ingressos para calcular total
        const ticketTypes = await ctx.db
          .query("ticketTypes")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();

        const totalTickets = ticketTypes.reduce((sum, type) => sum + type.totalQuantity, 0);

        const validTickets = tickets.filter(
          (t) => t.status === "valid" || t.status === "used"
        );
        const refundedTickets = tickets.filter((t) => t.status === "refunded");
        const cancelledTickets = tickets.filter(
          (t) => t.status === "cancelled"
        );

        // Buscar configurações de taxa do evento
        const eventFeeSettings = await ctx.db
          .query("eventFeeSettings")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .first();

        // Buscar transações pagas para calcular receita líquida real
        const paidTransactions = await ctx.db
          .query("transactions")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .filter((q) => q.eq(q.field("status"), "paid"))
          .collect();

        const revenueFromTransactions = paidTransactions.reduce((total, tx) => {
          const discountAmount = tx.metadata?.discountAmount || 0;
          const paymentMethod = (tx.paymentMethod === "credit_card" || tx.paymentMethod === "CARD") ? "CARD" : "PIX";
          const sellerAmount = calculateProducerAmount(
            tx.metadata?.baseAmount || tx.amount,
            discountAmount,
            paymentMethod,
            eventFeeSettings || undefined
          );
          return total + sellerAmount;
        }, 0);

        const grossFromTransactions = paidTransactions.reduce((total, tx) => total + (tx.metadata?.baseAmount || tx.amount || 0), 0);

        const metrics: Metrics = {
          soldTickets: validTickets.reduce((sum, ticket) => sum + ticket.quantity, 0),
          refundedTickets: refundedTickets.reduce((sum, ticket) => sum + ticket.quantity, 0),
          cancelledTickets: cancelledTickets.reduce((sum, ticket) => sum + ticket.quantity, 0),
          // Receita líquida alinhada com o financeiro (usando transações e taxas)
          revenue: revenueFromTransactions,
          // Receita bruta: total pago pelo cliente nas transações
          grossRevenue: grossFromTransactions,
          // Total de descontos aplicados
          totalDiscounts: validTickets.reduce((total, ticket) => total + (ticket.discountAmount || 0), 0),
          refundedAmount: refundedTickets.reduce((total, ticket) => total + ticket.totalAmount, 0),
          totalTickets: totalTickets,
        };

        return {
          ...event,
          totalTickets,
          metrics,
        };
      })
    );

    return eventsWithMetrics;
  },
});

// Nova função otimizada para buscar apenas dados básicos dos eventos (para seletor)
export const getOrganizationEventsBasic = query({
  args: { 
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { organizationId }) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();

    // Retornar apenas dados básicos necessários para o seletor
    return events.map((event) => ({
      _id: event._id,
      name: event.name,
      imageStorageId: event.imageStorageId,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      is_cancelled: event.is_cancelled,
    }));
  },
});


// Função para buscar todos os eventos publicados (não cancelados) para o sitemap
export const getPublishedEvents = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("is_cancelled"), undefined))
      .collect();
    
    // Retornar apenas os dados necessários para o sitemap
    return events.map(event => ({
      _id: event._id,
      slug: event.slug,
      name: event.name,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
    }));
  },
});

// Obter estatísticas demográficas dos compradores de ingressos do evento
export const getEventDemographicStats = query({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    // Buscar o evento
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Evento não encontrado");
    }

    // Inicializar estatísticas
    const stats = {
      // Estatísticas por gênero
      genderStats: {
        male: 0,
        female: 0,
        other: 0,
        prefer_not_to_say: 0,
        not_informed: 0,
      },
      // Estatísticas por faixa etária
      ageStats: {
        under18: 0,
        age18to24: 0,
        age25to34: 0,
        age35to44: 0,
        age45to54: 0,
        age55plus: 0,
        not_informed: 0,
      },
      // Total de compradores únicos
      uniqueBuyers: 0,
      // Compradores com perfil completo
      buyersWithCompleteProfile: 0,
    };

    // Conjunto para rastrear compradores únicos
    const uniqueBuyerIds = new Set();
    const buyersWithCompleteProfileIds = new Set();

    // Buscar tickets válidos do evento
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.or(
        q.eq(q.field("status"), "valid"),
        q.eq(q.field("status"), "used")
      ))
      .collect();

    // Para cada ticket, buscar informações do comprador
    for (const ticket of tickets) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", ticket.userId))
        .first();

      if (user) {
        // Adicionar ao conjunto de compradores únicos
        uniqueBuyerIds.add(user.userId);

        // Verificar se o perfil está completo
        if (user.profileComplete) {
          buyersWithCompleteProfileIds.add(user.userId);
        }

        // Contabilizar por gênero
        if (user.gender) {
          if (user.gender && user.gender in stats.genderStats) {
            if (user.gender === 'male' || user.gender === 'female' || 
                user.gender === 'other' || user.gender === 'prefer_not_to_say') {
              stats.genderStats[user.gender]++;
            } else {
              stats.genderStats.not_informed++;
            }
          } else {
            stats.genderStats.not_informed++;
          }
        } else {
          stats.genderStats.not_informed++;
        }

        // Contabilizar por faixa etária
        if (user.birthDate) {
          const birthDate = new Date(user.birthDate);
          const today = new Date();
          const age = today.getFullYear() - birthDate.getFullYear();
          
          // Ajustar se o aniversário ainda não ocorreu este ano
          const monthDiff = today.getMonth() - birthDate.getMonth();
          const dayDiff = today.getDate() - birthDate.getDate();
          const adjustedAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

          // Classificar por faixa etária
          if (adjustedAge < 18) {
            stats.ageStats.under18++;
          } else if (adjustedAge >= 18 && adjustedAge <= 24) {
            stats.ageStats.age18to24++;
          } else if (adjustedAge >= 25 && adjustedAge <= 34) {
            stats.ageStats.age25to34++;
          } else if (adjustedAge >= 35 && adjustedAge <= 44) {
            stats.ageStats.age35to44++;
          } else if (adjustedAge >= 45 && adjustedAge <= 54) {
            stats.ageStats.age45to54++;
          } else if (adjustedAge >= 55) {
            stats.ageStats.age55plus++;
          }
        } else {
          stats.ageStats.not_informed++;
        }
      }
    }

    // Atualizar contagens totais
    stats.uniqueBuyers = uniqueBuyerIds.size;
    stats.buyersWithCompleteProfile = buyersWithCompleteProfileIds.size;

    return stats;
  },
});

// Nova query para agrupar tickets por evento
export const getUserTicketsGroupedByEvent = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Agrupar tickets por evento
    const eventGroups = new Map();
    
    for (const ticket of tickets) {
      const event = await ctx.db.get(ticket.eventId);
      if (!event) continue;
      
      const eventId = ticket.eventId;
      if (!eventGroups.has(eventId)) {
        eventGroups.set(eventId, {
          event,
          tickets: [],
          totalTickets: 0,
          totalAmount: 0,
        });
      }
      
      const group = eventGroups.get(eventId);
      group.tickets.push(ticket);
      group.totalTickets += ticket.quantity;
      group.totalAmount += ticket.totalAmount;
    }
    
    // Converter Map para array e ordenar por data do evento
    const groupedTickets = Array.from(eventGroups.values())
      .sort((a, b) => {
        // Eventos futuros primeiro, depois passados
        const now = Date.now();
        const aIsFuture = a.event.eventStartDate > now;
        const bIsFuture = b.event.eventStartDate > now;
        
        if (aIsFuture && !bIsFuture) return -1;
        if (!aIsFuture && bIsFuture) return 1;
        
        // Se ambos são futuros ou passados, ordenar por data
        return aIsFuture 
          ? a.event.eventStartDate - b.event.eventStartDate
          : b.event.eventStartDate - a.event.eventStartDate;
      });
    
    return groupedTickets;
  },
});



export const updateEventSettings = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
    isPublicOnHomepage: v.optional(v.boolean()),
    allowTicketTransfers: v.optional(v.boolean()),
    customScripts: v.optional(v.object({
      metaPixel: v.optional(v.string()),
      googleAnalytics: v.optional(v.string()),
      googleTagManager: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {

    // Verificar se o evento existe e se o usuário tem permissão
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Evento não encontrado");
    }

    // Verificar se o usuário é o dono do evento ou membro da organização
    if (event.userId !== args.userId) {
      if (event.organizationId) {
        const membership = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization_user", (q) =>
            q.eq("organizationId", event.organizationId as Id<"organizations">).eq("userId", args.userId)
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .first();

        if (!membership || membership.role === "staff") {
          throw new Error("Sem permissão para editar este evento");
        }
      } else {
        throw new Error("Sem permissão para editar este evento");
      }
    }

    // Atualizar o evento
    await ctx.db.patch(args.eventId, {
      isPublicOnHomepage: args.isPublicOnHomepage,
      allowTicketTransfers: args.allowTicketTransfers,
      customScripts: args.customScripts,
    });

    return { success: true };
  },
});




// Queries para dashboard de cortesias (cortesia = totalAmount === 0, qualquer tipo de ingresso)
export const getEventCourtesyStats = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Buscar todos os tickets do evento
    const allTickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Cortesia = valor zerado (não entra na receita)
    const courtesyTickets = allTickets.filter(ticket => ticket.totalAmount === 0);

    // Separar transferidos para não inflar "enviados"
    const transferedTickets = courtesyTickets.filter(t => t.status === "transfered").length;
    const activeCourtesyTickets = courtesyTickets.filter(t => t.status !== "transfered");

    // Estatísticas básicas (apenas ativos)
    const totalSent = activeCourtesyTickets.length;
    const validTickets = activeCourtesyTickets.filter(t => t.status === "valid").length;
    const usedTickets = activeCourtesyTickets.filter(t => t.status === "used").length;
    const cancelledTickets = activeCourtesyTickets.filter(t => t.status === "cancelled").length;

    // Estatísticas por tipo: agrupar por ticketTypeId e buscar nome do tipo
    const typeIds = [...new Set(activeCourtesyTickets.map(t => t.ticketTypeId))];
    const typeNames = new Map<typeof typeIds[0], string>();
    for (const id of typeIds) {
      const tt = await ctx.db.get(id);
      typeNames.set(id, tt?.name ?? "Tipo desconhecido");
    }
    const statsByType = typeIds.map(ticketTypeId => {
      const typeTickets = activeCourtesyTickets.filter(t => t.ticketTypeId === ticketTypeId);
      return {
        ticketTypeName: typeNames.get(ticketTypeId) ?? "Tipo desconhecido",
        totalSent: typeTickets.length,
        valid: typeTickets.filter(t => t.status === "valid").length,
        used: typeTickets.filter(t => t.status === "used").length,
      };
    }).filter(stat => stat.totalSent > 0);

    // Últimos 7 dias (apenas ativos)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentTickets = activeCourtesyTickets.filter(t => t.purchasedAt >= sevenDaysAgo).length;

    return {
      totalSent,              // enviados ativos (exclui transferidos)
      validTickets,
      usedTickets,
      cancelledTickets,
      recentTickets,
      statsByType,
      transferedTickets,      // novos: total cortesia transferidos
      usageRate: totalSent > 0 ? ((usedTickets / totalSent) * 100) : 0,
    };
  },
});

export const getEventCourtesyDetails = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Buscar todos os tickets do evento
    const allTickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Cortesia = valor zerado (totalAmount === 0)
    const courtesyTickets = allTickets.filter(ticket => ticket.totalAmount === 0);

    // Buscar detalhes dos usuários e tipos de ingresso
    const ticketsWithDetails = await Promise.all(
      courtesyTickets.map(async (ticket) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", ticket.userId))
          .first();
        
        const ticketType = await ctx.db.get(ticket.ticketTypeId);
        
        return {
          ticketId: ticket._id,
          userId: ticket.userId,
          recipientName: user?.name || "Nome não disponível",
          recipientEmail: user?.email || "Email não disponível",
          ticketTypeName: ticketType?.name || "Tipo não disponível",
          status: ticket.status,
          sentAt: ticket.purchasedAt,
          quantity: ticket.quantity,
        };
      })
    );

    // Agrupar por usuário (email)
    const groupedByUser = ticketsWithDetails.reduce((acc, ticket) => {
      const key = ticket.recipientEmail;
      
      if (!acc[key]) {
        acc[key] = {
          recipientName: ticket.recipientName,
          recipientEmail: ticket.recipientEmail,
          tickets: [],
          totalQuantity: 0,
          latestSentAt: ticket.sentAt,
          hasValidTickets: false,
          hasUsedTickets: false,
          hasCancelledTickets: false,
        };
      }
      
      acc[key].tickets.push({
        ticketId: ticket.ticketId,
        ticketTypeName: ticket.ticketTypeName,
        status: ticket.status,
        sentAt: ticket.sentAt,
        quantity: ticket.quantity,
      });
      
      acc[key].totalQuantity += ticket.quantity;
      acc[key].latestSentAt = Math.max(acc[key].latestSentAt, ticket.sentAt);
      
      // Atualizar flags de status
      if (ticket.status === "valid") acc[key].hasValidTickets = true;
      if (ticket.status === "used") acc[key].hasUsedTickets = true;
      if (ticket.status === "cancelled") acc[key].hasCancelledTickets = true;
      
      return acc;
    }, {} as Record<string, any>);

    // Converter para array e ordenar por data de envio mais recente
    return Object.values(groupedByUser).sort((a: any, b: any) => b.latestSentAt - a.latestSentAt);
  },
});


// ... existing code ...

// Nova função otimizada para a página do evento - retorna apenas dados essenciais
export const getEventPageData = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    // Retorna apenas os campos necessários para a página do evento
    return {
      _id: event._id,
      name: event.name,
      slug: event.slug,
      description: event.description,
      location: event.location,
      latitude: event.latitude,
      longitude: event.longitude,
      placeId: event.placeId,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      userId: event.userId,
      organizationId: event.organizationId,
      imageStorageId: event.imageStorageId,
      customSections: event.customSections,
      is_cancelled: event.is_cancelled,
      isPublicOnHomepage: event.isPublicOnHomepage,
      allowTicketTransfers: event.allowTicketTransfers,
    };
  },
});

// Nova função otimizada para checkout - retorna apenas customScripts e eventFeeSettings
export const getEventCheckoutData = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    // Buscar configurações de taxa do evento
    const eventFeeSettings = await ctx.db
      .query("eventFeeSettings")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .first();

    // Retorna apenas os campos necessários para o checkout
    return {
      _id: event._id,
      slug: event.slug,
      customScripts: event.customScripts,
      eventFeeSettings: eventFeeSettings || null,
    };
  },
});

// Nova função otimizada para componentes que precisam apenas de dados básicos
export const getEventBasicData = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    // Retorna apenas os campos básicos mais comuns
    return {
      _id: event._id,
      name: event.name,
      slug: event.slug,
      description: event.description,
      location: event.location,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      userId: event.userId,
      organizationId: event.organizationId,
      imageStorageId: event.imageStorageId,
      is_cancelled: event.is_cancelled,
      hasMultipleDays: event.hasMultipleDays,
    };
  },
});


export const getEventConfigData = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    // Retorna apenas os campos básicos mais comuns
    return {
      isPublicOnHomepage: event.isPublicOnHomepage,
      allowTicketTransfers: event.allowTicketTransfers,
      customScripts: event.customScripts,
      name: event.name,
    };
  },
});


export const getEventEditData = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    // Retorna apenas os campos básicos mais comuns
    return {
      _id: event._id,
      slug: event.slug,
      name: event.name,
      description: event.description,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      userId: event.userId,
      organizationId: event.organizationId,
      imageStorageId: event.imageStorageId,
      customSections: event.customSections,
      location: event.location,
      latitude: event.latitude,
      longitude: event.longitude,
      placeId: event.placeId,
    };
  },
});



export const getEventEmailData = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    // Retorna apenas os campos básicos mais comuns
    return {
      name: event.name,
      eventStartDate: event.eventStartDate,
      imageStorageId: event.imageStorageId,
      location: event.location,
      organizationId: event.organizationId,
    };
  },
});


export const getEventName = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    // Retorna apenas os campos básicos mais comuns
    return {
      name: event.name,
    };
  },
});



export const getEventStartLocName = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    // Retorna apenas os campos básicos mais comuns
    return {
      location: event.location,
      name: event.name,
      eventStartDate: event.eventStartDate,
      imageStorageId: event.imageStorageId,
    };
  },
});



export const getEventTicketShow = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;

    // Retorna apenas os campos básicos mais comuns
    return {
      _id: event._id,
      location: event.location,
      name: event.name,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      latitude: event.latitude,
      longitude: event.longitude,
      placeId: event.placeId,
      is_cancelled: event.is_cancelled,
    };
  },
});



export const getOnFireEvents = query({
  handler: async (ctx) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_public_homepage", (q) => q.eq("isPublicOnHomepage", true))
      .filter((q) => q.eq(q.field("isOnFire"), true))
      .order("desc")
      .take(10);

    const now = Date.now();
    
    return events
      .filter(event => event.eventStartDate > now && !event.is_cancelled)
      .map(event => ({
        _id: event._id,
        name: event.name,
        slug: event.slug,
        eventStartDate: event.eventStartDate,
        location: event.location,
        imageStorageId: event.imageStorageId,
        description: event.description,
      }));
  },
});




export const getPastEventsWithPagination = query({
  args: {
    page: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, { page, limit }) => {
    const now = Date.now();
    const skip = (page - 1) * limit;

    // Buscar todos os eventos passados primeiro para contar o total
    const allPastEvents = await ctx.db
      .query("events")
      .filter((q) =>
        q.and(
          q.eq(q.field("is_cancelled"), undefined),
          q.or(
            q.eq(q.field("isPublicOnHomepage"), true),
            q.eq(q.field("isPublicOnHomepage"), undefined)
          ),
          q.or(
            q.eq(q.field("isOnFire"), false),
            q.eq(q.field("isOnFire"), undefined)
          ),
          q.lte(q.field("eventEndDate"), now)
        )
      )
      .order("desc")
      .collect();

    // Ordenar por eventStartDate em ordem decrescente (mais recente primeiro)
    const sortedPastEvents = allPastEvents.sort((a, b) => b.eventStartDate - a.eventStartDate);

    // Aplicar paginação
    const paginatedEvents = sortedPastEvents.slice(skip, skip + limit);
    const totalCount = sortedPastEvents.length;
    const hasMore = skip + limit < totalCount;

    return {
      events: paginatedEvents.map((event) => ({
        _id: event._id,
        name: event.name,
        slug: event.slug,
        description: event.description,
        location: event.location,
        eventStartDate: event.eventStartDate,
        eventEndDate: event.eventEndDate,
        imageStorageId: event.imageStorageId,
      })),
      totalCount,
      hasMore,
      page,
      limit,
    };
  },
});

export const getUpcomingEventsAll = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const events = await ctx.db
      .query("events")
      .filter((q) =>
        q.and(
          q.eq(q.field("is_cancelled"), undefined),
          q.or(
            q.eq(q.field("isPublicOnHomepage"), true),
            q.eq(q.field("isPublicOnHomepage"), undefined)
          ),
          q.or(
            q.eq(q.field("isOnFire"), false),
            q.eq(q.field("isOnFire"), undefined)
          ),
          q.gt(q.field("eventEndDate"), now)
        )
      )
      .order("asc")
      .collect();

    // Ordenar por eventStartDate para garantir que o evento mais próximo apareça primeiro
    const sortedEvents = events.sort((a, b) => a.eventStartDate - b.eventStartDate);

    return sortedEvents.map((event) => ({
      _id: event._id,
      name: event.name,
      slug: event.slug,
      description: event.description,
      location: event.location,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      imageStorageId: event.imageStorageId,
    }));
  },
});



export const getEventBuyersPaginated = query({
  args: {
    eventId: v.id("events"),
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let page: any[] = [];
    let isDone = false;
    let continueCursor = "";

    if (args.searchTerm) {
        // Search mode: Find users first, then tickets
        const usersByName = await ctx.db
            .query("users")
            .withSearchIndex("search_users", (q) => q.search("name", args.searchTerm!))
            .take(50);

        let usersByEmail: any[] = [];
        // Simple email check - if term has @ or just try exact match
        if (args.searchTerm.includes("@")) {
             const user = await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", args.searchTerm!))
                .first();
             if (user) usersByEmail = [user];
        } else {
             // Optional: Iterate scan for partial email? Too slow.
             // Maybe exact match on term is enough for email if user types full email.
             const user = await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", args.searchTerm!))
                .first();
             if (user) usersByEmail = [user];
        }

        const userMap = new Map();
        [...usersByName, ...usersByEmail].forEach(u => userMap.set(u.userId, u));
        const targetUserIds = Array.from(userMap.keys());

        const allTickets = [];
        for (const userId of targetUserIds) {
            const tickets = await ctx.db
                .query("tickets")
                .withIndex("by_user_event", (q) => q.eq("userId", userId as string).eq("eventId", args.eventId))
                .collect();
            allTickets.push(...tickets);
        }

        // Sort by most recent
        allTickets.sort((a, b) => b._creationTime - a._creationTime);
        
        page = allTickets;
        isDone = true;
        continueCursor = "";
    } else {
        // Standard pagination
        const results = await ctx.db
            .query("tickets")
            .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
            .order("desc")
            .paginate(args.paginationOpts);
        
        page = results.page;
        isDone = results.isDone;
        continueCursor = results.continueCursor;
    }

    const enrichedPage = await Promise.all(
      page.map(async (ticket) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", ticket.userId))
          .first();
        const ticketType: any = await ctx.db.get(ticket.ticketTypeId);

        let validatorName = null;
        if (ticket.validatedBy) {
          const validator = await ctx.db
            .query("users")
            .withIndex("by_user_id", (q) => q.eq("userId", ticket.validatedBy as string))
            .first();
          validatorName = validator?.name;
        }

        let promoterName = null;
        if (ticket.promoterCode) {
            const promoter: any = await ctx.db.query("promoters").withIndex("by_event_code", q => q.eq("eventId", args.eventId).eq("code", ticket.promoterCode!)).first();
            promoterName = promoter?.name;
        }

        let couponName = null;
        if (ticket.couponCode) {
             const coupon: any = await ctx.db.query("coupons").withIndex("by_event_code", q => q.eq("eventId", args.eventId).eq("code", ticket.couponCode!)).first();
             couponName = coupon?.name; 
        }

        let dayName = null;
        let sectorName = null;
        
        if (ticketType) {
            if (ticketType.dayId) {
                const day: any = await ctx.db.get(ticketType.dayId);
                dayName = day?.name;
            }
            if (ticketType.lotId) {
                const lot: any = await ctx.db.get(ticketType.lotId);
                sectorName = lot?.name; 
            }
        }

        return {
          ...ticket,
          name: user?.name,
          email: user?.email,
          phone: user?.phone,
          ticketTypeName: ticketType?.name || "Tipo não encontrado",
          validatorName,
          promoterName,
          couponName,
          dayName,
          sectorName,
          validatedAt: ticket.validatedAt ?? null,
        };
      })
    );

    return {
      page: enrichedPage,
      isDone,
      continueCursor,
    };
  },
});
