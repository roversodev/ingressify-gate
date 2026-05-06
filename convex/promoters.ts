import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

/** Ingressos de `recordOfflineSale` usam `transactionId` `offline_${code}_...`; não devem entrar como venda pelo link. */
function isOfflinePromoterSaleTicket(transactionId?: string): boolean {
  return typeof transactionId === "string" && transactionId.startsWith("offline_");
}

// Criar promoter (apenas para tracking)
export const createPromoter = mutation({
  args: {
    eventId: v.id("events"),
    code: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    createdBy: v.string(),
    // Opções para cupom de desconto - estes não vão para a tabela promoters
    createCoupon: v.optional(v.boolean()),
    couponName: v.optional(v.string()),
    discountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
    discountValue: v.optional(v.number()),
    couponValidUntil: v.optional(v.number()),
    commissionRate: v.optional(v.number()), // Comissão em porcentagem (0-100) ou valor fixo
  },
  handler: async (ctx, args) => {
    // Verificar se o código já existe para este evento
    const existingPromoter = await ctx.db
      .query("promoters")
      .withIndex("by_event_code", (q) => 
        q.eq("eventId", args.eventId).eq("code", args.code)
      )
      .first();

    if (existingPromoter) {
      throw new Error("Código do promoter já existe para este evento");
    }

    let couponCode = undefined;
    
    // Se solicitado, criar cupom de desconto
    if (args.createCoupon && args.couponName && args.discountType && args.discountValue) {
      const couponId = await ctx.db.insert("coupons", {
        eventId: args.eventId,
        code: args.code, // Usar o mesmo código do promoter
        name: args.couponName,
        discountType: args.discountType,
        discountValue: args.discountValue,
        validFrom: Date.now(),
        validUntil: args.couponValidUntil || (Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias padrão
        currentUses: 0,
        isActive: true,
        createdAt: Date.now(),
        createdBy: args.createdBy,
      });
      couponCode = args.code;
    }

    // Verificar se o usuário existe para vincular
    let userId = undefined;
    let userPhone = args.phone;

    if (args.email) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email!))
        .first();
      
      if (user) {
        userId = user.userId;
        // Se o telefone não foi fornecido no form, usar o do cadastro
        if (!userPhone && user.phone) {
          userPhone = user.phone;
        }
      }
    }

    // Criar o promoter - APENAS com os campos que existem na tabela
    const promoterId = await ctx.db.insert("promoters", {
      eventId: args.eventId,
      code: args.code,
      name: args.name,
      email: args.email,
      phone: userPhone,
      userId: userId,
      isActive: true,
      createdAt: Date.now(),
      totalSales: 0,
      totalRevenue: 0,
      hasCoupon: !!couponCode,
      couponCode: couponCode,
      commissionRate: args.commissionRate,
    });

    return promoterId;
  },
});

// Listar promoters de um evento
export const getEventPromoters = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db
      .query("promoters")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
  },
});

// Buscar promoter por código
export const getPromoterByCode = query({
  args: { 
    eventId: v.id("events"),
    code: v.string() 
  },
  handler: async (ctx, { eventId, code }) => {
    return await ctx.db
      .query("promoters")
      .withIndex("by_event_code", (q) => 
        q.eq("eventId", eventId).eq("code", code)
      )
      .first();
  },
});

