import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

    // Agrupar por promoter
    const salesByPromoter = tickets.reduce((acc, ticket) => {
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

    // Group by promoter code
    const salesByPromoter = tickets.reduce((acc, ticket) => {
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

        const salesStats = tickets.reduce((acc, ticket) => {
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