// Relatório de vendas por promoter
export const getPromoterSalesReport = query({
  args: { 
    eventId: v.id("events"),
    promoterCode: v.optional(v.string())
  },
  handler: async (ctx, { eventId, promoterCode }) => {
    let ticketsQuery = ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId));

    if (promoterCode) {
      ticketsQuery = ctx.db
        .query("tickets")
        .withIndex("by_promoter", (q) => q.eq("promoterCode", promoterCode));
    }

    const tickets = await ticketsQuery
      .filter((q) => q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used")))
      .collect();

    const ticketsOnlineOnly = tickets.filter(
      (t) =>
        t.eventId === eventId && !isOfflinePromoterSaleTicket(t.transactionId)
    );

    // Agrupar por promoter (exclui venda física/registrada; essa entra em offlineSales / relatório offline)
    const salesByPromoter = ticketsOnlineOnly.reduce((acc, ticket) => {
      const code = ticket.promoterCode || "direct";
      if (!acc[code]) {
        acc[code] = {
          promoterCode: code,
          totalSales: 0,
          totalAmount: 0,
          ticketCount: 0,
        };
      }
      acc[code].totalSales += ticket.quantity;
      // Use the actual amount paid (totalAmount already includes discount)
      acc[code].totalAmount += ticket.totalAmount;
      acc[code].ticketCount += 1;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(salesByPromoter);
  },
});

// Atualizar promoter
export const updatePromoter = mutation({
  args: {
    promoterId: v.id("promoters"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    hasCoupon: v.optional(v.boolean()),
    couponCode: v.optional(v.string()),
    commissionRate: v.optional(v.number()),
  },
  handler: async (ctx, { promoterId, ...updates }) => {
    // Se estiver atualizando o email, tentar vincular usuário novamente
    let extraUpdates: any = {};
    
    if (updates.email) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", updates.email!))
        .first();
      
      if (user) {
        extraUpdates.userId = user.userId;
        // Se não estiver atualizando o telefone explicitamente, mas o usuário tiver telefone, usar o do cadastro
        if (!updates.phone && user.phone) {
          // Buscar promoter atual para ver se já tem telefone
          const currentPromoter = await ctx.db.get(promoterId);
          if (currentPromoter && !currentPromoter.phone) {
            extraUpdates.phone = user.phone;
          }
        }
      }
    }

    await ctx.db.patch(promoterId, { ...updates, ...extraUpdates });
    return { success: true };
  },
});

// Deletar promoter e todos os dados relacionados
export const deletePromoter = mutation({
  args: {
    promoterId: v.id("promoters"),
  },
  handler: async (ctx, { promoterId }) => {
    // Buscar o promoter para obter informações
    const promoter = await ctx.db.get(promoterId);
    if (!promoter) {
      throw new Error("Promoter não encontrado");
    }

    // 1. Deletar cupom associado (se existir)
    if (promoter.hasCoupon && promoter.couponCode) {
      const coupon = await ctx.db
        .query("coupons")
        .withIndex("by_event_code", (q) => 
          q.eq("eventId", promoter.eventId).eq("code", promoter.couponCode!)
        )
        .first();
      
      if (coupon) {
        await ctx.db.delete(coupon._id);
      }
    }

    // 2. Atualizar tickets que usaram este promoter (remover referência)
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_promoter", (q) => q.eq("promoterCode", promoter.code))
      .collect();
    
    for (const ticket of tickets) {
      await ctx.db.patch(ticket._id, {
        promoterCode: undefined,
      });
    }

    // 3. Deletar o promoter
    await ctx.db.delete(promoterId);

    return { 
      success: true, 
      deletedTicketsCount: tickets.length,
      hadCoupon: promoter.hasCoupon 
    };
  },
});

// Get promoter sales for dashboard
export const getPromoterSales = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) => q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used")))
      .collect();

    const ticketsOnlineOnly = tickets.filter(
      (t) => !isOfflinePromoterSaleTicket(t.transactionId)
    );

    // Group by promoter code (offline registrada pelo promoter vai só em KPIs offline)
    const salesByPromoter = ticketsOnlineOnly.reduce((acc, ticket) => {
      const code = ticket.promoterCode || "direct";
      if (!acc[code]) {
        acc[code] = {
          promoterCode: code,
          totalSales: 0,
          totalAmount: 0,
          ticketCount: 0,
        };
      }
      acc[code].totalSales += ticket.quantity;
      acc[code].totalAmount += ticket.totalAmount;
      acc[code].ticketCount += 1;
      return acc;
    }, {} as Record<string, any>);

    // Convert to array and sort by total sales descending
    return Object.values(salesByPromoter)
      .sort((a: any, b: any) => b.totalSales - a.totalSales);
  },
});

// Criar uma equipe de promotores
export const createPromoterTeam = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    coordinatorId: v.optional(v.id("promoters")), // Opcional, pode criar equipe e depois definir coordenador
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Verificar se o coordenador existe e pertence ao evento
    if (args.coordinatorId) {
      const coordinator = await ctx.db.get(args.coordinatorId);
      if (!coordinator) {
        throw new Error("Coordenador não encontrado");
      }
      if (coordinator.eventId !== args.eventId) {
        throw new Error("Coordenador não pertence a este evento");
      }
    }

    // Criar a equipe
    const teamId = await ctx.db.insert("promoterTeams", {
      eventId: args.eventId,
      name: args.name,
      description: args.description,
      coordinatorId: args.coordinatorId,
      createdAt: Date.now(),
      createdBy: args.createdBy,
      isActive: true,
    });

    // Se tiver coordenador, atualizar o promoter para ser coordenador
    if (args.coordinatorId) {
      await ctx.db.patch(args.coordinatorId, {
        isCoordinator: true,
        teamId: teamId,
      });
    }

    return teamId;
  },
});

// Definir coordenador para uma equipe
export const setTeamCoordinator = mutation({
  args: {
    teamId: v.id("promoterTeams"),
    promoterId: v.id("promoters"),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Equipe não encontrada");
    }

    const promoter = await ctx.db.get(args.promoterId);
    if (!promoter) {
      throw new Error("Promoter não encontrado");
    }

    if (promoter.eventId !== team.eventId) {
      throw new Error("Promoter não pertence ao mesmo evento da equipe");
    }

    // Se já existir um coordenador, remover a flag dele
    if (team.coordinatorId) {
      const currentCoordinator = await ctx.db.get(team.coordinatorId);
      if (currentCoordinator) {
        await ctx.db.patch(team.coordinatorId, {
          isCoordinator: false,
          teamId: undefined,
        });
      }
    }

    // Atualizar a equipe com o novo coordenador
    await ctx.db.patch(args.teamId, {
      coordinatorId: args.promoterId,
    });

    // Atualizar o promoter para ser coordenador
    await ctx.db.patch(args.promoterId, {
      isCoordinator: true,
      teamId: args.teamId,
    });

    return { success: true };
  },
});

// Adicionar promoter a uma equipe
export const addPromoterToTeam = mutation({
  args: {
    teamId: v.id("promoterTeams"),
    promoterId: v.id("promoters"),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Equipe não encontrada");
    }

    const promoter = await ctx.db.get(args.promoterId);
    if (!promoter) {
      throw new Error("Promoter não encontrado");
    }

    if (promoter.eventId !== team.eventId) {
      throw new Error("Promoter não pertence ao mesmo evento da equipe");
    }

    // Verificar se o promoter já é coordenador de outra equipe
    if (promoter.isCoordinator && promoter.teamId && promoter.teamId !== args.teamId) {
      throw new Error("Este promoter já é coordenador de outra equipe");
    }

    // Adicionar promoter à equipe
    await ctx.db.patch(args.promoterId, {
      teamId: args.teamId,
    });

    return { success: true };
  },
});

// Remover promoter de uma equipe
export const removePromoterFromTeam = mutation({
  args: {
    promoterId: v.id("promoters"),
  },
  handler: async (ctx, args) => {
    const promoter = await ctx.db.get(args.promoterId);
    if (!promoter) {
      throw new Error("Promoter não encontrado");
    }

    // Se for coordenador, não permitir remover
    if (promoter.isCoordinator) {
      throw new Error("Não é possível remover um coordenador de sua equipe. Defina outro coordenador primeiro.");
    }

    // Remover promoter da equipe
    await ctx.db.patch(args.promoterId, {
      teamId: undefined,
    });

    return { success: true };
  },
});

// Listar equipes de um evento
export const getEventTeams = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db
      .query("promoterTeams")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
  },
});

// Obter detalhes de uma equipe com seus membros
export const getTeamWithMembers = query({
  args: { teamId: v.id("promoterTeams") },
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get(teamId);
    if (!team) {
      return null;
    }

    // Buscar o coordenador
    const coordinator = team.coordinatorId ? await ctx.db.get(team.coordinatorId) : null;

    // Buscar todos os membros da equipe
    const members = await ctx.db
      .query("promoters")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .filter((q) => q.neq(q.field("_id"), team.coordinatorId || "")) // Excluir o coordenador da lista de membros
      .collect();

    return {
      ...team,
      coordinator,
      members,
    };
  },
});

// Obter equipes que um promoter coordena
export const getCoordinatorTeams = query({
  args: { promoterId: v.id("promoters") },
  handler: async (ctx, { promoterId }) => {
    const promoter = await ctx.db.get(promoterId);
    if (!promoter || !promoter.isCoordinator) {
      return [];
    }

    return await ctx.db
      .query("promoterTeams")
      .withIndex("by_coordinator", (q) => q.eq("coordinatorId", promoterId))
      .collect();
  },
});

// Atualizar equipe de promotores
export const updatePromoterTeam = mutation({
  args: {
    teamId: v.id("promoterTeams"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Equipe não encontrada");
    }

    // Atualizar a equipe
    await ctx.db.patch(args.teamId, {
      name: args.name,
      description: args.description,
      isActive: args.isActive,
    });

    return { success: true };
  },
});

// Deletar equipe de promotores
export const deletePromoterTeam = mutation({
  args: {
    teamId: v.id("promoterTeams"),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Equipe não encontrada");
    }

    // Buscar todos os promotores da equipe
    const teamMembers = await ctx.db
      .query("promoters")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    // Remover a associação de todos os promotores com esta equipe
    for (const member of teamMembers) {
      await ctx.db.patch(member._id, {
        teamId: undefined,
        isCoordinator: member.isCoordinator ? false : undefined,
      });
    }

    // Deletar a equipe
    await ctx.db.delete(args.teamId);

    return { 
      success: true,
      membersUpdated: teamMembers.length,
    };
  },
});



// Obter dados do promoter logado
export const getMyPromoterDashboard = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // Buscar todos os registros de promoter vinculados a este usuário
    const myPromoterRecords = await ctx.db
      .query("promoters")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    if (myPromoterRecords.length === 0) {
      return { promoters: [], totalStats: { sales: 0, revenue: 0 } };
    }

    // Enriquecer com dados do evento
    const enrichedPromoters = await Promise.all(
      myPromoterRecords.map(async (promoter) => {
        const event = await ctx.db.get(promoter.eventId);
        
        // Buscar vendas deste promoter específico
        const tickets = await ctx.db
          .query("tickets")
          .withIndex("by_promoter", (q) => q.eq("promoterCode", promoter.code))
          .filter((q) => q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used")))
          .collect();

        const ticketsOnlineOnly = tickets.filter(
          (t) =>
            t.eventId === promoter.eventId &&
            !isOfflinePromoterSaleTicket(t.transactionId)
        );

        const salesStats = ticketsOnlineOnly.reduce((acc, ticket) => {
          acc.sales += ticket.quantity;
          acc.revenue += ticket.totalAmount;
          return acc;
        }, { sales: 0, revenue: 0 });

        // Calcular comissão se houver
        let commissionAmount = 0;
        if (promoter.commissionRate && promoter.commissionRate > 0) {
          // Se for menor que 1, assume porcentagem (ex: 0.10 = 10%)
          // Se for maior que 1, assume porcentagem direta (ex: 10 = 10%)
          // O ideal seria normalizar, mas vamos assumir que o input é porcentagem inteira
          const rate = promoter.commissionRate <= 1 ? promoter.commissionRate : promoter.commissionRate / 100;
          commissionAmount = salesStats.revenue * rate;
        }

        return {
          ...promoter,
          eventName: event?.name || "Evento Removido",
          eventSlug: event?.slug,
          eventDate: event?.eventStartDate,
          imageStorageId: event?.imageStorageId,
          realSales: salesStats.sales,
          realRevenue: salesStats.revenue,
          commissionAmount,
        };
      })
    );

    // Calcular totais gerais
    const totalStats = enrichedPromoters.reduce((acc, curr) => {
      acc.sales += curr.realSales;
      acc.revenue += curr.realRevenue;
      acc.commission += curr.commissionAmount || 0;
      return acc;
    }, { sales: 0, revenue: 0, commission: 0 });

    return {
      promoters: enrichedPromoters,
      totalStats
    };
  },
});

// Verificar se o usuário é promoter de algum evento
export const isUserPromoter = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const promoter = await ctx.db
      .query("promoters")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    return !!promoter;
  },
});

// Buscar todos os eventos em que o usuário é promoter (com saldo em aberto)
export const getUserPromoterLinks = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const records = await ctx.db
      .query("promoters")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return await Promise.all(
      records.map(async (promoter) => {
        const event = await ctx.db.get(promoter.eventId);

        const sales = await ctx.db
          .query("offlineSales")
          .withIndex("by_promoter", (q) => q.eq("promoterId", promoter._id))
          .filter((q) =>
            q.or(q.eq(q.field("status"), "recorded"), q.eq(q.field("status"), "settled"))
          )
          .collect();

        const settlements = await ctx.db
          .query("offlineSettlements")
          .withIndex("by_promoter", (q) => q.eq("promoterId", promoter._id))
          .collect();

        const totalOwed = sales.reduce((s, x) => s + (x.amountOwedToProducer || 0), 0);
        const totalSettled = settlements.reduce((s, x) => s + (x.amount || 0), 0);
        const outstanding = Math.max(0, totalOwed - totalSettled);
        const totalCommission = sales.reduce((s, x) => s + (x.commissionAmount || 0), 0);

        return {
          ...promoter,
          eventName: event?.name || "Evento Removido",
          eventSlug: event?.slug,
          eventDate: event?.eventStartDate,
          imageStorageId: event?.imageStorageId,
          outstanding,
          totalCommission,
          salesCount: sales.length,
        };
      })
    );
  },
});

// Buscar promoter de um evento específico pelo userId
export const getPromoterByUserAndEvent = query({
  args: { userId: v.string(), eventId: v.id("events") },
  handler: async (ctx, { userId, eventId }) => {
    return await ctx.db
      .query("promoters")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("eventId"), eventId))
      .first();
  },
});

// Tipos de ingresso permitidos para um promoter (ou todos se não houver restrição)
export const getPromoterAllowedTicketTypes = query({
  args: { promoterId: v.id("promoters") },
  handler: async (ctx, { promoterId }) => {
    const permissions = await ctx.db
      .query("promoterPermissions")
      .withIndex("by_promoter", (q) => q.eq("promoterId", promoterId))
      .filter((q) => q.eq(q.field("allowed"), true))
      .collect();

    return permissions.map((p) => p.ticketTypeId);
  },
});

// Definir permissões de tipos de ingresso para um promoter
export const setPromoterPermissions = mutation({
  args: {
    promoterId: v.id("promoters"),
    ticketTypeIds: v.array(v.id("ticketTypes")),
    createdBy: v.string(),
  },
  handler: async (ctx, { promoterId, ticketTypeIds, createdBy }) => {
    // Remove permissions antigas
    const existing = await ctx.db
      .query("promoterPermissions")
      .withIndex("by_promoter", (q) => q.eq("promoterId", promoterId))
      .collect();
    for (const p of existing) {
      await ctx.db.delete(p._id);
    }
    // Insere novas
    for (const ticketTypeId of ticketTypeIds) {
      await ctx.db.insert("promoterPermissions", {
        promoterId,
        ticketTypeId,
        allowed: true,
        createdAt: Date.now(),
        createdBy,
      });
    }
    return { success: true };
  },
});

// Registrar venda offline
export const recordOfflineSale = mutation({
  args: {
    eventId: v.id("events"),
    promoterId: v.id("promoters"),
    ticketTypeId: v.id("ticketTypes"),
    quantity: v.number(),
    recipientEmail: v.string(),
    userId: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const promoter = await ctx.db.get(args.promoterId);
    if (!promoter || !promoter.isActive) {
      throw new Error("Promoter não encontrado ou inativo");
    }
    if (promoter.eventId !== args.eventId) {
      throw new Error("Promoter não pertence a este evento");
    }

    const ticketType = await ctx.db.get(args.ticketTypeId);
    if (!ticketType) throw new Error("Tipo de ingresso não encontrado");
    if (ticketType.availableQuantity < args.quantity) {
      throw new Error(`Ingressos insuficientes. Disponível: ${ticketType.availableQuantity}`);
    }

    // Fee settings
    const feeSettings = await ctx.db
      .query("eventFeeSettings")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .first();

    const absorbFees = feeSettings?.absorbFees === true;
    const producerFeeRate = absorbFees
      ? 0
      : Math.max(0, Math.min(1, feeSettings?.offlineFee ?? 0.05));

    // Normaliza: se > 1, assume valor em % (ex: 2 = 2% = 0.02), se <= 1, assume decimal
    const rawRate = promoter.commissionRate ?? 0;
    const commissionRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const unitPrice = ticketType.currentPrice;
    const totalAmount = unitPrice * args.quantity;
    const commissionAmount = totalAmount * commissionRate;
    const producerFeeAmount = totalAmount * producerFeeRate;
    const amountOwedToProducer = totalAmount - commissionAmount;

    // Buscar ou criar usuário pelo email
    const normalizedEmail = args.recipientEmail.trim().toLowerCase();
    let recipientUserId: string;
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    if (existingUser) {
      recipientUserId = existingUser.userId;
    } else {
      recipientUserId = `offline_${Date.now()}_${normalizedEmail}`;
    }

    const now = Date.now();
    const transactionId = `offline_${promoter.code}_${now}`;

    // Criar transação
    await ctx.db.insert("transactions", {
      transactionId,
      eventId: args.eventId,
      userId: recipientUserId,
      customerId: normalizedEmail,
      amount: -producerFeeAmount,
      status: "paid",
      paymentMethod: "OFFLINE_ADJUSTMENT",
      createdAt: now,
      metadata: {
        type: "offline_sale",
        promoterCode: promoter.code,
        promoterId: args.promoterId,
        unitPrice,
        quantity: args.quantity,
        totalAmountCharged: totalAmount,
        recipientEmail: normalizedEmail,
        notes: args.notes,
      },
    });

    // Criar ingressos individuais
    const ticketIds: string[] = [];
    for (let i = 0; i < args.quantity; i++) {
      const ticketId = await ctx.db.insert("tickets", {
        eventId: args.eventId,
        ticketTypeId: args.ticketTypeId,
        userId: recipientUserId,
        quantity: 1,
        unitPrice,
        totalAmount: unitPrice,
        purchasedAt: now,
        status: "valid",
        transactionId,
        promoterCode: promoter.code,
      });
      ticketIds.push(ticketId);
    }

    // Registrar venda offline
    const offlineSaleId = await ctx.db.insert("offlineSales", {
      eventId: args.eventId,
      promoterId: args.promoterId,
      ticketTypeId: args.ticketTypeId,
      quantity: args.quantity,
      unitPrice,
      totalAmount,
      commissionRate,
      commissionAmount,
      producerFeeRate,
      producerFeeAmount,
      amountOwedToProducer,
      status: "recorded",
      recordedBy: args.userId,
      createdAt: now,
      notes: args.notes,
    });

    // Reduzir estoque
    await ctx.db.patch(args.ticketTypeId, {
      availableQuantity: ticketType.availableQuantity - args.quantity,
    });

    // Atualizar stats do promoter
    await ctx.db.patch(args.promoterId, {
      totalSales: (promoter.totalSales || 0) + args.quantity,
      totalRevenue: (promoter.totalRevenue || 0) + totalAmount,
    });

    return {
      success: true,
      offlineSaleId,
      transactionId,
      ticketIds,
      totals: { totalAmount, commissionAmount, producerFeeAmount, amountOwedToProducer },
    };
  },
});

// Cancelar um ingresso offline individualmente
export const cancelOfflineTicket = mutation({
  args: {
    ticketId: v.id("tickets"),
    userId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { ticketId, userId, reason }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) throw new Error("Ingresso não encontrado");
    if (ticket.status !== "valid") throw new Error("Ingresso não está ativo");
    if (!ticket.promoterCode) throw new Error("Este ingresso não é uma venda offline");

    // Buscar transação para encontrar offlineSale
    const tx = ticket.transactionId
      ? await ctx.db
          .query("transactions")
          .withIndex("by_transactionId", (q) => q.eq("transactionId", ticket.transactionId!))
          .first()
      : null;

    // Buscar offlineSale pelo promoter + evento
    const promoter = await ctx.db
      .query("promoters")
      .withIndex("by_event_code", (q) =>
        q.eq("eventId", ticket.eventId).eq("code", ticket.promoterCode!)
      )
      .first();

    let offlineSale = null;
    if (promoter) {
      offlineSale = await ctx.db
        .query("offlineSales")
        .withIndex("by_promoter", (q) => q.eq("promoterId", promoter._id))
        .filter((q) =>
          q.and(
            q.eq(q.field("eventId"), ticket.eventId),
            q.eq(q.field("ticketTypeId"), ticket.ticketTypeId),
            q.neq(q.field("status"), "cancelled")
          )
        )
        .first();
    }

    // Cancelar ingresso
    await ctx.db.patch(ticketId, { status: "cancelled" });

    // Restaurar estoque
    const ticketType = await ctx.db.get(ticket.ticketTypeId);
    if (ticketType) {
      await ctx.db.patch(ticket.ticketTypeId, {
        availableQuantity: ticketType.availableQuantity + 1,
      });
    }

    // Atualizar offlineSale e marcar transação existente como reembolsada
    if (offlineSale && offlineSale.quantity > 0) {
      const refundFactor = 1 / offlineSale.quantity;
      const newQty = Math.max(0, offlineSale.quantity - 1);
      await ctx.db.patch(offlineSale._id, {
        quantity: newQty,
        totalAmount: offlineSale.totalAmount - ticket.unitPrice,
        commissionAmount: offlineSale.commissionAmount - offlineSale.commissionAmount * refundFactor,
        producerFeeAmount: offlineSale.producerFeeAmount - offlineSale.producerFeeAmount * refundFactor,
        amountOwedToProducer: offlineSale.amountOwedToProducer - (ticket.unitPrice * (1 - offlineSale.commissionRate)),
        status: newQty === 0 ? "cancelled" : offlineSale.status,
      });

      // Marcar a transação offline existente como reembolsada (não cria nova)
      if (tx) {
        await ctx.db.patch(tx._id, {
          status: "refunded",
          metadata: {
            ...(tx.metadata as any),
            refundedTicketId: ticketId,
            refundReason: reason,
            refundedAt: Date.now(),
          },
        });
      }
    }

    // Atualizar stats do promoter
    if (promoter) {
      await ctx.db.patch(promoter._id, {
        totalSales: Math.max(0, (promoter.totalSales || 0) - 1),
        totalRevenue: Math.max(0, (promoter.totalRevenue || 0) - ticket.unitPrice),
      });
    }

    return { success: true };
  },
});

// Cancelar toda uma venda offline (por transactionId)
export const cancelOfflineTransaction = mutation({
  args: {
    transactionId: v.string(),
    eventId: v.id("events"),
    userId: v.string(),
  },
  handler: async (ctx, { transactionId, eventId, userId }) => {
    // Buscar todos os ingressos da transação
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_transaction", (q) => q.eq("transactionId", transactionId))
      .filter((q) => q.eq(q.field("eventId"), eventId))
      .collect();

    if (tickets.length === 0) throw new Error("Nenhum ingresso encontrado para esta transação");

    // Cancelar todos os ingressos e restaurar estoque
    const stockMap: Record<string, number> = {};
    for (const ticket of tickets) {
      if (ticket.status === "valid") {
        await ctx.db.patch(ticket._id, { status: "cancelled" });
        const ttId = ticket.ticketTypeId as string;
        stockMap[ttId] = (stockMap[ttId] || 0) + 1;
      }
    }

    // Restaurar estoque por tipo
    for (const [ticketTypeId, count] of Object.entries(stockMap)) {
      const tt = await ctx.db.get(ticketTypeId as Id<"ticketTypes">);
      if (tt) {
        await ctx.db.patch(ticketTypeId as Id<"ticketTypes">, {
          availableQuantity: tt.availableQuantity + count,
        });
      }
    }

    // Cancelar a transação
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", transactionId))
      .first();
    if (tx) {
      await ctx.db.patch(tx._id, { status: "refunded" });
    }

    // Buscar e cancelar offlineSale
    if (tickets[0]?.promoterCode) {
      const promoter = await ctx.db
        .query("promoters")
        .withIndex("by_event_code", (q) =>
          q.eq("eventId", eventId).eq("code", tickets[0].promoterCode!)
        )
        .first();

      if (promoter) {
        const sale = await ctx.db
          .query("offlineSales")
          .withIndex("by_promoter", (q) => q.eq("promoterId", promoter._id))
          .filter((q) =>
            q.and(
              q.eq(q.field("eventId"), eventId),
              q.neq(q.field("status"), "cancelled")
            )
          )
          .first();

        if (sale) {
          await ctx.db.patch(sale._id, {
            quantity: 0,
            totalAmount: 0,
            commissionAmount: 0,
            producerFeeAmount: 0,
            amountOwedToProducer: 0,
            status: "cancelled",
          });
          // Atualizar stats
          await ctx.db.patch(promoter._id, {
            totalSales: Math.max(0, (promoter.totalSales || 0) - sale.quantity),
            totalRevenue: Math.max(0, (promoter.totalRevenue || 0) - sale.totalAmount),
          });
        }
      }
    }

    return { success: true, cancelledCount: tickets.length };
  },
});

// Dashboard do promoter (KPIs financeiros offline)
export const getPromoterDashboard = query({
  args: { eventId: v.id("events"), promoterId: v.id("promoters") },
  handler: async (ctx, { eventId, promoterId }) => {
    const sales = await ctx.db
      .query("offlineSales")
      .withIndex("by_promoter", (q) => q.eq("promoterId", promoterId))
      .filter((q) =>
        q.and(
          q.eq(q.field("eventId"), eventId),
          q.or(q.eq(q.field("status"), "recorded"), q.eq(q.field("status"), "settled"))
        )
      )
      .collect();

    const settlements = await ctx.db
      .query("offlineSettlements")
      .withIndex("by_promoter", (q) => q.eq("promoterId", promoterId))
      .filter((q) => q.eq(q.field("eventId"), eventId))
      .collect();

    const totalSalesAmount = sales.reduce((s, x) => s + (x.totalAmount || 0), 0);
    const totalCommission = sales.reduce((s, x) => s + (x.commissionAmount || 0), 0);
    const totalProducerFee = sales.reduce((s, x) => s + (x.producerFeeAmount || 0), 0);
    const totalOwed = sales.reduce((s, x) => s + (x.amountOwedToProducer || 0), 0);
    const totalSettled = settlements.reduce((s, x) => s + (x.amount || 0), 0);
    const outstanding = Math.max(0, totalOwed - totalSettled);

    return {
      success: true,
      totals: {
        totalSalesAmount,
        totalCommission,
        totalProducerFee,
        totalOwed,
        totalSettled,
        outstanding,
      },
      sales,
      settlements,
    };
  },
});

// Histórico de transações do promoter (para a tela offline)
export const getPromoterTransactions = query({
  args: { eventId: v.id("events"), promoterId: v.id("promoters") },
  handler: async (ctx, { eventId, promoterId }) => {
    const promoter = await ctx.db.get(promoterId);
    if (!promoter) return [];

    // Buscar transações offline deste promoter
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.or(
          q.eq(q.field("paymentMethod"), "OFFLINE_ADJUSTMENT"),
          q.eq(q.field("paymentMethod"), "OFFLINE_ADJUSTMENT_REFUND")
        )
      )
      .collect();

    // Filtrar pelo código do promoter
    const promoterTransactions = transactions.filter(
      (t) => (t.metadata as any)?.promoterCode === promoter.code
        || (t.metadata as any)?.promoterCode === promoter.code
    );

    // Para cada transação, buscar ingressos
    const enriched = await Promise.all(
      promoterTransactions
        .filter((t) => t.paymentMethod === "OFFLINE_ADJUSTMENT")
        .map(async (tx) => {
          const tickets = await ctx.db
            .query("tickets")
            .withIndex("by_transaction", (q) => q.eq("transactionId", tx.transactionId))
            .collect();

          const ticketTypes = await Promise.all(
            tickets.map(async (t) => {
              const tt = await ctx.db.get(t.ticketTypeId);
              return { ...t, ticketTypeName: tt?.name || "Ingresso" };
            })
          );

          const meta = tx.metadata as any;
          return {
            transactionId: tx.transactionId,
            createdAt: tx.createdAt,
            buyerEmail: meta?.recipientEmail || tx.customerId,
            totalAmount: meta?.totalAmountCharged || 0,
            quantity: meta?.quantity || tickets.length,
            status: tx.status,
            isOffline: true,
            tickets: ticketTypes,
            notes: meta?.notes,
          };
        })
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Dashboard do produtor: todos os promoters com totais financeiros
export const getProducerPromotersDashboard = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const promoters = await ctx.db
      .query("promoters")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    return await Promise.all(
      promoters.map(async (promoter) => {
        const sales = await ctx.db
          .query("offlineSales")
          .withIndex("by_promoter", (q) => q.eq("promoterId", promoter._id))
          .filter((q) =>
            q.or(q.eq(q.field("status"), "recorded"), q.eq(q.field("status"), "settled"))
          )
          .collect();

        const settlements = await ctx.db
          .query("offlineSettlements")
          .withIndex("by_promoter", (q) => q.eq("promoterId", promoter._id))
          .filter((q) => q.eq(q.field("eventId"), eventId))
          .collect();

        // Online (via link do promoter)
        const onlineTicketsRaw = await ctx.db
          .query("tickets")
          .withIndex("by_promoter", (q) => q.eq("promoterCode", promoter.code))
          .filter((q) =>
            q.and(
              q.eq(q.field("eventId"), eventId),
              q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used"))
            )
          )
          .collect();

        const onlineTickets = onlineTicketsRaw.filter(
          (t) => !isOfflinePromoterSaleTicket(t.transactionId)
        );

        const onlineAmount = onlineTickets.reduce((s, t) => s + t.totalAmount, 0);
        const rawOnlineRate = promoter.commissionRate ?? 0;
        const normalizedOnlineRate = rawOnlineRate > 1 ? rawOnlineRate / 100 : rawOnlineRate;
        const onlineCommission = onlineAmount * normalizedOnlineRate;

        const totalSalesAmount = sales.reduce((s, x) => s + (x.totalAmount || 0), 0);
        const totalCommission = sales.reduce((s, x) => s + (x.commissionAmount || 0), 0) + onlineCommission;
        const totalProducerFee = sales.reduce((s, x) => s + (x.producerFeeAmount || 0), 0);
        const totalOwed = sales.reduce((s, x) => s + (x.amountOwedToProducer || 0), 0);
        const totalSettled = settlements.reduce((s, x) => s + (x.amount || 0), 0);
        const outstanding = Math.max(0, totalOwed - totalSettled);
        const totalTicketsCount = sales.reduce((s, x) => s + (x.quantity || 0), 0);

        return {
          promoterId: promoter._id,
          name: promoter.name,
          code: promoter.code,
          email: promoter.email,
          commissionRate: promoter.commissionRate ?? 0,
          totals: {
            totalSalesAmount,
            totalCommission,
            totalProducerFee,
            totalOwed,
            totalSettled,
            outstanding,
            totalTicketsCount,
          },
          online: {
            totalAmount: onlineAmount,
            tickets: onlineTickets.length,
            commission: onlineCommission,
          },
        };
      })
    );
  },
});

// Registrar liquidação (pagamento de promoter ao produtor)
export const recordPromoterSettlement = mutation({
  args: {
    eventId: v.id("events"),
    promoterId: v.id("promoters"),
    amount: v.number(),
    userId: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("offlineSettlements", {
      eventId: args.eventId,
      promoterId: args.promoterId,
      amount: args.amount,
      recordedAt: Date.now(),
      recordedBy: args.userId,
      notes: args.notes,
    });
    return { success: true };
  },
});

// Buscar liquidações de um promoter
export const getPromoterSettlements = query({
  args: { eventId: v.id("events"), promoterId: v.id("promoters") },
  handler: async (ctx, { eventId, promoterId }) => {
    return await ctx.db
      .query("offlineSettlements")
      .withIndex("by_promoter", (q) => q.eq("promoterId", promoterId))
      .filter((q) => q.eq(q.field("eventId"), eventId))
      .collect();
  },
});

// Atualizar liquidação
export const updatePromoterSettlement = mutation({
  args: {
    settlementId: v.id("offlineSettlements"),
    amount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { settlementId, amount, notes }) => {
    await ctx.db.patch(settlementId, { amount, notes });
    return { success: true };
  },
});

// Deletar liquidação
export const deletePromoterSettlement = mutation({
  args: { settlementId: v.id("offlineSettlements") },
  handler: async (ctx, { settlementId }) => {
    await ctx.db.delete(settlementId);
    return { success: true };
  },
});
