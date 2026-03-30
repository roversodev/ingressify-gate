import { GenericId, v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { feeCalculations } from "../lib/fees";
const { calculateProducerAmount } = feeCalculations;

// Verificar se um usuário é admin e suas permissões
export const checkAdminStatus = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      return { isAdmin: false };
    }

    return {
      isAdmin: true,
      role: admin.role,
      permissions: admin.permissions,
      isSuperAdmin: admin.role === "superadmin",
    };
  },
});

// Criar o primeiro superadmin (só pode ser chamado uma vez)
export const createFirstSuperAdmin = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, { userId, email }) => {
    // Verificar se já existe algum superadmin
    const existingSuperAdmin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_role", (q) => q.eq("role", "superadmin"))
      .first();

    if (existingSuperAdmin) {
      throw new Error("Já existe um superadmin configurado");
    }

    // Criar o primeiro superadmin
    const adminId = await ctx.db.insert("platformAdmins", {
      userId,
      email,
      role: "superadmin",
      permissions: ["*"], // Todas as permissões
      createdAt: Date.now(),
      isActive: true,
    });

    // Registrar atividade
    await ctx.db.insert("adminActivityLogs", {
      adminId: userId,
      action: "create_first_superadmin",
      targetType: "admin",
      targetId: userId,
      details: { email },
      timestamp: Date.now(),
    });

    return adminId;
  },
});

// Adicionar um novo admin (requer ser superadmin)
export const addAdmin = mutation({
  args: {
    currentUserId: v.string(), // ID do admin atual
    newAdminUserId: v.string(), // ID do novo admin
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("support"),
      v.literal("finance")
    ),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário atual é superadmin
    const currentAdmin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.currentUserId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!currentAdmin || currentAdmin.role !== "superadmin") {
      throw new Error("Apenas superadmins podem adicionar novos administradores");
    }

    // Verificar se o usuário já é admin
    const existingAdmin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.newAdminUserId))
      .first();

    if (existingAdmin) {
      if (existingAdmin.isActive) {
        throw new Error("Este usuário já é um administrador");
      } else {
        // Reativar admin existente
        await ctx.db.patch(existingAdmin._id, {
          role: args.role,
          permissions: args.permissions,
          isActive: true,
          createdBy: args.currentUserId,
          createdAt: Date.now(),
        });

        // Registrar atividade
        await ctx.db.insert("adminActivityLogs", {
          adminId: args.currentUserId,
          action: "reactivate_admin",
          targetType: "admin",
          targetId: args.newAdminUserId,
          details: { role: args.role, permissions: args.permissions },
          timestamp: Date.now(),
        });

        return existingAdmin._id;
      }
    }

    // Criar novo admin
    const adminId = await ctx.db.insert("platformAdmins", {
      userId: args.newAdminUserId,
      email: args.email,
      role: args.role,
      permissions: args.permissions,
      createdAt: Date.now(),
      createdBy: args.currentUserId,
      isActive: true,
    });

    // Registrar atividade
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.currentUserId,
      action: "create_admin",
      targetType: "admin",
      targetId: args.newAdminUserId,
      details: { role: args.role, permissions: args.permissions },
      timestamp: Date.now(),
    });

    return adminId;
  },
});

// Remover um admin
export const removeAdmin = mutation({
  args: {
    currentUserId: v.string(),
    adminUserId: v.string(),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário atual é superadmin
    const currentAdmin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.currentUserId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!currentAdmin || currentAdmin.role !== "superadmin") {
      throw new Error("Apenas superadmins podem remover administradores");
    }

    // Não permitir remover a si mesmo
    if (args.currentUserId === args.adminUserId) {
      throw new Error("Você não pode remover a si mesmo");
    }

    // Buscar o admin a ser removido
    const adminToRemove = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.adminUserId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!adminToRemove) {
      throw new Error("Administrador não encontrado");
    }

    // Desativar o admin (não excluir)
    await ctx.db.patch(adminToRemove._id, {
      isActive: false,
    });

    // Registrar atividade
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.currentUserId,
      action: "remove_admin",
      targetType: "admin",
      targetId: args.adminUserId,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Atualizar permissões de um admin
export const updateAdminPermissions = mutation({
  args: {
    currentUserId: v.string(),
    adminUserId: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("support"),
      v.literal("finance")
    ),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário atual é superadmin
    const currentAdmin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.currentUserId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!currentAdmin || currentAdmin.role !== "superadmin") {
      throw new Error("Apenas superadmins podem atualizar permissões");
    }

    // Buscar o admin a ser atualizado
    const adminToUpdate = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.adminUserId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!adminToUpdate) {
      throw new Error("Administrador não encontrado");
    }

    // Não permitir alterar superadmins
    if (adminToUpdate.role === "superadmin") {
      throw new Error("Não é possível alterar permissões de um superadmin");
    }

    // Atualizar permissões
    await ctx.db.patch(adminToUpdate._id, {
      role: args.role,
      permissions: args.permissions,
    });

    // Registrar atividade
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.currentUserId,
      action: "update_admin_permissions",
      targetType: "admin",
      targetId: args.adminUserId,
      details: { role: args.role, permissions: args.permissions },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Listar todos os admins
export const listAllAdmins = query({
  args: { currentUserId: v.string() },
  handler: async (ctx, { currentUserId }) => {
    // Verificar se o usuário atual é admin
    const currentAdmin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", currentUserId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!currentAdmin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar todos os admins ativos
    const admins = await ctx.db
      .query("platformAdmins")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return admins.map(admin => ({
      _id: admin._id,
      userId: admin.userId,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
      createdAt: admin.createdAt,
      lastLogin: admin.lastLogin,
    }));
  },
});

// Obter estatísticas gerais da plataforma
export const getPlatformStats = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Contar usuários
    const totalUsers = await ctx.db.query("users").collect();

    // Contar eventos
    const events = await ctx.db.query("events").collect();

    // Contar organizações
    const organizations = await ctx.db.query("organizations").collect();

    // Contar ingressos vendidos
    const tickets = await ctx.db
      .query("tickets")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "valid"),
          q.eq(q.field("status"), "used")
        )
      )
      .collect();

    // Calcular receita total
    const totalRevenue = tickets.reduce((sum, ticket) => sum + ticket.totalAmount, 0);

    return {
      totalUsers: totalUsers.length,
      totalEvents: events.length,
      totalOrganizations: organizations.length,
      totalTicketsSold: tickets.length,
      totalRevenue,
    };
  },
});

// Listar todos os usuários com paginação
export const listAllUsers = query({
  args: {
    userId: v.string(),
    skip: v.optional(v.number()),
    limit: v.optional(v.number()),
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, { userId, skip = 0, limit = 50, searchTerm }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar usuários com paginação
    let query = ctx.db.query("users");

    // Buscar todos os usuários e filtrar em JavaScript
    const allUsers = await query.collect();

    // Filtrar por termo de busca se fornecido
    let filteredUsers = allUsers;
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredUsers = allUsers.filter(user =>
      (user.name?.toLowerCase().includes(lowerSearchTerm) ||
        user.email?.toLowerCase().includes(lowerSearchTerm))
      );
    }

    // Aplicar paginação manualmente
    const paginatedUsers = filteredUsers.slice(skip, skip + limit);

    return {
      users: paginatedUsers,
      hasMore: skip + limit < filteredUsers.length,
      nextCursor: skip + limit < filteredUsers.length ? (skip + limit).toString() : null,
    };
  },
});

// Listar todos os eventos com paginação
export const listAllEvents = query({
  args: {
    userId: v.string(),
    skip: v.optional(v.number()),
    limit: v.optional(v.number()),
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, { userId, skip = 0, limit = 50, searchTerm }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar eventos
    let query = ctx.db.query("events");

    // Buscar todos os eventos e filtrar em JavaScript
    const allEvents = await query.collect();

    // Filtrar por termo de busca se fornecido
    let filteredEvents = allEvents;
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredEvents = allEvents.filter(event =>
      (event.name?.toLowerCase().includes(lowerSearchTerm) ||
        event.description?.toLowerCase().includes(lowerSearchTerm) ||
        event.location?.toLowerCase().includes(lowerSearchTerm))
      );
    }

    // Aplicar paginação manualmente
    const paginatedEvents = filteredEvents.slice(skip, skip + limit);
    
    // Buscar configurações de taxa para cada evento
    const eventsWithSettings = await Promise.all(
      paginatedEvents.map(async (event) => {
        const feeSettings = await ctx.db
          .query("eventFeeSettings")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .first();
        
        return {
          ...event,
          feeSettings: feeSettings || null
        };
      })
    );

    return {
      events: eventsWithSettings,
      hasMore: skip + limit < filteredEvents.length,
      nextCursor: skip + limit < filteredEvents.length ? (skip + limit).toString() : null,
    };
  },
});

// Obter detalhes de um evento específico
export const getEventDetails = query({
  args: {
    userId: v.string(),
    eventId: v.id("events")
  },
  handler: async (ctx, { userId, eventId }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar detalhes do evento
    const event = await ctx.db.get(eventId);
    if (!event) {
      throw new Error("Evento não encontrado");
    }

    // Buscar tipos de ingresso
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Buscar ingressos vendidos
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Calcular estatísticas
    const totalTicketsSold = tickets.length;
    const totalRevenue = tickets.reduce((sum, ticket) => sum + ticket.totalAmount, 0);

    return {
      event,
      ticketTypes,
      stats: {
        totalTicketsSold,
        totalRevenue,
        ticketsByStatus: {
          valid: tickets.filter(t => t.status === "valid").length,
          used: tickets.filter(t => t.status === "used").length,
          refunded: tickets.filter(t => t.status === "refunded").length,
          cancelled: tickets.filter(t => t.status === "cancelled").length,
        }
      }
    };
  },
});

// Registrar ação de admin
export const logAdminActivity = mutation({
  args: {
    adminId: v.string(),
    action: v.string(),
    targetType: v.string(),
    targetId: v.optional(v.string()),
    details: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.adminId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Registrar atividade
    const logId = await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminId,
      action: args.action,
      targetType: args.targetType,
      targetId: args.targetId,
      details: args.details,
      timestamp: Date.now(),
      ipAddress: args.ipAddress,
    });

    return logId;
  },
});

// Obter logs de atividade de admin
export const getAdminActivityLogs = query({
  args: {
    userId: v.string(),
    skip: v.optional(v.number()),
    limit: v.optional(v.number()),
    filterAdmin: v.optional(v.string()),
    filterAction: v.optional(v.string()),
  },
  handler: async (ctx, { userId, skip = 0, limit = 50, filterAdmin, filterAction }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Construir query com o índice apropriado
    let query;

    if (filterAdmin) {
      query = ctx.db.query("adminActivityLogs")
        .withIndex("by_admin", (q) => q.eq("adminId", filterAdmin));
    } else if (filterAction) {
      query = ctx.db.query("adminActivityLogs")
        .withIndex("by_action", (q) => q.eq("action", filterAction));
    } else {
      query = ctx.db.query("adminActivityLogs");
    }

    // Executar query com paginação
    const logs = await query
      .order("desc")
      .paginate({ numItems: limit, cursor: skip.toString() });

    return {
      logs: logs.page,
      hasMore: logs.continueCursor !== null,
      nextCursor: logs.continueCursor,
    };
  },
});

// Obter estatísticas de vendas ao longo do tempo
export const getSalesOverTime = query({
  args: {
    userId: v.string(),
    period: v.optional(v.string()), // "7d", "30d", "90d"
  },
  handler: async (ctx, { userId, period = "90d" }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Determinar a data de início com base no período
    const now = new Date();
    const startDate = new Date();
    if (period === "7d") {
      startDate.setDate(now.getDate() - 7);
    } else if (period === "30d") {
      startDate.setDate(now.getDate() - 30);
    } else {
      startDate.setDate(now.getDate() - 90);
    }

    // Buscar tickets criados no período
    const tickets = await ctx.db
      .query("tickets")
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field("status"), "valid"),
            q.eq(q.field("status"), "used")
          ),
          q.gte(q.field("_creationTime"), startDate.getTime())
        )
      )
      .collect();

    // Definir interface para o objeto salesByDay
    interface DailySales {
      date: string;
      tickets: number;
      revenue: number;
    }

    // Inicializar salesByDay com o tipo correto
    const salesByDay: Record<string, DailySales> = {};

    tickets.forEach(ticket => {
      const date = new Date(ticket._creationTime);
      const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!salesByDay[dateString]) {
        salesByDay[dateString] = {
          date: dateString,
          tickets: 0,
          revenue: 0
        };
      }

      salesByDay[dateString].tickets += 1;
      salesByDay[dateString].revenue += ticket.totalAmount;
    });

    // Converter para array e ordenar por data
    const result = Object.values(salesByDay).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return result;
  },
});

export const getRevenueData = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {

    // Buscar todos os tickets válidos ou usados 
    const tickets = await ctx.db
      .query("tickets")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "valid"),
          q.eq(q.field("status"), "used")
        )
      )
      .collect();

    // Definir interfaces para os objetos de dados 
    interface MonthlyRevenue {
      month: string;
      actual: number;
      projected: number;
    }

    interface YearlyRevenue {
      month: string; // Ano como string 
      actual: number;
      projected: number;
    }

    // Inicializar objetos para armazenar dados mensais e anuais 
    const monthlyData: Record<string, MonthlyRevenue> = {};
    const yearlyData: Record<string, YearlyRevenue> = {};

    // Valor base para projeção (8k no primeiro mês) 
    const baseProjection = 5000;
    // Taxa de crescimento mensal para projeção (25%) 
    const monthlyGrowthRate = 0.25;
    // Taxa de crescimento anual para projeção (40%) 
    const yearlyGrowthRate = 0.40;

    // Obter o ano e mês atual 
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Criar entradas para todos os meses do ano atual 
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${currentYear}-${String(month).padStart(2, '0')}`;
      const date = new Date(currentYear, month - 1, 1);
      const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date);

      monthlyData[monthKey] = {
        month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        actual: 0,
        projected: 0
      };
    }

    // Criar entradas para os anos (atual e próximos 5 anos) 
    for (let yearOffset = 0; yearOffset < 6; yearOffset++) {
      const year = currentYear + yearOffset;
      const yearKey = `${year}`;

      yearlyData[yearKey] = {
        month: yearKey,
        actual: 0,
        projected: 0
      };
    }

    // Processar tickets para dados reais 
    tickets.forEach(ticket => {
      const date = new Date(ticket._creationTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const yearKey = `${date.getFullYear()}`;

      // Adicionar aos dados mensais se for do ano atual 
      if (date.getFullYear() === currentYear && monthlyData[monthKey]) {
        monthlyData[monthKey].actual += ticket.totalAmount;
      }

      // Adicionar aos dados anuais 
      if (yearlyData[yearKey]) {
        yearlyData[yearKey].actual += ticket.totalAmount;
      }
    });

    // Ordenar as chaves de meses e anos 
    const sortedMonthKeys = Object.keys(monthlyData).sort();
    const sortedYearKeys = Object.keys(yearlyData).sort();

    // Calcular projeções mensais 
    sortedMonthKeys.forEach((key, index) => {
      // Projeção baseada no crescimento mensal a partir do valor base 
      monthlyData[key].projected = Math.round(baseProjection * Math.pow(1 + monthlyGrowthRate, index));

      // NÃO usar o valor projetado como valor real quando não há dados
      // Os valores reais devem permanecer como foram calculados com base nas transações reais
    });

    // Calcular projeções anuais 
    sortedYearKeys.forEach((key, index) => {
      // Projeção baseada no crescimento anual a partir do valor base anualizado 
      yearlyData[key].projected = Math.round(baseProjection * 12 * Math.pow(1 + yearlyGrowthRate, index));

      // NÃO usar o valor projetado como valor real quando não há dados
      // Os valores reais devem permanecer como foram calculados com base nas transações reais
    });

    // Converter para arrays 
    const monthlyResult = sortedMonthKeys.map(key => monthlyData[key]);
    const yearlyResult = sortedYearKeys.map(key => yearlyData[key]);

    return {
      monthly: monthlyResult,
      yearly: yearlyResult
    };
  },
});

export const getTicketSalesData = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {

    // Buscar todos os tickets válidos ou usados 
    const tickets = await ctx.db
      .query("tickets")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "valid"),
          q.eq(q.field("status"), "used")
        )
      )
      .collect();

    // Definir interfaces para os objetos de dados 
    interface MonthlyTickets {
      month: string;
      actual: number;
      projected: number;
    }

    interface YearlyTickets {
      month: string; // Ano como string 
      actual: number;
      projected: number;
    }

    // Inicializar objetos para armazenar dados mensais e anuais 
    const monthlyData: Record<string, MonthlyTickets> = {};
    const yearlyData: Record<string, YearlyTickets> = {};

    // Valor base para projeção (500 ingressos no primeiro mês) 
    const baseProjection = 100;
    // Taxa de crescimento mensal para projeção (20%) 
    const monthlyGrowthRate = 0.20;
    // Taxa de crescimento anual para projeção (35%) 
    const yearlyGrowthRate = 0.35;

    // Obter o ano e mês atual 
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Criar entradas para todos os meses do ano atual 
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${currentYear}-${String(month).padStart(2, '0')}`;
      const date = new Date(currentYear, month - 1, 1);
      const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date);

      monthlyData[monthKey] = {
        month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        actual: 0,
        projected: 0
      };
    }

    // Criar entradas para os anos (atual e próximos 5 anos) 
    for (let yearOffset = 0; yearOffset < 6; yearOffset++) {
      const year = currentYear + yearOffset;
      const yearKey = `${year}`;

      yearlyData[yearKey] = {
        month: yearKey,
        actual: 0,
        projected: 0
      };
    }

    // Processar tickets para dados reais 
    tickets.forEach(ticket => {
      const date = new Date(ticket._creationTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const yearKey = `${date.getFullYear()}`;

      // Adicionar aos dados mensais se for do ano atual 
      if (date.getFullYear() === currentYear && monthlyData[monthKey]) {
        monthlyData[monthKey].actual += 1; // Contagem de ingressos, não valor 
      }

      // Adicionar aos dados anuais 
      if (yearlyData[yearKey]) {
        yearlyData[yearKey].actual += 1; // Contagem de ingressos, não valor 
      }
    });

    // Ordenar as chaves de meses e anos 
    const sortedMonthKeys = Object.keys(monthlyData).sort();
    const sortedYearKeys = Object.keys(yearlyData).sort();

    // Calcular projeções mensais 
    sortedMonthKeys.forEach((key, index) => {
      // Projeção baseada no crescimento mensal a partir do valor base 
      monthlyData[key].projected = Math.round(baseProjection * Math.pow(1 + monthlyGrowthRate, index));

      // NÃO usar o valor projetado como valor real quando não há dados
      // Os valores reais devem permanecer como foram calculados com base nas transações reais
    });

    // Calcular projeções anuais 
    sortedYearKeys.forEach((key, index) => {
      // Projeção baseada no crescimento anual a partir do valor base anualizado 
      yearlyData[key].projected = Math.round(baseProjection * 12 * Math.pow(1 + yearlyGrowthRate, index));

      // NÃO usar o valor projetado como valor real quando não há dados
      // Os valores reais devem permanecer como foram calculados com base nas transações reais
    });

    // Converter para arrays 
    const monthlyResult = sortedMonthKeys.map(key => monthlyData[key]);
    const yearlyResult = sortedYearKeys.map(key => yearlyData[key]);

    return {
      monthly: monthlyResult,
      yearly: yearlyResult
    };
  },
});


export const getRevenueChurnData = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    // Obter o ano atual e timestamp de inicio do ano para otimização
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const startOfYear = new Date(currentYear, 0, 1).getTime();

    // Buscar todos os tickets deste ano usando o índice de tempo (muito mais rápido que filter)
    const ticketsThisYear = await ctx.db
      .query("tickets")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", startOfYear))
      .collect();

    // Filtrar em memória
    const validTickets = ticketsThisYear.filter(t => 
      t.status === "valid" || t.status === "used"
    );

    // Incluindo "canceled" (com um L) por precaução se houver dados antigos/incorretos, 
    // embora o schema defina "cancelled" (dois Ls)
    const canceledTickets = ticketsThisYear.filter(t => 
      t.status === "cancelled" || t.status === "refunded" || (t as any).status === "canceled"
    );

    // Definir interface para os dados mensais
    interface MonthlyRevenueChurn {
      month: string;
      revenues: number;
      churn: number;
    }

    // Inicializar objeto para armazenar dados mensais
    const monthlyData: Record<string, MonthlyRevenueChurn> = {};

    // Criar entradas para todos os meses do ano atual
    for (let month = 1; month <= 12; month++) {
      const date = new Date(currentYear, month - 1, 1);
      const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);

      monthlyData[monthName] = {
        month: monthName,
        revenues: 0,
        churn: 0
      };
    }

    // Processar tickets válidos para receitas
    validTickets.forEach(ticket => {
      const date = new Date(ticket._creationTime);
      const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);

      if (monthlyData[monthName]) {
        monthlyData[monthName].revenues += ticket.totalAmount;
      }
    });

    // Processar tickets cancelados para churn (valor negativo)
    canceledTickets.forEach(ticket => {
      const date = new Date(ticket._creationTime);
      const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);

      if (monthlyData[monthName]) {
        // Churn é representado como valor negativo
        monthlyData[monthName].churn -= ticket.totalAmount;
      }
    });

    // Converter para array e ordenar por mês
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const result = Object.values(monthlyData).sort((a, b) => {
      const monthA = a.month.split(' ')[0];
      const monthB = b.month.split(' ')[0];
      return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
    });

    return result;
  },
});


export const getRefundsData = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    // Obter o ano atual e timestamp de inicio do ano para otimização
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const startOfYear = new Date(currentYear, 0, 1).getTime();

    // Buscar todos os tickets deste ano usando o índice de tempo
    const ticketsThisYear = await ctx.db
      .query("tickets")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", startOfYear))
      .collect();

    // Filtrar em memória
    const refundedTickets = ticketsThisYear.filter(t => 
      t.status === "refunded" || t.status === "cancelled"
    );

    // Definir interfaces para os objetos de dados 
    interface MonthlyRefunds {
      month: string;
      actual: number;
      projected: number;
    }

    interface YearlyRefunds {
      month: string; // Ano como string 
      actual: number;
      projected: number;
    }

    // Inicializar objetos para armazenar dados mensais e anuais 
    const monthlyData: Record<string, MonthlyRefunds> = {};
    const yearlyData: Record<string, YearlyRefunds> = {};

    // Valor base para projeção
    const baseProjection = 200;
    // Taxa de crescimento mensal para projeção (15%) 
    const monthlyGrowthRate = 0.15;
    // Taxa de crescimento anual para projeção (25%) 
    const yearlyGrowthRate = 0.25;

    // Criar entradas para todos os meses do ano atual 
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${currentYear}-${String(month).padStart(2, '0')}`;
      const date = new Date(currentYear, month - 1, 1);
      const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);

      monthlyData[monthKey] = {
        month: monthName,
        actual: 0,
        projected: 0
      };
    }

    // Criar entradas para os anos (atual e próximos 5 anos) 
    for (let yearOffset = 0; yearOffset < 6; yearOffset++) {
      const year = currentYear + yearOffset;
      const yearKey = `${year}`;

      yearlyData[yearKey] = {
        month: yearKey,
        actual: 0,
        projected: 0
      };
    }

    // Processar tickets para dados reais 
    refundedTickets.forEach(ticket => {
      const date = new Date(ticket._creationTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const yearKey = `${date.getFullYear()}`;

      // Adicionar aos dados mensais se for do ano atual 
      if (date.getFullYear() === currentYear && monthlyData[monthKey]) {
        monthlyData[monthKey].actual += ticket.totalAmount;
      }

      // Adicionar aos dados anuais 
      if (yearlyData[yearKey]) {
        yearlyData[yearKey].actual += ticket.totalAmount;
      }
    });

    // Ordenar as chaves de meses e anos 
    const sortedMonthKeys = Object.keys(monthlyData).sort();
    const sortedYearKeys = Object.keys(yearlyData).sort();

    // Calcular projeções mensais 
    sortedMonthKeys.forEach((key, index) => {
      // Projeção baseada no crescimento mensal a partir do valor base 
      monthlyData[key].projected = Math.round(baseProjection * Math.pow(1 + monthlyGrowthRate, index));
    });

    // Calcular projeções anuais 
    sortedYearKeys.forEach((key, index) => {
      // Projeção baseada no crescimento anual a partir do valor base anualizado 
      yearlyData[key].projected = Math.round(baseProjection * 12 * Math.pow(1 + yearlyGrowthRate, index));
    });

    // Converter para arrays 
    const monthlyResult = sortedMonthKeys.map(key => monthlyData[key]);
    const yearlyResult = sortedYearKeys.map(key => yearlyData[key]);

    return {
      monthly: monthlyResult,
      yearly: yearlyResult
    };
  },
});


export const getEventLocationStats = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {

    // Buscar todos os eventos
    const events = await ctx.db
      .query("events")
      .collect();

    // Agrupar eventos por localização
    const locationMap = new Map();

    events.forEach(event => {
      const location = event.location;
      // Extrair apenas a cidade da localização (assumindo formato "Cidade, Estado")
      const city = location?.split(',')[0].trim();

      if (!locationMap.has(city)) {
        locationMap.set(city, {
          location: city,
          count: 0,
          revenue: 0,
          ticketsSold: 0
        });
      }

      locationMap.get(city).count += 1;
    });

    // Para cada localização, calcular receita e ingressos vendidos
    for (const [city, data] of locationMap.entries()) {
      // Buscar eventos desta cidade
      const cityEvents = events.filter(event => {
        const eventCity = event.location?.split(',')[0].trim();
        return eventCity === city;
      });

      // Para cada evento, buscar tickets e calcular métricas
      for (const event of cityEvents) {
        const tickets = await ctx.db
          .query("tickets")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .filter((q) =>
            q.or(
              q.eq(q.field("status"), "valid"),
              q.eq(q.field("status"), "used")
            )
          )
          .collect();

        data.ticketsSold += tickets.reduce((sum, ticket) => sum + ticket.quantity, 0);
        data.revenue += tickets.reduce((sum, ticket) => sum + ticket.totalAmount, 0);
      }
    }

    // Converter para array e ordenar por contagem
    const result = Array.from(locationMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Pegar apenas as 10 principais localizações

    return result;
  },
});



export const getUserGrowthData = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {

    // Buscar todos os usuários
    const users = await ctx.db
      .query("users")
      .collect();

    // Definir interfaces para os objetos de dados
    interface MonthlyUsers {
      month: string;
      actual: number;
      projected: number;
    }

    interface YearlyUsers {
      month: string; // Ano como string
      actual: number;
      projected: number;
    }

    // Inicializar objetos para armazenar dados mensais e anuais
    const monthlyData: Record<string, MonthlyUsers> = {};
    const yearlyData: Record<string, YearlyUsers> = {};

    // Obter a data atual
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Criar entradas para todos os meses do ano atual
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${currentYear}-${String(month).padStart(2, '0')}`;
      const date = new Date(currentYear, month - 1, 1);
      const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date);

      monthlyData[monthKey] = {
        month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        actual: 0,
        projected: 0
      };
    }

    // Criar entradas para os anos (atual e próximos 5 anos)
    for (let yearOffset = 0; yearOffset < 6; yearOffset++) {
      const year = currentYear + yearOffset;
      const yearKey = `${year}`;

      yearlyData[yearKey] = {
        month: yearKey,
        actual: 0,
        projected: 0
      };
    }

    // Processar usuários para dados reais
    users.forEach(user => {
      // Usar _creationTime como data de criação do usuário
      const date = new Date(user._creationTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const yearKey = `${date.getFullYear()}`;

      // Adicionar aos dados mensais se for do ano atual
      if (date.getFullYear() === currentYear && monthlyData[monthKey]) {
        monthlyData[monthKey].actual += 1;
      }

      // Adicionar aos dados anuais
      if (yearlyData[yearKey]) {
        yearlyData[yearKey].actual += 1;
      }
    });

    // Ordenar as chaves de meses e anos
    const sortedMonthKeys = Object.keys(monthlyData).sort();
    const sortedYearKeys = Object.keys(yearlyData).sort();

    // Definir taxas de crescimento para projeções
    const monthlyGrowthRate = 0.05; // 5% de crescimento mensal
    const yearlyGrowthRate = 0.30; // 30% de crescimento anual

    // Valor base para projeções (média dos últimos 3 meses ou um valor mínimo)
    let baseProjection = 10; // Valor mínimo padrão

    // Calcular média dos últimos 3 meses disponíveis
    const lastMonthsData = sortedMonthKeys
      .map(key => monthlyData[key].actual)
      .filter(value => value > 0)
      .slice(-3);

    if (lastMonthsData.length > 0) {
      baseProjection = Math.round(lastMonthsData.reduce((sum, val) => sum + val, 0) / lastMonthsData.length);
    }

    // Calcular projeções mensais
    sortedMonthKeys.forEach((key, index) => {
      // Projeção baseada no crescimento mensal a partir do valor base
      monthlyData[key].projected = Math.round(baseProjection * Math.pow(1 + monthlyGrowthRate, index));
    });

    // Calcular projeções anuais
    sortedYearKeys.forEach((key, index) => {
      // Projeção baseada no crescimento anual a partir do valor base anualizado
      yearlyData[key].projected = Math.round(baseProjection * 12 * Math.pow(1 + yearlyGrowthRate, index));
    });

    // Converter para arrays
    const monthlyResult = sortedMonthKeys.map(key => monthlyData[key]);
    const yearlyResult = sortedYearKeys.map(key => yearlyData[key]);

    return {
      monthly: monthlyResult,
      yearly: yearlyResult
    };
  },
});






// Buscar transação por ID
export const getByTransactionIdMutation = mutation({
  args: {
    transactionId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.transactionId) {
      return null;
    }

    const transaction = await ctx.db
      .query("transactions")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", args.transactionId))
      .first();

    if (!transaction) {
      return null;
    }

    // Buscar informações do evento
    const event = await ctx.db.get(transaction.eventId);

    return {
      ...transaction,
      eventName: event?.name,
      eventStartDate: event?.eventStartDate
    };
  },
});

// Buscar tickets por ID de transação
export const getTicketsByTransactionIdMutation = mutation({
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

    // Adicionar informações de tipo de ingresso para cada ticket
    const ticketsWithDetails = [];
    for (const ticket of tickets) {
      const ticketType = await ctx.db.get(ticket.ticketTypeId);
      ticketsWithDetails.push({
        ...ticket,
        ticketTypeName: ticketType?.name
      });
    }

    return ticketsWithDetails;
  },
});

// Buscar tickets por email
export const getTicketsByEmailMutation = mutation({
  args: {
    email: v.string(),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    // Primeiro, encontrar o usuário pelo email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) {
      return [];
    }

    // Depois, buscar os ingressos desse usuário
    let ticketsQuery = ctx.db.query("tickets").withIndex("by_user", (q) =>
      q.eq("userId", user.userId)
    );

    // Se eventId for fornecido, filtrar por evento específico
    if (args.eventId) {
      ticketsQuery = ticketsQuery.filter((q) =>
        q.eq(q.field("eventId"), args.eventId)
      );
    }

    const tickets = await ticketsQuery.collect();

    // Adicionar informações de evento e tipo de ingresso para cada ticket
    const ticketsWithDetails = [];
    for (const ticket of tickets) {
      const event = await ctx.db.get(ticket.eventId);
      const ticketType = await ctx.db.get(ticket.ticketTypeId);

      // Buscar transação associada
      let transaction = null;
      if (ticket.transactionId) {
        transaction = await ctx.db
          .query("transactions")
          .withIndex("by_transactionId", (q) => ticket.transactionId ? q.eq("transactionId", ticket.transactionId) : q.eq("transactionId", ""))
          .first();
      }

      ticketsWithDetails.push({
        ...ticket,
        eventName: event?.name,
        eventStartDate: event?.eventStartDate,
        ticketTypeName: ticketType?.name,
        transactionStatus: transaction?.status
      });
    }

    return ticketsWithDetails;
  },
});

// Buscar tickets por CPF
export const getTicketsByCpfMutation = mutation({
  args: {
    cpf: v.string(),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    // Buscar usuários com este CPF
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("cpf"), args.cpf))
      .collect();

    if (users.length === 0) {
      return [];
    }

    // Buscar ingressos para todos os usuários encontrados com este CPF
    const ticketsWithDetails = [];
    for (const user of users) {
      let ticketsQuery = ctx.db.query("tickets").withIndex("by_user", (q) =>
        q.eq("userId", user.userId)
      );

      // Se eventId for fornecido, filtrar por evento específico
      if (args.eventId) {
        ticketsQuery = ticketsQuery.filter((q) =>
          q.eq(q.field("eventId"), args.eventId)
        );
      }

      const userTickets = await ticketsQuery.collect();

      // Adicionar informações de evento e tipo de ingresso para cada ticket
      for (const ticket of userTickets) {
        const event = await ctx.db.get(ticket.eventId);
        const ticketType = await ctx.db.get(ticket.ticketTypeId);

        // Buscar transação associada
        let transaction = null;
        if (ticket.transactionId) {
          transaction = await ctx.db
            .query("transactions")
            .withIndex("by_transactionId", (q) => q.eq("transactionId", ticket.transactionId || ""))
            .first();
        }

        ticketsWithDetails.push({
          ...ticket,
          eventName: event?.name,
          eventStartDate: event?.eventStartDate,
          ticketTypeName: ticketType?.name,
          transactionStatus: transaction?.status,
          userName: user.name,
          userEmail: user.email,
          userCpf: user.cpf
        });
      }
    }

    return ticketsWithDetails;
  },
});



// Buscar transações de uma organização (versão mutation)
export const getOrganizationTransactionsMutation = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {

    // Buscar eventos da organização
    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const eventIds = events.map(event => event._id);

    // Se não houver eventos, retornar array vazio
    if (eventIds.length === 0) {
      return [];
    }

    // Buscar todas as transações dos eventos da organização
    const transactionsMap = new Map(); // Usar um Map para evitar duplicações

    for (const eventId of eventIds) {
      const event = events.find(e => e._id === eventId);
      const eventTransactions = await ctx.db
        .query("transactions")
        .filter((q) => q.eq(q.field("eventId"), eventId))
        .collect();

      // Adicionar informações do evento e garantir que não haja duplicações
      for (const transaction of eventTransactions) {
        // Usar o transactionId como chave para evitar duplicações
        if (!transactionsMap.has(transaction.transactionId)) {
          transactionsMap.set(transaction.transactionId, {
            ...transaction,
            eventName: event?.name,
            eventStartDate: event?.eventStartDate
          });
        }
      }
    }

    // Converter o Map para array
    const transactions = Array.from(transactionsMap.values());

    // Ordenar por data (mais recente primeiro)
    return transactions.sort((a, b) => {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  },
});



// Obter transações da organização
export const getOrganizationTransactions = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    eventId: v.optional(v.id("events")), // Adicionando parâmetro opcional para filtrar por evento
  },
  handler: async (ctx, args) => {

    // Buscar eventos da organização
    let events: any[] = [];

    if (args.eventId) {
      // Se eventId for fornecido, buscar apenas esse evento específico
      const event = await ctx.db.get(args.eventId);
      if (event && event.organizationId === args.organizationId) {
        events = [event];
      }
    } else {
      // Caso contrário, buscar todos os eventos da organização
      events = await ctx.db
        .query("events")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .collect();
    }

    const eventIds = events.map(event => event._id);

    // Se não houver eventos, retornar array vazio
    if (eventIds.length === 0) {
      return [];
    }

    // Buscar todas as transações dos eventos da organização
    const transactionsMap = new Map(); // Usar um Map para evitar duplicações

    for (const eventId of eventIds) {
      const event = events.find(e => e._id === eventId);
      const eventTransactions = await ctx.db
        .query("transactions")
        .filter((q) => q.eq(q.field("eventId"), eventId))
        .collect();

      // Adicionar informações do evento e garantir que não haja duplicações
      for (const transaction of eventTransactions) {
        // Filtrar transações gratuitas (paymentMethod: 'free' ou amount: 0)
        if (transaction.paymentMethod === 'free' || transaction.amount === 0) {
          continue; // Pular esta transação
        }
        
        // Usar o transactionId como chave para evitar duplicações
        if (!transactionsMap.has(transaction.transactionId)) {
          transactionsMap.set(transaction.transactionId, {
            ...transaction,
            eventName: event?.name,
            eventStartDate: event?.eventStartDate
          });
        }
      }
    }

    // Converter o Map para array
    const transactions = Array.from(transactionsMap.values());

    // Ordenar por data (mais recente primeiro)
    return transactions.sort((a, b) => {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  },
});



// Obter métricas financeiras da plataforma com filtros por período
export const getPlatformFinancialMetrics = query({
  args: {
    userId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
    if (!admin) throw new Error("Acesso não autorizado");

    const endDate = args.endDate ?? Date.now();
    const startDate = args.startDate ?? endDate - 30 * 24 * 60 * 60 * 1000;

    const [paidTransactions, completedTransactions] = await Promise.all([
      ctx.db
        .query("transactions")
        .withIndex("by_status_createdAt", (q) =>
          q.eq("status", "paid").gte("createdAt", startDate).lte("createdAt", endDate),
        )
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("by_status_createdAt", (q) =>
          q.eq("status", "completed").gte("createdAt", startDate).lte("createdAt", endDate),
        )
        .collect(),
    ]);

    const transactions = [...paidTransactions, ...completedTransactions];

    const allFeeSettings = await ctx.db.query("eventFeeSettings").collect();
    const feeSettingsMap = new Map<string, any>();
    for (const fs of allFeeSettings) feeSettingsMap.set(fs.eventId as unknown as string, fs);

    const metrics = {
      totalTransactions: transactions.length,
      onlineAmount: 0,
      platformRevenueOnline: 0,
      platformRevenuePix: 0,
      platformRevenueCard: 0,
      pixTransactions: 0,
      pixAmount: 0,
      pixCost: 0,
      cardTransactions: 0,
      cardAmount: 0,
      cardCost: 0,
      producerAmountOnline: 0,
      transactionsByDay: {} as Record<string, number>,
      revenueByDay: {} as Record<string, number>,
    };

    for (const tx of transactions) {
      // Ignorar transações negativas, de ajuste offline ou de ajuste manual no cálculo do Faturamento Bruto
      if (tx.amount < 0 || tx.paymentMethod === 'OFFLINE_ADJUSTMENT' || tx.paymentMethod === 'MANUAL_ADJUSTMENT') {
        continue;
      }


      const chargedAmount = tx.metadata?.chargedAmount ? parseFloat(tx.metadata.chargedAmount) : tx.amount;
      const discountAmount = tx.metadata?.discountAmount ? parseFloat(tx.metadata.discountAmount) : 0;
      const paymentMethod = tx.paymentMethod === "CARD" ? "CARD" : "PIX";

      const feeSettings = feeSettingsMap.get(tx.eventId as unknown as string);

      const producerAmount = calculateProducerAmount(
        chargedAmount,
        discountAmount,
        paymentMethod,
        feeSettings || undefined,
      );
      const platformFee = chargedAmount - producerAmount;

      metrics.onlineAmount += chargedAmount;
      metrics.platformRevenueOnline += platformFee;
      if (paymentMethod === "PIX") {
        metrics.platformRevenuePix += platformFee;
      } else {
        metrics.platformRevenueCard += platformFee;
      }
      metrics.producerAmountOnline += producerAmount;

      const netReceived = typeof tx.netReceivedAmount === 'number' ? tx.netReceivedAmount : undefined;
      const providerFee = typeof netReceived === 'number'
        ? Math.max(0, chargedAmount - netReceived)
        : (paymentMethod === "PIX" ? chargedAmount * 0.0050 : chargedAmount * 0.0299);

      if (paymentMethod === "PIX") {
        metrics.pixTransactions++;
        metrics.pixAmount += chargedAmount;
        metrics.pixCost += providerFee;
      } else {
        metrics.cardTransactions++;
        metrics.cardAmount += chargedAmount;
        metrics.cardCost += providerFee;
      }

      const d = new Date(tx.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      metrics.transactionsByDay[key] = (metrics.transactionsByDay[key] || 0) + 1;
      metrics.revenueByDay[key] = (metrics.revenueByDay[key] || 0) + platformFee;
    }

    const [recordedOfflineSales, settledOfflineSales] = await Promise.all([
      ctx.db
        .query("offlineSales")
        .withIndex("by_status_createdAt", (q) =>
          q.eq("status", "recorded").gte("createdAt", startDate).lte("createdAt", endDate),
        )
        .collect(),
      ctx.db
        .query("offlineSales")
        .withIndex("by_status_createdAt", (q) =>
          q.eq("status", "settled").gte("createdAt", startDate).lte("createdAt", endDate),
        )
        .collect(),
    ]);

    const offlineSales = [...recordedOfflineSales, ...settledOfflineSales];
    const offlineTransactions = offlineSales.length;
    const offlineAmount = offlineSales.reduce((s, x) => s + (x.totalAmount || 0), 0);
    const offlinePlatformCommission = offlineSales.reduce((s, x) => s + (x.producerFeeAmount || 0), 0);

    const processingCosts = metrics.pixCost + metrics.cardCost;
    const netProfit = metrics.platformRevenueOnline + offlinePlatformCommission - processingCosts;
    const totalGrossAmount = metrics.onlineAmount + offlineAmount;

    const sortedDays = Object.keys(metrics.transactionsByDay).sort();
    const transactionsByDayArray = sortedDays.map((day) => ({
      date: day,
      count: metrics.transactionsByDay[day],
      revenue: metrics.revenueByDay[day],
    }));

    return {
      ...metrics,
      offlineTransactions,
      offlineAmount,
      offlinePlatformCommission,
      totalGrossAmount,
      netProfit,
      processingCosts,
      transactionsByDay: transactionsByDayArray,
      summary: {
        totalGrossAmount: totalGrossAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        onlineAmount: (metrics.onlineAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        offlineAmount: (offlineAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        platformRevenueOnline: (metrics.platformRevenueOnline).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        offlinePlatformCommission: (offlinePlatformCommission).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        pixCost: (metrics.pixCost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        cardCost: (metrics.cardCost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        processingCosts: (processingCosts).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        netProfit: (netProfit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      },
    };
  },
});

// Listar todos os saques de organizações
export const listAllOrganizationWithdrawals = query({
  args: {
    userId: v.string(),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    )),
    limit: v.optional(v.number()),
    skip: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Construir a query
    let withdrawalsQuery;

    // Aplicar filtro por status se fornecido
    if (args.status) {
      withdrawalsQuery = ctx.db
        .query("organizationWithdrawals")
        .withIndex("by_status", (q) => q.eq("status", args.status!));
    } else {
      withdrawalsQuery = ctx.db.query("organizationWithdrawals");
    }

    // Ordenar por data de solicitação (mais recente primeiro)
    withdrawalsQuery = withdrawalsQuery.order("desc");

    // Aplicar paginação
    const skip = args.skip || 0;
    const limit = args.limit || 50;

    // Buscar os saques
    const withdrawals = await withdrawalsQuery.collect();

    // Aplicar paginação manualmente
    const paginatedWithdrawals = withdrawals.slice(skip, skip + limit);

    // Buscar informações adicionais para cada saque
    const withdrawalsWithDetails = [];

    for (const withdrawal of paginatedWithdrawals) {
      // Buscar informações da organização
      const organization = await ctx.db.get(withdrawal.organizationId);

      // Buscar informações do usuário que solicitou
      const user = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", withdrawal.userId))
        .first();

      withdrawalsWithDetails.push({
        ...withdrawal,
        organizationName: organization?.name || "Organização não encontrada",
        userName: user?.name || "Usuário não encontrado",
        userEmail: user?.email || "",
        formattedAmount: (withdrawal.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        formattedDate: new Date(withdrawal.requestedAt).toLocaleString('pt-BR'),
      });
    }

    return {
      withdrawals: withdrawalsWithDetails,
      total: withdrawals.length,
      hasMore: skip + limit < withdrawals.length,
    };
  },
});

// Processar um saque (aprovar, rejeitar ou cancelar)
export const processWithdrawal = mutation({
  args: {
    adminUserId: v.string(),
    withdrawalId: v.id("organizationWithdrawals"),
    action: v.union(
      v.literal("approve"),
      v.literal("complete"),
      v.literal("reject"),
      v.literal("cancel")
    ),
    receiptStorageId: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.adminUserId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Verificar se o admin tem permissão para processar saques
    if (admin.role !== "superadmin" && admin.role !== "finance" && !admin.permissions.includes("manage_withdrawals")) {
      throw new Error("Sem permissão para processar saques");
    }

    // Buscar o saque
    const withdrawal = await ctx.db.get(args.withdrawalId);
    if (!withdrawal) {
      throw new Error("Saque não encontrado");
    }

    // Verificar se o saque está em um estado que permite a ação solicitada
    if (args.action === "approve") {
      if (withdrawal.status !== "pending") {
        throw new Error("Este saque não está pendente");
      }

      // Atualizar para processando
      await ctx.db.patch(args.withdrawalId, {
        status: "processing",
        processedAt: Date.now(),
      });

    } else if (args.action === "complete") {
      if (withdrawal.status !== "processing") {
        throw new Error("Este saque não está em processamento");
      }

      if (!args.receiptStorageId) {
        throw new Error("É necessário anexar um comprovante");
      }

      // Atualizar para concluído
      await ctx.db.patch(args.withdrawalId, {
        status: "completed",
        processedAt: Date.now(),
        receiptStorageId: args.receiptStorageId,
        notes: args.notes,
      });

    } else if (args.action === "reject" || args.action === "cancel") {
      if (withdrawal.status === "completed") {
        throw new Error("Não é possível rejeitar/cancelar um saque já concluído");
      }

      // Atualizar para rejeitado/cancelado
      await ctx.db.patch(args.withdrawalId, {
        status: args.action === "reject" ? "failed" : "cancelled",
        processedAt: Date.now(),
        failureReason: args.notes || (args.action === "reject" ? "Rejeitado pelo administrador" : "Cancelado pelo administrador"),
      });
    }

    // Registrar atividade
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminUserId,
      action: `withdrawal_${args.action}`,
      targetType: "withdrawal",
      targetId: args.withdrawalId,
      details: {
        withdrawalId: args.withdrawalId,
        organizationId: withdrawal.organizationId,
        amount: withdrawal.amount,
        notes: args.notes,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

// Obter detalhes de um saque específico
export const getWithdrawalDetails = query({
  args: {
    userId: v.string(),
    withdrawalId: v.id("organizationWithdrawals"),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar o saque
    const withdrawal = await ctx.db.get(args.withdrawalId);
    if (!withdrawal) {
      throw new Error("Saque não encontrado");
    }

    // Buscar informações da organização
    const organization = await ctx.db.get(withdrawal.organizationId);

    // Buscar informações do usuário que solicitou
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", withdrawal.userId))
      .first();

    // Buscar logs de atividade relacionados a este saque
    const activityLogs = await ctx.db
      .query("adminActivityLogs")
      .filter((q) =>
        q.and(
          q.eq(q.field("targetType"), "withdrawal"),
          q.eq(q.field("targetId"), args.withdrawalId)
        )
      )
      .order("desc")
      .collect();

    // Buscar informações dos admins que realizaram ações
    const adminIds = new Set(activityLogs.map(log => log.adminId));
    const admins: Record<string, { name: string; email: string }> = {};

    for (const adminId of adminIds) {
      const adminUser = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", adminId))
        .first();

      if (adminUser) {
        admins[adminId] = {
          name: adminUser.name,
          email: adminUser.email,
        };
      }
    }

    // Formatar logs de atividade
    const formattedLogs = activityLogs.map(log => ({
      ...log,
      adminName: admins[log.adminId]?.name || "Admin desconhecido",
      adminEmail: admins[log.adminId]?.email || "",
      formattedDate: new Date(log.timestamp).toLocaleString('pt-BR'),
    }));

    return {
      withdrawal: {
        ...withdrawal,
        formattedAmount: (withdrawal.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        formattedRequestDate: new Date(withdrawal.requestedAt).toLocaleString('pt-BR'),
        formattedProcessDate: withdrawal.processedAt ? new Date(withdrawal.processedAt).toLocaleString('pt-BR') : null,
      },
      organization: organization ? {
        id: organization._id,
        name: organization.name,
        responsibleName: organization.responsibleName,
        responsibleDocument: organization.responsibleDocument,
      } : null,
      requester: user ? {
        id: user.userId,
        name: user.name,
        email: user.email,
        phone: user.phone,
      } : null,
      activityLogs: formattedLogs,
    };
  },
});


// Buscar todos os ingressos da plataforma (função administrativa)
export const listAllTickets = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso negado. Apenas administradores podem acessar esta função.");
    }

    // Buscar todos os ingressos
    const tickets = await ctx.db
      .query("tickets")
      .collect();

    // Enriquecer com informações de evento, tipo de ingresso e usuário
    const ticketsWithDetails = [];
    for (const ticket of tickets) {
      const event = await ctx.db.get(ticket.eventId);
      const ticketType = await ctx.db.get(ticket.ticketTypeId);
      const user = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", ticket.userId))
        .first();

      // Buscar transação associada se existir
      let transaction = null;
      if (ticket.transactionId) {
        transaction = await ctx.db
          .query("transactions")
          .withIndex("by_transactionId", (q) => q.eq("transactionId", ticket.transactionId ?? ''))
          .first();
      }

      // Buscar organização do evento se existir
      let organization = null;
      if (event?.organizationId) {
        organization = await ctx.db.get(event.organizationId);
      }

      ticketsWithDetails.push({
        ...ticket,
        eventName: event?.name,
        eventStartDate: event?.eventStartDate,
        eventEndDate: event?.eventEndDate,
        eventLocation: event?.location,
        ticketTypeName: ticketType?.name,
        ticketTypePrice: ticketType?.currentPrice,
        userName: user?.name,
        userEmail: user?.email,
        userPhone: user?.phone,
        userCpf: user?.cpf,
        transactionStatus: transaction?.status,
        transactionAmount: transaction?.amount,
        organizationName: organization?.name,
        formattedPurchaseDate: new Date(ticket.purchasedAt).toLocaleString('pt-BR'),
        formattedAmount: (ticket.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      });
    }

    return ticketsWithDetails;
  },
});

// Buscar ingressos de um evento específico (função administrativa)
export const getTicketsForEvent = query({
  args: {
    userId: v.string(),
    eventId: v.id("events")
  },
  handler: async (ctx, { userId, eventId }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso negado. Apenas administradores podem acessar esta função.");
    }

    // Buscar ingressos do evento específico usando o índice correto
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Enriquecer com informações de tipo de ingresso e usuário
    const ticketsWithDetails: any[] | PromiseLike<any[]> = [];
    for (const ticket of tickets) {
      const ticketType = await ctx.db.get(ticket.ticketTypeId);
      const user = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", ticket.userId))
        .first();

      // Buscar transação associada se existir
      let transaction = null;
      if (ticket.transactionId) {
        transaction = await ctx.db
          .query("transactions")
          .withIndex("by_transactionId", (q) => q.eq("transactionId", ticket.transactionId ?? ''))
          .first();
      }

      ticketsWithDetails.push({
        ...ticket,
        ticketTypeName: ticketType?.name,
        ticketTypePrice: ticketType?.currentPrice,
        userName: user?.name,
        userEmail: user?.email,
        userPhone: user?.phone,
        userCpf: user?.cpf,
        transactionStatus: transaction?.status,
        transactionAmount: transaction?.amount,
        formattedPurchaseDate: new Date(ticket.purchasedAt).toLocaleString('pt-BR'),
        formattedAmount: (ticket.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      });
    }

    return ticketsWithDetails;
  },
});

// Buscar todos os ingressos da plataforma com filtros (função administrativa)
export const getAllPlatformTickets = query({
  args: {
    userId: v.string(),
    status: v.optional(v.union(
      v.literal("valid"),
      v.literal("used"),
      v.literal("refunded"),
      v.literal("cancelled"),
      v.literal("transfered")
    )),
    eventId: v.optional(v.id("events")),
    limit: v.optional(v.number()),
    skip: v.optional(v.number()),
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, { userId, status, eventId, limit = 100, skip = 0, searchTerm }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso negado. Apenas administradores podem acessar esta função.");
    }

    // Construir query base
    let ticketsQuery;

    // Aplicar filtros usando os índices corretos do schema
    if (eventId) {
      ticketsQuery = ctx.db.query("tickets").withIndex("by_event", (q) => q.eq("eventId", eventId));
    } else {
      ticketsQuery = ctx.db.query("tickets");
    }

    if (status) {
      ticketsQuery = ticketsQuery.filter((q) => q.eq(q.field("status"), status));
    }

    // Buscar todos os tickets base
    const allTickets = await ticketsQuery.collect();

    let filteredTickets = allTickets;

    // Se houver termo de busca, aplicar filtro global usando dados de tickets, eventos e usuários
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();

      // Eventos cujo nome/local/descrição coincidem com o termo
      const events = await ctx.db.query("events").collect();
      const matchingEventIds = new Set(
        events
          .filter((event: any) =>
            (event.name ?? "").toLowerCase().includes(lowerSearchTerm) ||
            (event.location ?? "").toLowerCase().includes(lowerSearchTerm) ||
            (event.description ?? "").toLowerCase().includes(lowerSearchTerm)
          )
          .map((event: any) => event._id)
      );

      // Usuários cujo nome/email coincidem com o termo
      const usersByName = await ctx.db
        .query("users")
        .withSearchIndex("search_users", (q) => q.search("name", lowerSearchTerm))
        .collect();

      const usersByEmailExact = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", searchTerm.toLowerCase()))
        .collect();

      const userIds = new Set<string>();
      for (const u of [...usersByName, ...usersByEmailExact]) {
        if (u.userId) userIds.add(u.userId);
      }

      filteredTickets = allTickets.filter((ticket: any) => {
        const idMatch = String(ticket._id).toLowerCase().includes(lowerSearchTerm);
        const transactionMatch = (ticket.transactionId ?? "").toLowerCase().includes(lowerSearchTerm);
        const ownerEmailMatch = (ticket.ownerEmail ?? "").toLowerCase().includes(lowerSearchTerm);
        const eventMatch = matchingEventIds.has(ticket.eventId);
        const userMatch = ticket.userId ? userIds.has(ticket.userId) : false;

        return idMatch || transactionMatch || ownerEmailMatch || eventMatch || userMatch;
      });
    }

    // Ordenar por data de compra (mais recente primeiro)
    filteredTickets.sort((a, b) => (b.purchasedAt || 0) - (a.purchasedAt || 0));

    const total = filteredTickets.length;
    const paginatedTickets = filteredTickets.slice(skip, skip + limit);
    const hasMore = skip + limit < total;

    // Enriquecer apenas os tickets da página atual
    const eventCache = new Map<string, any>();
    const ticketTypeCache = new Map<string, any>();
    const userCache = new Map<string, any>();
    const validatorUserCache = new Map<string, any>();
    const organizationCache = new Map<string, any>();

    const ticketsWithDetails: any[] = [];
    for (const ticket of paginatedTickets) {
      const eventIdStr = String(ticket.eventId);
      let event = eventCache.get(eventIdStr);
      if (event === undefined) {
        event = await ctx.db.get(ticket.eventId);
        eventCache.set(eventIdStr, event ?? null);
      }

      const ticketTypeIdStr = String(ticket.ticketTypeId);
      let ticketType = ticketTypeCache.get(ticketTypeIdStr);
      if (ticketType === undefined) {
        ticketType = await ctx.db.get(ticket.ticketTypeId);
        ticketTypeCache.set(ticketTypeIdStr, ticketType ?? null);
      }

      const userIdStr = ticket.userId ?? "";
      let user = userIdStr ? userCache.get(userIdStr) : null;
      if (userIdStr && user === undefined) {
        user = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", userIdStr))
          .first();
        userCache.set(userIdStr, user ?? null);
      }

      let validatorUser = null;
      const validatorIdStr = ticket.validatedBy ?? "";
      if (validatorIdStr) {
        validatorUser = validatorUserCache.get(validatorIdStr);
        if (validatorUser === undefined) {
          validatorUser = await ctx.db
            .query("users")
            .withIndex("by_user_id", (q) => q.eq("userId", validatorIdStr))
            .first();
          validatorUserCache.set(validatorIdStr, validatorUser ?? null);
        }
      }

      let organization = null;
      if (event?.organizationId) {
        const orgIdStr = String(event.organizationId);
        organization = organizationCache.get(orgIdStr);
        if (organization === undefined) {
          organization = await ctx.db.get(event.organizationId);
          organizationCache.set(orgIdStr, organization ?? null);
        }
      }

      ticketsWithDetails.push({
        ...ticket,
        eventName: event?.name,
        eventStartDate: event?.eventStartDate,
        eventLocation: event?.location,
        ticketTypeName: ticketType?.name,
        ticketTypePrice: ticketType?.currentPrice,
        userName: user?.name,
        userEmail: user?.email,
        userPhone: user?.phone,
        userCpf: user?.cpf,
        organizationName: organization?.name,
        formattedPurchaseDate: new Date(ticket.purchasedAt).toLocaleString('pt-BR'),
        formattedAmount: ticket.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        formattedValidatedAt: ticket.validatedAt ? new Date(ticket.validatedAt).toLocaleString('pt-BR') : undefined,
        validatorName: validatorUser?.name || undefined,
      });
    }

    return {
      tickets: ticketsWithDetails,
      hasMore,
      total,
    };
  },
});

// Atualizar status de ingresso (função administrativa)
export const updateTicketStatusAdmin = mutation({
  args: {
    userId: v.string(),
    ticketId: v.id("tickets"),
    newStatus: v.union(
      v.literal("valid"),
      v.literal("used"),
      v.literal("refunded"),
      v.literal("cancelled"),
      v.literal("transfered")
    ),
    reason: v.optional(v.string())
  },
  handler: async (ctx, { userId, ticketId, newStatus, reason }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso negado. Apenas administradores podem acessar esta função.");
    }

    // Verificar se o ingresso existe
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      throw new Error("Ingresso não encontrado.");
    }

    const oldStatus = ticket.status;

    // Atualizar o status do ingresso
    await ctx.db.patch(ticketId, {
      status: newStatus,
    });

    // Registrar a ação no log de atividades
    await ctx.db.insert("adminActivityLogs", {
      adminId: userId,
      action: "update_ticket_status",
      targetType: "ticket",
      targetId: ticketId,
      details: {
        oldStatus,
        newStatus,
        reason,
      },
      timestamp: Date.now(),
    });

    return {
      success: true,
      message: `Status do ingresso atualizado para ${newStatus}`,
      ticketId,
      oldStatus,
      newStatus,
      reason
    };
  },
});

// Obter detalhes completos de um ingresso (função administrativa)
export const getTicketDetails = query({
  args: {
    userId: v.string(),
    ticketId: v.id("tickets")
  },
  handler: async (ctx, { userId, ticketId }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso negado. Apenas administradores podem acessar esta função.");
    }

    // Buscar o ingresso
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      throw new Error("Ingresso não encontrado.");
    }

    // Buscar informações relacionadas
    const event = await ctx.db.get(ticket.eventId);
    const ticketType = await ctx.db.get(ticket.ticketTypeId);
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", ticket.userId))
      .first();

    // Buscar transação associada
    let transaction = null;
    if (ticket.transactionId) {
      transaction = await ctx.db
        .query("transactions")
        .withIndex("by_transactionId", (q) => q.eq("transactionId", ticket.transactionId ?? ''))
        .first();
    }

    // Buscar organização do evento
    let organization = null;
    if (event?.organizationId) {
      organization = await ctx.db.get(event.organizationId);
    }

    // Buscar histórico de transferências
    const transferHistory = await ctx.db
      .query("transferHistory")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .collect();

    return {
      ticket: {
        ...ticket,
        formattedPurchaseDate: new Date(ticket.purchasedAt).toLocaleString('pt-BR'),
        formattedAmount: (ticket.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        formattedUnitPrice: (ticket.unitPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      },
      event: event ? {
        ...event,
        formattedStartDate: new Date(event.eventStartDate).toLocaleString('pt-BR'),
        formattedEndDate: new Date(event.eventEndDate).toLocaleString('pt-BR'),
      } : null,
      ticketType: ticketType ? {
        ...ticketType,
        formattedPrice: (ticketType.currentPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      } : null,
      user: user ? {
        userId: user.userId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        cpf: user.cpf,
        profileComplete: user.profileComplete,
      } : null,
      transaction: transaction ? {
        ...transaction,
        formattedAmount: (transaction.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        formattedCreatedAt: new Date(transaction.createdAt).toLocaleString('pt-BR'),
      } : null,
      organization: organization ? {
        id: organization._id,
        name: organization.name,
        responsibleName: organization.responsibleName,
        responsibleDocument: organization.responsibleDocument,
      } : null,
      transferHistory: transferHistory.map(transfer => ({
        ...transfer,
        formattedTransferDate: new Date(transfer.transferredAt).toLocaleString('pt-BR'),
      })),
    };
  },
});

// Buscar ingressos por email (função administrativa)
export const getTicketsByEmailAdmin = query({
  args: {
    userId: v.string(),
    email: v.string(),
    eventId: v.optional(v.id("events"))
  },
  handler: async (ctx, { userId, email, eventId }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso negado. Apenas administradores podem acessar esta função.");
    }

    // Buscar usuário pelo email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      return [];
    }

    // Buscar ingressos do usuário
    let ticketsQuery = ctx.db
      .query("tickets")
      .withIndex("by_user", (q) => q.eq("userId", user.userId));

    if (eventId) {
      ticketsQuery = ticketsQuery.filter((q) => q.eq(q.field("eventId"), eventId));
    }

    const tickets = await ticketsQuery.collect();

    // Enriquecer com informações adicionais
    const ticketsWithDetails = [];
    for (const ticket of tickets) {
      const event = await ctx.db.get(ticket.eventId);
      const ticketType = await ctx.db.get(ticket.ticketTypeId);

      ticketsWithDetails.push({
        ...ticket,
        eventName: event?.name,
        eventStartDate: event?.eventStartDate,
        ticketTypeName: ticketType?.name,
        userName: user.name,
        userEmail: user.email,
        formattedPurchaseDate: new Date(ticket.purchasedAt).toLocaleString('pt-BR'),
        formattedAmount: (ticket.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      });
    }

    return ticketsWithDetails;
  },
});

// Buscar ingressos por CPF (função administrativa)
export const getTicketsByCpfAdmin = query({
  args: {
    userId: v.string(),
    cpf: v.string(),
    eventId: v.optional(v.id("events"))
  },
  handler: async (ctx, { userId, cpf, eventId }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso negado. Apenas administradores podem acessar esta função.");
    }

    // Buscar usuários com este CPF
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("cpf"), cpf))
      .collect();

    if (users.length === 0) {
      return [];
    }

    const ticketsWithDetails = [];
    for (const user of users) {
      let ticketsQuery = ctx.db
        .query("tickets")
        .withIndex("by_user", (q) => q.eq("userId", user.userId));

      if (eventId) {
        ticketsQuery = ticketsQuery.filter((q) => q.eq(q.field("eventId"), eventId));
      }

      const userTickets = await ticketsQuery.collect();

      for (const ticket of userTickets) {
        const event = await ctx.db.get(ticket.eventId);
        const ticketType = await ctx.db.get(ticket.ticketTypeId);

        ticketsWithDetails.push({
          ...ticket,
          eventName: event?.name,
          eventStartDate: event?.eventStartDate,
          ticketTypeName: ticketType?.name,
          userName: user.name,
          userEmail: user.email,
          userCpf: user.cpf,
          formattedPurchaseDate: new Date(ticket.purchasedAt).toLocaleString('pt-BR'),
          formattedAmount: (ticket.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        });
      }
    }

    return ticketsWithDetails;
  },
});

export const listAllEventsWithOrganization = query({
  args: {
    userId: v.string(),
    skip: v.optional(v.number()),
    limit: v.optional(v.number()),
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, { userId, skip = 0, limit = 50, searchTerm }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar todos os eventos
    const allEvents = await ctx.db.query("events").collect();

    // Buscar informações das organizações e fazer o join
    const eventsWithOrganization = await Promise.all(
      allEvents.map(async (event) => {
        let organizationName = "Sem organização";

        if (event.organizationId) {
          const organization = await ctx.db.get(event.organizationId);
          if (organization) {
            organizationName = organization.name;
          }
        }

        // Buscar estatísticas do evento
        const tickets = await ctx.db
          .query("tickets")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();

        const ticketsSold = tickets.length;
        const totalRevenue = tickets.reduce((sum, ticket) => sum + ticket.totalAmount, 0);

        // Buscar transações relacionadas ao evento
        const transactions = await ctx.db
          .query("transactions")
          .filter((q) => q.eq(q.field("eventId"), event._id))
          .collect();

        return {
          ...event,
          organizationName,
          ticketsSold,
          totalRevenue,
          transactionCount: transactions.length
        };
      })
    );

    // Filtrar por termo de busca se fornecido
    let filteredEvents = eventsWithOrganization;
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredEvents = eventsWithOrganization.filter(event =>
      (event.name?.toLowerCase().includes(lowerSearchTerm) ||
        event.description?.toLowerCase().includes(lowerSearchTerm) ||
        event.location?.toLowerCase().includes(lowerSearchTerm) ||
        event.organizationName?.toLowerCase().includes(lowerSearchTerm))
      );
    }

    // Aplicar paginação
    const paginatedEvents = filteredEvents.slice(skip, skip + limit);

    return {
      events: paginatedEvents,
      hasMore: skip + limit < filteredEvents.length,
      nextCursor: skip + limit < filteredEvents.length ? (skip + limit).toString() : null,
    };
  },
});

// Mutation para buscar saques completados de uma organização específica
export const getOrganizationCompletedWithdrawals = mutation({
  args: {
    organizationId: v.id("organizations"),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, { organizationId, eventId }) => {

    // Buscar todos os saques completados da organização
    let completedWithdrawals = await ctx.db
      .query("organizationWithdrawals")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    // Filtrar por evento se um evento específico estiver selecionado
    if (eventId) {
      completedWithdrawals = completedWithdrawals.filter(withdrawal => withdrawal.eventId === eventId);
    }

    // Calcular total sacado
    const totalWithdrawn = completedWithdrawals.reduce((sum, withdrawal) => {
      return sum + withdrawal.amount;
    }, 0);

    return {
      withdrawals: completedWithdrawals,
      totalWithdrawn,
      count: completedWithdrawals.length
    };
  },
});



// Função para buscar transações da organização com paginação
export const getOrganizationTransactionsPaginated = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    eventId: v.optional(v.id("events")),
    page: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, userId, eventId, page = 1, limit = 20 }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar eventos da organização
    let events: any[] = [];

    if (eventId) {
      // Se eventId for fornecido, buscar apenas esse evento específico
      const event = await ctx.db.get(eventId);
      if (event && event.organizationId === organizationId) {
        events = [event];
      }
    } else {
      // Caso contrário, buscar todos os eventos da organização
      events = await ctx.db
        .query("events")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .collect();
    }

    const eventIds = events.map(event => event._id);

    // Se não houver eventos, retornar resultado vazio
    if (eventIds.length === 0) {
      return {
        transactions: [],
        totalCount: 0,
        hasMore: false,
        currentPage: page,
        totalPages: 0
      };
    }

    // Buscar todas as transações dos eventos da organização
    const transactionsMap = new Map();

    for (const eventId of eventIds) {
      const event = events.find(e => e._id === eventId);
      const eventTransactions = await ctx.db
        .query("transactions")
        .filter((q) => q.eq(q.field("eventId"), eventId))
        .collect();

      // Adicionar informações do evento e garantir que não haja duplicações
      for (const transaction of eventTransactions) {
        // Filtrar transações gratuitas
        if (transaction.paymentMethod === 'free' || transaction.amount === 0) {
          continue;
        }
        
        // Usar o transactionId como chave para evitar duplicações
        if (!transactionsMap.has(transaction.transactionId)) {
          transactionsMap.set(transaction.transactionId, {
            ...transaction,
            eventName: event?.name,
            eventStartDate: event?.eventStartDate
          });
        }
      }
    }

    // Converter o Map para array e ordenar
    const allTransactions = Array.from(transactionsMap.values())
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Aplicar paginação
    const totalCount = allTransactions.length;
    const totalPages = Math.ceil(totalCount / limit);
    const skip = (page - 1) * limit;
    const paginatedTransactions = allTransactions.slice(skip, skip + limit);

    return {
      transactions: paginatedTransactions,
      totalCount,
      hasMore: page < totalPages,
      currentPage: page,
      totalPages
    };
  },
});

import { paginationOptsValidator } from "convex/server";

// Função para buscar todas as transações da plataforma com paginação
export const getAllTransactionsPaginated = query({
  args: {
    userId: v.string(),
    eventId: v.optional(v.id("events")),
    paginationOpts: v.optional(paginationOptsValidator),
    // Legacy args (kept for temporary compatibility but ignored for logic)
    page: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Use indexes for efficient sorting and filtering
    const transactionsQuery = args.eventId
      ? ctx.db
          .query("transactions")
          .withIndex("by_event_created_at", (q) => q.eq("eventId", args.eventId!))
          .order("desc")
      : ctx.db
          .query("transactions")
          .withIndex("by_created_at")
          .order("desc");

    // Apply filters
    const filteredQuery = transactionsQuery
      .filter((q) => 
        q.and(
          q.neq(q.field("paymentMethod"), "free"),
          q.neq(q.field("amount"), 0)
        )
      );

    if (args.paginationOpts) {
      const results = await filteredQuery.paginate(args.paginationOpts);

      // Fetch event info for the current page
      const transactionsWithEventInfo = await Promise.all(
        results.page.map(async (transaction) => {
          const event = await ctx.db.get(transaction.eventId);
          return {
            ...transaction,
            eventName: event?.name,
            eventStartDate: event?.eventStartDate
          };
        })
      );

      return {
        ...results,
        page: transactionsWithEventInfo,
        // Legacy support fields (will be mocked)
        transactions: transactionsWithEventInfo,
        totalCount: 0, // Not available efficiently
        hasMore: !results.isDone,
        currentPage: 1,
        totalPages: 1
      };
    } else {
      // Legacy manual pagination fallback
      const allTransactions = await filteredQuery.collect();
      
      const page = args.page || 1;
      const limit = args.limit || 20;
      const totalCount = allTransactions.length;
      const totalPages = Math.ceil(totalCount / limit);
      const skip = (page - 1) * limit;
      const paginatedTransactions = allTransactions.slice(skip, skip + limit);

      const transactionsWithEventInfo = await Promise.all(
        paginatedTransactions.map(async (transaction) => {
          const event = await ctx.db.get(transaction.eventId);
          return {
            ...transaction,
            eventName: event?.name,
            eventStartDate: event?.eventStartDate
          };
        })
      );

      return {
        page: transactionsWithEventInfo,
        isDone: page >= totalPages,
        continueCursor: "",
        splitCursor: null,
        // Legacy fields
        transactions: transactionsWithEventInfo,
        totalCount,
        hasMore: page < totalPages,
        currentPage: page,
        totalPages
      };
    }
  },
});


// Função para obter estatísticas de parcelamento de cartão de crédito
export const getCreditCardInstallmentStats = query({
  args: {
    userId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, { userId, startDate, endDate }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar todas as transações de cartão de crédito pagas
    let transactionsQuery = ctx.db
      .query("transactions")
      .withIndex("by_payment_method", (q) => q.eq("paymentMethod", "credit_card"))
      .filter((q) => 
        q.or(
          q.eq(q.field("status"), "paid"),
          q.eq(q.field("status"), "completed")
        )
      );

    const transactions = await transactionsQuery.collect();

    // Filtrar por data se fornecido
    const filteredTransactions = transactions.filter(transaction => {
      const transactionDate = transaction.createdAt;
      if (startDate && transactionDate < startDate) return false;
      if (endDate && transactionDate > endDate) return false;
      return true;
    });

    let aVistaCount = 0;
    let parceladoCount = 0;
    let aVistaRevenue = 0;
    let parceladoRevenue = 0;

    filteredTransactions.forEach(transaction => {
      const metadata = transaction.metadata;
      let installments = 1;

      // Tentar extrair informações de parcelamento dos metadados
      if (metadata) {
        // Verificar se há informação de installments diretamente
        if (metadata.installments) {
          installments = parseInt(metadata.installments) || 1;
        }
        // Verificar se há informação no providerResponse
        else if (metadata.providerResponse?.charges?.[0]?.last_transaction?.installments) {
          installments = metadata.providerResponse.charges[0].last_transaction.installments;
        }
      }

      const amount = transaction.amount || 0;

      if (installments === 1) {
        aVistaCount++;
        aVistaRevenue += amount;
      } else {
        parceladoCount++;
        parceladoRevenue += amount;
      }
    });

    const totalTransactions = aVistaCount + parceladoCount;
    const totalRevenue = aVistaRevenue + parceladoRevenue;

    return {
      aVista: {
        count: aVistaCount,
        revenue: aVistaRevenue,
        percentage: totalTransactions > 0 ? (aVistaCount / totalTransactions * 100) : 0
      },
      parcelado: {
        count: parceladoCount,
        revenue: parceladoRevenue,
        percentage: totalTransactions > 0 ? (parceladoCount / totalTransactions * 100) : 0
      },
      total: {
        transactions: totalTransactions,
        revenue: totalRevenue
      }
    };
  },
});



// Função para obter estatísticas detalhadas de parcelas
export const getInstallmentDistributionStats = query({
  args: {
    userId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, { userId, startDate, endDate }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar todas as transações de cartão de crédito pagas
    let transactionsQuery = ctx.db
      .query("transactions")
      .withIndex("by_payment_method", (q) => q.eq("paymentMethod", "credit_card"))
      .filter((q) => 
        q.or(
          q.eq(q.field("status"), "paid"),
          q.eq(q.field("status"), "completed")
        )
      );

    const transactions = await transactionsQuery.collect();

    // Filtrar por data se fornecido
    const filteredTransactions = transactions.filter(transaction => {
      const transactionDate = transaction.createdAt;
      if (startDate && transactionDate < startDate) return false;
      if (endDate && transactionDate > endDate) return false;
      return true;
    });

    // Contar distribuição de parcelas
    const installmentDistribution: { [key: string]: { count: number; revenue: number } } = {};

    filteredTransactions.forEach(transaction => {
      const metadata = transaction.metadata;
      let installments = 1;

      // Tentar extrair informações de parcelamento dos metadados
      if (metadata) {
        if (metadata.installments) {
          installments = parseInt(metadata.installments) || 1;
        }
        else if (metadata.providerResponse?.charges?.[0]?.last_transaction?.installments) {
          installments = metadata.providerResponse.charges[0].last_transaction.installments;
        }
      }

      const installmentKey = `${installments}x`;
      const amount = transaction.amount || 0;

      if (!installmentDistribution[installmentKey]) {
        installmentDistribution[installmentKey] = { count: 0, revenue: 0 };
      }

      installmentDistribution[installmentKey].count++;
      installmentDistribution[installmentKey].revenue += amount;
    });

    // Converter para array e ordenar por número de parcelas
    const distributionArray = Object.entries(installmentDistribution)
      .map(([installments, data]) => ({
        installments,
        installmentNumber: parseInt(installments.replace('x', '')),
        count: data.count,
        revenue: data.revenue,
        percentage: filteredTransactions.length > 0 ? (data.count / filteredTransactions.length * 100) : 0
      }))
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    const totalTransactions = filteredTransactions.length;
    const totalRevenue = filteredTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

    return {
      distribution: distributionArray,
      total: {
        transactions: totalTransactions,
        revenue: totalRevenue
      }
    };
  },
});



// Mutation para buscar transações de um evento específico
export const getEventTransactionsMutation = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar informações do evento
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Evento não encontrado");
    }

    // Buscar transações do evento
    const eventTransactions = await ctx.db
      .query("transactions")
      .filter((q) => q.eq(q.field("eventId"), args.eventId))
      .collect();

    // Filtrar transações gratuitas e adicionar informações do evento
    const validTransactions = eventTransactions
      .filter(transaction => transaction.paymentMethod !== 'free' && transaction.amount > 0 && transaction.status === 'paid')
      .map(transaction => ({
        ...transaction,
        eventName: event.name,
        eventStartDate: event.eventStartDate
      }));

    // Ordenar por data (mais recente primeiro)
    return validTransactions.sort((a, b) => {
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  },
});

// ==== Admin: Representantes (comissão sobre taxa da plataforma) ====
const isActiveAdmin = async (ctx: any, userId: string) => {
  const admin = await ctx.db
    .query("platformAdmins")
    .withIndex("by_user_id", (q: any) => q.eq("userId", userId))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .first();
  return !!admin;
};

const mapPm = (pm: string) => (pm?.toLowerCase() === "pix" ? "PIX" : "CARD");
const clampRate = (n: number) => Math.max(0, Math.min(1, n));

async function getEventCustomFeeSettings(ctx: any, eventId: string) {
  const s = await ctx.db
    .query("eventFeeSettings")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .first();
  if (!s) return undefined;
  return {
    useCustomFees: !!s.useCustomFees,
    pixFeePercentage: s.pixFeePercentage,
    cardFeePercentage: s.cardFeePercentage,
  };
}

async function getEventPlatformFee(ctx: any, eventId: string) {
  const transactions = await ctx.db
    .query("transactions")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .filter((q: any) => q.eq(q.field("status"), "paid"))
    .collect();
  const settings = await getEventCustomFeeSettings(ctx, eventId);
  let total = 0;
  for (const t of transactions) {
    if ((t.paymentMethod || "").toLowerCase() === "free") continue;
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_transaction", (q: any) => q.eq("transactionId", t.transactionId))
      .collect();
    const discountAmount = tickets.reduce((s: number, k: any) => s + (k.discountAmount || 0), 0);
    total += feeCalculations.calculatePlatformFee(t.amount, discountAmount, mapPm(t.paymentMethod), settings);
  }
  return total;
}

export const adminCreateRepresentative = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    userId: v.string(),
    defaultCommissionRate: v.optional(v.number()),
    adminUserId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await isActiveAdmin(ctx, args.adminUserId))) return { success: false, message: "Acesso não autorizado" };
    const existing = await ctx.db
      .query("representatives")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (existing) return { success: false, message: "Representante já cadastrado", representativeId: existing._id };
    const id = await ctx.db.insert("representatives", {
      name: args.name,
      email: args.email,
      phone: args.phone,
      userId: args.userId,
      defaultCommissionRate: typeof args.defaultCommissionRate === "number" ? clampRate(args.defaultCommissionRate) : undefined,
      isActive: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminUserId,
      action: "create_representative",
      targetType: "representative",
      targetId: String(id),
      details: { name: args.name, userId: args.userId, defaultCommissionRate: args.defaultCommissionRate },
      timestamp: Date.now(),
    });
    return { success: true, message: "Representante criado", representativeId: id };
  },
});

export const adminAssignRepresentativeToEvent = mutation({
  args: {
    eventId: v.id("events"),
    representativeId: v.id("representatives"),
    commissionRate: v.number(),
    adminUserId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await isActiveAdmin(ctx, args.adminUserId))) return { success: false, message: "Acesso não autorizado" };
    const rep = await ctx.db.get(args.representativeId);
    if (!rep || rep.isActive === false) return { success: false, message: "Representante inválido" };
    const existing = await ctx.db
      .query("eventRepresentatives")
      .withIndex("by_event", (q: any) => q.eq("eventId", args.eventId))
      .filter((q: any) => q.eq(q.field("representativeId"), args.representativeId))
      .first();
    const rate = clampRate(args.commissionRate);
    if (existing) {
      await ctx.db.patch(existing._id, { commissionRate: rate, isActive: true });
    } else {
      await ctx.db.insert("eventRepresentatives", {
        eventId: args.eventId,
        representativeId: args.representativeId,
        commissionRate: rate,
        isActive: true,
        assignedAt: Date.now(),
        assignedBy: args.adminUserId,
      });
    }
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminUserId,
      action: "assign_representative_event",
      targetType: "event",
      targetId: String(args.eventId),
      details: { representativeId: args.representativeId, commissionRate: rate },
      timestamp: Date.now(),
    });
    return { success: true, message: "Representante vinculado/atualizado no evento" };
  },
});

export const adminRecordRepresentativePayout = mutation({
  args: {
    eventId: v.id("events"),
    representativeId: v.id("representatives"),
    amount: v.number(),
    adminUserId: v.string(),
    notes: v.optional(v.string()),
    markPaid: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!(await isActiveAdmin(ctx, args.adminUserId))) return { success: false, message: "Acesso não autorizado" };
    if (args.amount <= 0) return { success: false, message: "Valor inválido" };
    const status = args.markPaid ? "paid" : "pending";
    const payoutId = await ctx.db.insert("representativePayouts", {
      eventId: args.eventId,
      representativeId: args.representativeId,
      amount: args.amount,
      status,
      createdAt: Date.now(),
      paidAt: args.markPaid ? Date.now() : undefined,
      recordedBy: args.adminUserId,
      notes: args.notes,
    });
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminUserId,
      action: "record_representative_payout",
      targetType: "representative",
      targetId: String(args.representativeId),
      details: { eventId: args.eventId, amount: args.amount, status },
      timestamp: Date.now(),
    });
    return { success: true, message: "Baixa registrada", payoutId };
  },
});

export const adminGetEventCommissionSummary = query({
  args: { eventId: v.id("events"), adminUserId: v.string() },
  handler: async (ctx, { eventId, adminUserId }) => {
    if (!(await isActiveAdmin(ctx, adminUserId))) return { success: false, message: "Acesso não autorizado" } as any;
    const platformFeeTotal = await getEventPlatformFee(ctx, eventId);
    const links = await ctx.db
      .query("eventRepresentatives")
      .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
      .collect();
    const reps = await Promise.all(links.map((l: any) => ctx.db.get(l.representativeId)));
    const repUsers = await Promise.all(
      reps.map((rep: any) => rep?.userId
        ? ctx.db.query("users").withIndex("by_user_id", (q: any) => q.eq("userId", rep.userId)).first()
        : Promise.resolve(null)
      )
    );
    const payouts = await ctx.db
      .query("representativePayouts")
      .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
      .collect();
    const rows = links.map((l: any, i: number) => {
      const rep = reps[i];
      const user = repUsers[i];
      const commission = platformFeeTotal * l.commissionRate;
      const paid = payouts.filter((p: any) => p.representativeId === l.representativeId && p.status === "paid").reduce((s: number, p: any) => s + p.amount, 0);
      const pending = payouts.filter((p: any) => p.representativeId === l.representativeId && p.status === "pending").reduce((s: number, p: any) => s + p.amount, 0);
      const outstanding = Math.max(0, commission - paid);
      return {
        representativeId: l.representativeId,
        name: (user?.name || ""),
        email: (user?.email|| undefined),
        commissionRate: l.commissionRate,
        isActive: l.isActive !== false,
        commission,
        paid,
        pending,
        outstanding,
      };
    });
    return { success: true, platformFeeTotal, representatives: rows };
  },
});


export const adminUpdateRepresentative = mutation({
  args: {
    representativeId: v.id("representatives"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    defaultCommissionRate: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    adminUserId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await isActiveAdmin(ctx, args.adminUserId))) return { success: false, message: "Acesso não autorizado" };
    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.email !== undefined) updates.email = args.email;
    if (args.phone !== undefined) updates.phone = args.phone;
    if (args.defaultCommissionRate !== undefined) updates.defaultCommissionRate = clampRate(args.defaultCommissionRate);
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    await ctx.db.patch(args.representativeId, updates);
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminUserId,
      action: "update_representative",
      targetType: "representative",
      targetId: String(args.representativeId),
      details: updates,
      timestamp: Date.now(),
    });
    return { success: true, message: "Representante atualizado" };
  },
});

export const adminRemoveRepresentativeFromEvent = mutation({
  args: { eventId: v.id("events"), representativeId: v.id("representatives"), adminUserId: v.string() },
  handler: async (ctx, args) => {
    if (!(await isActiveAdmin(ctx, args.adminUserId))) return { success: false, message: "Acesso não autorizado" };
    const link = await ctx.db
      .query("eventRepresentatives")
      .withIndex("by_event", (q: any) => q.eq("eventId", args.eventId))
      .filter((q: any) => q.eq(q.field("representativeId"), args.representativeId))
      .first();
    if (!link) return { success: false, message: "Vínculo não encontrado" };
    await ctx.db.patch(link._id, { isActive: false });
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminUserId,
      action: "remove_representative_event",
      targetType: "event",
      targetId: String(args.eventId),
      details: { representativeId: args.representativeId },
      timestamp: Date.now(),
    });
    return { success: true, message: "Representante removido do evento" };
  },
});

export const adminUpdateRepresentativePayoutStatus = mutation({
  args: { payoutId: v.id("representativePayouts"), status: v.union(v.literal("pending"), v.literal("paid")), adminUserId: v.string() },
  handler: async (ctx, args) => {
    if (!(await isActiveAdmin(ctx, args.adminUserId))) return { success: false, message: "Acesso não autorizado" };
    await ctx.db.patch(args.payoutId, { status: args.status, paidAt: args.status === "paid" ? Date.now() : undefined });
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminUserId,
      action: "update_representative_payout_status",
      targetType: "payout",
      targetId: String(args.payoutId),
      details: { status: args.status },
      timestamp: Date.now(),
    });
    return { success: true, message: "Status atualizado" };
  },
});

export const adminGetEventRepresentatives = query({
  args: { eventId: v.id("events"), adminUserId: v.string() },
  handler: async (ctx, { eventId, adminUserId }) => {
    if (!(await isActiveAdmin(ctx, adminUserId))) return { success: false, message: "Acesso não autorizado" } as any;
    const links = await ctx.db
      .query("eventRepresentatives")
      .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
      .collect();
    const reps = await Promise.all(links.map((l: any) => ctx.db.get(l.representativeId)));
    return links.map((l: any, i: number) => ({ ...l, representative: reps[i] }));
  },
});

export const adminGetRepresentativePayoutsByEvent = query({
  args: { eventId: v.id("events"), representativeId: v.optional(v.id("representatives")), adminUserId: v.string() },
  handler: async (ctx, { eventId, representativeId, adminUserId }) => {
    if (!(await isActiveAdmin(ctx, adminUserId))) return { success: false, message: "Acesso não autorizado" } as any;
    let q = ctx.db
      .query("representativePayouts")
      .withIndex("by_event", (q: any) => q.eq("eventId", eventId));
    if (representativeId) q = q.filter((qq: any) => qq.eq(qq.field("representativeId"), representativeId));
    const rows = await q.order("desc").collect();
    const totalPaid = rows.filter((r: any) => r.status === "paid").reduce((s: number, r: any) => s + r.amount, 0);
    const totalPending = rows.filter((r: any) => r.status === "pending").reduce((s: number, r: any) => s + r.amount, 0);
    return { success: true, payouts: rows, totals: { totalPaid, totalPending } };
  },
});

// Obter Player IDs do OneSignal de todos os admins
export const getAdminOneSignalPlayerIds = query({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db
      .query("platformAdmins")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const playerIds: string[] = [];

    for (const admin of admins) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_user_id", (q) => q.eq("userId", admin.userId))
        .first();
      
      if (user && user.oneSignalPlayerIds) {
        playerIds.push(...user.oneSignalPlayerIds);
      }
    }

    return [...new Set(playerIds)];
  }
});




// Listar todas as organizações com detalhes do proprietário
export const listAllOrganizations = query({
  args: {
    userId: v.string(),
    searchTerm: v.optional(v.string()),
    skip: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, searchTerm, skip = 0, limit = 10 }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar todas as organizações (mais recentes primeiro)
    const organizations = await ctx.db
      .query("organizations")
      .order("desc")
      .collect();

    // Filtrar por termo de busca se fornecido
    let filteredOrgs = organizations;
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredOrgs = organizations.filter(org =>
        org.name.toLowerCase().includes(lowerSearchTerm) ||
        org.responsibleName?.toLowerCase().includes(lowerSearchTerm)
      );
    }

    // Buscar detalhes do proprietário e status de membro do usuário atual
    // Aplicar paginação manualmente
    const paginatedOrgs = filteredOrgs.slice(skip, skip + limit);

    const orgsWithDetails = await Promise.all(
      paginatedOrgs.map(async (org) => {
        // Buscar proprietário
        const ownerMember = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
          .filter((q) => q.eq(q.field("role"), "owner"))
          .first();

        let ownerUser = null;
        if (ownerMember) {
          ownerUser = await ctx.db
            .query("users")
            .withIndex("by_user_id", (q) => q.eq("userId", ownerMember.userId))
            .first();
        }

        // Verificar se o usuário atual é membro
        const currentUserMember = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization_user", (q) => 
            q.eq("organizationId", org._id).eq("userId", userId)
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .first();

        // Contar membros ativos
        const memberCount = (await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect()).length;

        return {
          ...org,
          ownerName: ownerUser?.name || org.responsibleName || "Desconhecido",
          ownerEmail: ownerUser?.email || "Sem email",
          ownerPhone: ownerUser?.phone || "Sem telefone",
          ownerPhoto: null, // Adicionar se disponível no user
          isMember: !!currentUserMember,
          memberRole: currentUserMember?.role,
          memberCount
        };
      })
    );

   return {
      data: orgsWithDetails,
      total: filteredOrgs.length
    };
  },
});



// Adicionar admin atual a uma organização
export const addSelfToOrganization = mutation({
  args: {
    adminId: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin da plataforma
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.adminId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Verificar se já é membro
    const existingMember = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.adminId)
      )
      .first();

    if (existingMember) {
      if (existingMember.status === "active") {
        return { success: true, message: "Já é membro" };
      } else {
        // Reativar
        await ctx.db.patch(existingMember._id, {
          status: "active",
          role: "admin", // Garantir privilégios de admin
          joinedAt: Date.now()
        });
        return { success: true, message: "Membro reativado" };
      }
    }

    // Buscar dados do usuário
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", args.adminId))
      .first();

    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    // Adicionar como membro admin
    await ctx.db.insert("organizationMembers", {
      organizationId: args.organizationId,
      userId: args.adminId,
      email: user.email,
      role: "admin",
      status: "active",
      invitedBy: args.adminId, // Auto-convite
      invitedAt: Date.now(),
      joinedAt: Date.now(),
    });

    // Registrar atividade
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminId,
      action: "join_organization",
      targetType: "organization",
      targetId: args.organizationId,
      timestamp: Date.now(),
    });

    return { success: true, message: "Adicionado com sucesso" };
  },
});



// Remover membro da organização (admin)
export const removeOrganizationMember = mutation({
  args: {
    adminId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.string(), // ID do usuário a ser removido
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin da plataforma
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.adminId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar o membro
    const member = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!member) {
      throw new Error("Membro não encontrado");
    }

    // Não permitir remover o proprietário (owner) a menos que seja para excluir a organização inteira
    // Mas aqui estamos removendo apenas um membro.
    // Se o admin quiser remover o owner, ele deve mudar o role primeiro ou excluir a org.
    if (member.role === "owner") {
      throw new Error("Não é possível remover o proprietário da organização. Transfira a propriedade primeiro.");
    }

    // Remover o membro (excluir o registro ou marcar como removido?)
    // O schema tem status: "removed", então vamos usar isso ou excluir?
    // O user pediu "remover", geralmente isso significa deletar o acesso.
    // Vamos excluir o registro para limpar, ou usar o status removed se quisermos manter histórico.
    // Dado o pedido de "limpar o banco" na exclusão da org, aqui vou optar por excluir o registro de membro
    // para ser consistente com a "remoção". Mas o schema tem "removed", então talvez seja melhor usar o status.
    // Vamos excluir fisicamente para garantir que ele não apareça mais.
    await ctx.db.delete(member._id);

    // Registrar atividade
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminId,
      action: "remove_organization_member",
      targetType: "organization",
      targetId: args.organizationId,
      details: { removedUserId: args.userId },
      timestamp: Date.now(),
    });

    return { success: true, message: "Membro removido com sucesso" };
  },
});

// Atualizar papel do membro (admin)
export const updateOrganizationMemberRole = mutation({
  args: {
    adminId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.string(),
    newRole: v.union(v.literal("owner"), v.literal("admin"), v.literal("staff")),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin da plataforma
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.adminId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar o membro
    const member = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!member) {
      throw new Error("Membro não encontrado");
    }

    // Atualizar o papel
    await ctx.db.patch(member._id, {
      role: args.newRole,
    });

    // Se o novo papel for "owner", precisamos verificar se já existe outro owner e rebaixá-lo?
    // Normalmente uma org só tem um owner. Se promovermos alguém a owner, o antigo vira admin.
    if (args.newRole === "owner") {
      const currentOwner = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .first();

      if (currentOwner && currentOwner._id !== member._id) {
        await ctx.db.patch(currentOwner._id, {
          role: "admin",
        });
      }
    }

    // Registrar atividade
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminId,
      action: "update_organization_member_role",
      targetType: "organization",
      targetId: args.organizationId,
      details: { userId: args.userId, newRole: args.newRole },
      timestamp: Date.now(),
    });

    return { success: true, message: "Papel atualizado com sucesso" };
  },
});

// Excluir organização e todos os dados relacionados (admin)
export const deleteOrganization = mutation({
  args: {
    adminId: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário é admin da plataforma (apenas superadmin ou admin com permissão específica deveria fazer isso, mas vamos verificar se é admin ativo)
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", args.adminId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar a organização
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) {
      throw new Error("Organização não encontrada");
    }

    // 1. Buscar e excluir todos os eventos da organização
    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    for (const event of events) {
      const eventId = event._id;

      // Excluir dados relacionados ao evento
      
      // Ticket Types
      const ticketTypes = await ctx.db.query("ticketTypes").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const tt of ticketTypes) await ctx.db.delete(tt._id);

      // Ticket Lots
      const ticketLots = await ctx.db.query("ticketLots").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const tl of ticketLots) await ctx.db.delete(tl._id);

      // Promoters
      const promoters = await ctx.db.query("promoters").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const p of promoters) {
        // Promoter Permissions
        const perms = await ctx.db.query("promoterPermissions").withIndex("by_promoter", (q) => q.eq("promoterId", p._id)).collect();
        for (const perm of perms) await ctx.db.delete(perm._id);
        
        // Offline Sales
        const sales = await ctx.db.query("offlineSales").withIndex("by_promoter", (q) => q.eq("promoterId", p._id)).collect();
        for (const s of sales) await ctx.db.delete(s._id);

        // Offline Settlements
        const settlements = await ctx.db.query("offlineSettlements").withIndex("by_promoter", (q) => q.eq("promoterId", p._id)).collect();
        for (const s of settlements) await ctx.db.delete(s._id);

        await ctx.db.delete(p._id);
      }

      // Promoter Teams
      const teams = await ctx.db.query("promoterTeams").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const t of teams) await ctx.db.delete(t._id);

      // Coupons
      const coupons = await ctx.db.query("coupons").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const c of coupons) await ctx.db.delete(c._id);

      // Tickets (inclui histórico financeiro, mas foi solicitado limpar tudo)
      const tickets = await ctx.db.query("tickets").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const t of tickets) {
        // Transfer History
        const transfers = await ctx.db.query("transferHistory").withIndex("by_ticket", (q) => q.eq("ticketId", t._id)).collect();
        for (const tr of transfers) await ctx.db.delete(tr._id);
        
        // Transfer Requests
        const transferReqs = await ctx.db.query("transferRequests").withIndex("by_ticket", (q) => q.eq("ticketId", t._id)).collect();
        for (const tr of transferReqs) await ctx.db.delete(tr._id);

        await ctx.db.delete(t._id);
      }

      // Transactions
      const transactions = await ctx.db.query("transactions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const t of transactions) await ctx.db.delete(t._id);

      // Event Days
      const days = await ctx.db.query("eventDays").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const d of days) await ctx.db.delete(d._id);

      // Event Lists
      const lists = await ctx.db.query("eventLists").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const l of lists) {
        // List Subscriptions
        const subs = await ctx.db.query("listSubscriptions").withIndex("by_list", (q) => q.eq("listId", l._id)).collect();
        for (const s of subs) await ctx.db.delete(s._id);
        
        // List Validators
        const vals = await ctx.db.query("listValidators").withIndex("by_list", (q) => q.eq("listId", l._id)).collect();
        for (const v of vals) await ctx.db.delete(v._id);

        await ctx.db.delete(l._id);
      }

      // Event Fee Settings
      const feeSettings = await ctx.db.query("eventFeeSettings").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const f of feeSettings) await ctx.db.delete(f._id);

      // Disputes
      const disputes = await ctx.db.query("disputes").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const d of disputes) await ctx.db.delete(d._id);

      // Event Representatives
      const eventReps = await ctx.db.query("eventRepresentatives").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const er of eventReps) await ctx.db.delete(er._id);

      // Representative Payouts
      const repPayouts = await ctx.db.query("representativePayouts").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const rp of repPayouts) await ctx.db.delete(rp._id);

      // Ticket Validators
      const ticketValidators = await ctx.db.query("ticketValidators").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
      for (const tv of ticketValidators) await ctx.db.delete(tv._id);

      // Imagem do evento (Storage)
      if (event.imageStorageId) {
        try {
          await ctx.storage.delete(event.imageStorageId);
        } catch (error) {
          console.error(`Erro ao deletar imagem do evento ${eventId}:`, error);
        }
      }

      // Excluir o evento
      await ctx.db.delete(eventId);
    }

    // 2. Excluir dados da organização

    // Organization Members
    const members = await ctx.db.query("organizationMembers").withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId)).collect();
    for (const m of members) await ctx.db.delete(m._id);

    // Organization Invites
    const invites = await ctx.db.query("organizationInvites").withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId)).collect();
    for (const i of invites) await ctx.db.delete(i._id);

    // Organization Withdrawals
    const withdrawals = await ctx.db.query("organizationWithdrawals").withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId)).collect();
    for (const w of withdrawals) await ctx.db.delete(w._id);

    // Imagem da organização (Storage)
    if (organization.imageStorageId) {
      try {
        await ctx.storage.delete(organization.imageStorageId);
      } catch (error) {
        console.error(`Erro ao deletar imagem da organização ${args.organizationId}:`, error);
      }
    }

    // 3. Excluir a organização
    await ctx.db.delete(args.organizationId);

    // Registrar atividade
    await ctx.db.insert("adminActivityLogs", {
      adminId: args.adminId,
      action: "delete_organization",
      targetType: "organization",
      targetId: args.organizationId,
      details: { name: organization.name },
      timestamp: Date.now(),
    });

    return { success: true, message: "Organização e todos os dados relacionados foram excluídos" };
  },
});



// Helper para verificar se transação de cartão foi liberada (D+0 - Agora é tudo liberado)
const isCardTransactionReleased = (transaction: any): boolean => {
    // Se está pago ou completado, está liberado imediatamente
    return true;
};

// Query otimizada para buscar eventos paginados com estatísticas calculadas no servidor
export const getEventsPageData = query({
  args: {
    userId: v.string(),
    skip: v.optional(v.number()),
    limit: v.optional(v.number()),
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, { userId, skip = 0, limit = 10, searchTerm }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    // Buscar eventos
    let eventsQuery = ctx.db.query("events");
    let allEvents = await eventsQuery.collect();

    // Filtrar por termo de busca se fornecido
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      allEvents = allEvents.filter(event =>
      (event.name?.toLowerCase().includes(lowerSearchTerm) ||
        event.description?.toLowerCase().includes(lowerSearchTerm) ||
        event.location?.toLowerCase().includes(lowerSearchTerm))
      );
    }

    // Ordenar por data (mais recente primeiro) - Opcional, mas bom para UX
    allEvents.sort((a, b) => b.eventStartDate - a.eventStartDate);

    // Total de eventos após filtro
    const totalEvents = allEvents.length;

    // Aplicar paginação
    const paginatedEvents = allEvents.slice(skip, skip + limit);

    // Enriquecer eventos com estatísticas financeiras
    const eventsWithStats = await Promise.all(
      paginatedEvents.map(async (event) => {
        // Buscar feeSettings
        const feeSettings = await ctx.db
          .query("eventFeeSettings")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .first();
          
        const customFeeSettings = feeSettings ? {
            pixFeePercentage: feeSettings.pixFeePercentage,
            cardFeePercentage: feeSettings.cardFeePercentage,
            useCustomFees: true
        } : null;

        // Buscar transações do evento
        const transactions = await ctx.db
          .query("transactions")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();
          
        // Filtrar transações pagas
        const paidTransactions = transactions.filter(t => 
            (t.status === 'paid' || t.status === 'completed') && 
            t.paymentMethod !== 'free' && 
            t.amount > 0
        );

        // Buscar saques completados (apenas se tiver organizationId)
        let totalWithdrawn = 0;
        if (event.organizationId) {
            const withdrawals = await ctx.db
                .query("organizationWithdrawals")
                .withIndex("by_organization", (q) => q.eq("organizationId", event.organizationId as Id<"organizations">))
                .filter(q => q.eq(q.field("status"), "completed"))
                .collect();
            
            // Filtrar saques específicos deste evento se houver campo eventId
            // Como o schema tem eventId opcional em organizationWithdrawals, usamos isso
            const eventWithdrawals = withdrawals.filter(w => w.eventId === event._id);
            totalWithdrawn = eventWithdrawals.reduce((sum, w) => sum + w.amount, 0);
        }

        // Calcular métricas
        let totalRevenue = 0;
        let totalProducerAmount = 0;
        let totalPlatformFees = 0;
        let pixAvailable = 0;
        let cardInRelease = 0;
        let cardAvailable = 0;
        let pixRevenue = 0;
        let cardRevenue = 0;
        let pixTransactionCount = 0;
        let cardTransactionCount = 0;

        paidTransactions.forEach((transaction) => {
            const totalAmount = transaction.metadata?.baseAmount ? parseFloat(transaction.metadata.baseAmount) : transaction.amount;
            const discountAmount = transaction.metadata?.discountAmount ? parseFloat(transaction.metadata.discountAmount) : 0;
            const paymentMethod = (transaction.paymentMethod === 'pix') ? 'PIX' : 'CARD';
            
            const producerAmount = calculateProducerAmount(
                totalAmount,
                discountAmount,
                paymentMethod,
                customFeeSettings || undefined
            );
            
            const platformFee = totalAmount - producerAmount;
            
            totalRevenue += totalAmount;
            totalProducerAmount += producerAmount;
            totalPlatformFees += platformFee;
            
            if (paymentMethod === 'PIX') {
                pixRevenue += totalAmount;
                pixAvailable += producerAmount;
                pixTransactionCount++;
            } else {
                cardRevenue += totalAmount;
                cardTransactionCount++;
                if (isCardTransactionReleased(transaction)) {
                    cardAvailable += producerAmount;
                } else {
                    cardInRelease += producerAmount;
                }
            }
        });

        // Aplicar desconto dos saques
        const totalAvailableBeforeWithdrawals = pixAvailable + cardAvailable;
        
        if (totalAvailableBeforeWithdrawals > 0 && totalWithdrawn > 0) {
            const pixProportion = pixAvailable / totalAvailableBeforeWithdrawals;
            const cardProportion = cardAvailable / totalAvailableBeforeWithdrawals;
            
            const pixWithdrawalDeduction = Math.min(pixAvailable, totalWithdrawn * pixProportion);
            const cardWithdrawalDeduction = Math.min(cardAvailable, totalWithdrawn * cardProportion);
            
            pixAvailable = Math.max(0, pixAvailable - pixWithdrawalDeduction);
            cardAvailable = Math.max(0, cardAvailable - cardWithdrawalDeduction);
        }

        return {
            ...event,
            revenue: totalRevenue,
            producerAmount: totalProducerAmount,
            platformFees: totalPlatformFees,
            transactionCount: transactions.length,
            paidTransactionCount: paidTransactions.length,
            pixAvailable,
            cardInRelease,
            cardAvailable,
            pixRevenue,
            cardRevenue,
            pixTransactionCount,
            cardTransactionCount,
            totalWithdrawn
        };
      })
    );

    return {
      events: eventsWithStats,
      totalEvents,
      hasMore: skip + limit < totalEvents
    };
  }
});

// Query para estatísticas globais (simplificada para performance)
/**
 * Resumo leve para o dashboard de eventos: só contagens na tabela `events`.
 * A versão antiga agregava todas as transações/saques desde 2015 e estourava timeout.
 */
export const getGlobalEventStats = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    const allEvents = await ctx.db.query("events").collect();
    const now = Date.now();
    const totalEvents = allEvents.length;
    const activeEvents = allEvents.filter((e) => e.eventEndDate > now).length;

    return {
      totalEvents,
      activeEvents,
    };
  },
});




// Export paginado de transações para CSV (leve, sem N+1 em tickets)
export const getTransactionsExportPage = query({
  args: {
    userId: v.string(),
    eventId: v.optional(v.id("events")),
    startDate: v.number(),
    endDate: v.number(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, eventId, startDate, endDate, cursor, limit = 300 }) => {
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
    if (!admin) throw new Error("Acesso não autorizado");

    const baseQuery = eventId
      ? ctx.db
          .query("transactions")
          .withIndex("by_event_created_at", (q) =>
            q.eq("eventId", eventId).gte("createdAt", startDate).lte("createdAt", endDate),
          )
      : ctx.db
          .query("transactions")
          .withIndex("by_created_at", (q) => q.gte("createdAt", startDate).lte("createdAt", endDate));

    const pageResult = await baseQuery
      .order("desc")
      .paginate({ cursor: cursor ?? null, numItems: Math.min(1000, Math.max(50, limit)) });

    const pageItems = pageResult.page.filter((t) => !(t.paymentMethod === "free" || t.amount === 0));

    // Cache de eventos e fee settings apenas da página atual
    const eventIdsToFetch = Array.from(new Set(pageItems.map((t) => t.eventId as unknown as string))) as any[];
    const [events, feeSettings] = await Promise.all([
      Promise.all(eventIdsToFetch.map((id) => ctx.db.get(id))),
      Promise.all(
        eventIdsToFetch.map((id) =>
          ctx.db.query("eventFeeSettings").withIndex("by_event", (q) => q.eq("eventId", id)).first(),
        ),
      ),
    ]);

    const eventsMap = new Map<string, any>();
    for (const ev of events) {
      if (ev) eventsMap.set(ev._id as unknown as string, ev);
    }
    const feeSettingsMap = new Map<string, any>();
    for (const s of feeSettings) {
      if (s) feeSettingsMap.set(s.eventId as unknown as string, s);
    }

    const toPaymentMethod = (pmRaw: string): "PIX" | "CARD" | "OFFLINE" => {
      const x = (pmRaw || "").toString().toLowerCase();
      if (x.includes("offline")) return "OFFLINE";
      if (x.includes("card")) return "CARD";
      return "PIX";
    };

    const statusMap: Record<string, string> = {
      paid: "Pago",
      approved: "Pago",
      authorized: "Autorizado",
      pending: "Pendente",
      failed: "Falhou",
      refunded: "Reembolsado",
      canceled: "Cancelado",
      cancelled: "Cancelado",
      completed: "Pago",
    };

    const rows = pageItems.map((t) => {
      const meta: any = t.metadata || {};
      const exportSummary: any | undefined = meta.exportSummary;
      // Se não existir o exportSummary (ou estiver incompleto), a exportação deve cair
      // para o cálculo legado no frontend (buscando tickets por transactionId).
      const needsLegacy =
        !exportSummary ||
        exportSummary.ticketResumo == null ||
        exportSummary.subtotalIngressos == null ||
        exportSummary.valorPago == null;
      const summary: any = exportSummary || {};
      const ev = eventsMap.get(t.eventId as unknown as string);
      const settings = feeSettingsMap.get(t.eventId as unknown as string);

      const cliente = summary.cliente || meta.name || meta.customerName || "";
      const cpf = summary.cpf || (meta.cpf || meta.customerCpf || "");
      const whatsapp = summary.whatsapp || meta.phone || meta.customerPhone || "";
      const email = summary.email || meta.email || meta.customerEmail || "";

      const installments = Number(summary.installments ?? meta.installments ?? 1) || 1;
      const jurosParcelamento = Number(summary.jurosParcelamento ?? meta.interestAmount ?? 0) || 0;
      const subtotalIngressos = Number(summary.subtotalIngressos ?? meta.baseAmount ?? 0) || 0;
      const desconto = Number(summary.desconto ?? meta.discountAmount ?? 0) || 0;
      const tipo = summary.ticketResumo || "";

      const paymentMethod = toPaymentMethod(t.paymentMethod);
      const formaPagamento =
        paymentMethod === "OFFLINE" ? "Ajuste Offline" : paymentMethod === "PIX" ? "PIX" : "Cartão";

      const totalPago = Number(summary.valorPago ?? meta.chargedAmount ?? t.amount ?? 0) || 0;
      const netReceived =
        typeof t.netReceivedAmount === "number" ? t.netReceivedAmount : (totalPago - jurosParcelamento);

      // Igual ao financeiro: preferimos o feeSnapshot da transação (quando existe)
      // em vez de usar apenas eventFeeSettings do evento.
      const feeSettingsForTx = meta?.feeSnapshot || settings || undefined;

      let valorLiquidoProdutor = 0;
      if (paymentMethod === "OFFLINE") {
        // No financeiro, Ajuste Offline usa o valor direto (sem taxas).
        valorLiquidoProdutor = totalPago;
      } else {
        // Cenário ticket-level absorbFees:
        // quando feeSnapshot indica subtotalAbsorbFees/subtotalNoAbsorb,
        // calculamos o produtor via breakdown (igual ao financeiro).
        const feeSnapshot = meta?.feeSnapshot || undefined;
        const subtotalAbsorbFees = feeSnapshot?.subtotalAbsorbFees;
        const subtotalNoAbsorb = feeSnapshot?.subtotalNoAbsorb;
        const hasTicketBreakdown =
          typeof subtotalAbsorbFees === "number" &&
          typeof subtotalNoAbsorb === "number" &&
          (subtotalAbsorbFees > 0 || subtotalNoAbsorb > 0);

        const shouldAbsorbFees =
          meta?.absorbFees ??
          feeSnapshot?.absorbFees ??
          feeSettingsForTx?.absorbFees;

        if (!shouldAbsorbFees && hasTicketBreakdown) {
          const subtotal = (subtotalAbsorbFees || 0) + (subtotalNoAbsorb || 0);
          const ratio = subtotal > 0 ? Math.max(0, 1 - (desconto || 0) / subtotal) : 1;

          const effectiveAbsorb = (subtotalAbsorbFees || 0) * ratio;
          const effectiveNoAbsorb = (subtotalNoAbsorb || 0) * ratio;

          const rate =
            feeCalculations.getFeePercentage(paymentMethod as any, feeSettingsForTx) / 100;

          valorLiquidoProdutor = effectiveAbsorb - effectiveAbsorb * rate + effectiveNoAbsorb;
        } else {
          valorLiquidoProdutor = feeCalculations.calculateProducerAmount(
            totalPago,
            desconto,
            paymentMethod as any,
            feeSettingsForTx,
          );
        }
      }

      let valorTaxa = totalPago - valorLiquidoProdutor;
      let taxaBanco = Math.max(0, totalPago - (Number(netReceived) || 0));
      if (paymentMethod === "OFFLINE") {
        valorTaxa = Math.abs(totalPago);
        taxaBanco = 0;
      }
      let comissao = Math.max(0, valorTaxa - taxaBanco);
      if (paymentMethod === "OFFLINE") comissao = Math.abs(totalPago);

      const statusKey = (t.status || "").toString().toLowerCase();
      const statusTraduzido = statusMap[statusKey] || (t.status || "");

      // Payload mínimo necessário para recalcular no frontend (modo legado).
      const metadataForFees =
        needsLegacy
          ? {
              feeSnapshot: meta?.feeSnapshot,
              absorbFees: meta?.absorbFees,
              offlineFee: meta?.offlineFee,
              feeRate: meta?.feeRate,
              // Campos que o calculateProducerAmount usa pra estimar juros/interest.
              interestAmount: meta?.interestAmount,
              chargedAmount: meta?.chargedAmount,
              baseAmount: meta?.baseAmount,
            }
          : undefined;

      return {
        eventName: ev?.name || "",
        cliente,
        cpf,
        whatsapp,
        email,
        createdAt: t.createdAt,
        formaPagamento,
        status: statusTraduzido,
        parcelas: installments,
        tipo,
        valorIngressos: subtotalIngressos,
        valorTaxa,
        jurosParcelamento,
        desconto,
        valorPago: totalPago,
        valorLiquido: valorLiquidoProdutor,
        taxaBanco,
        comissao,
        transactionId: t.transactionId || "",

        // Campos extras para fallback legado quando exportSummary não existir
        needsLegacy,
        paymentMethod,
        netReceivedAmountRaw: t.netReceivedAmount,
        feeSettings: needsLegacy ? (settings || null) : undefined,
        metadataForFees,
      };
    });

    return {
      rows,
      hasMore: !pageResult.isDone,
      cursor: pageResult.continueCursor,
    };
  },
});



export const getAllTransactionsCursorPaginated = query({
  args: {
    userId: v.string(),
    eventId: v.optional(v.id("events")),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, { userId, eventId, cursor, limit = 20, startDate, endDate }) => {
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) throw new Error("Acesso não autorizado");

    const effectiveEnd = endDate ?? Date.now();
    const effectiveStart = startDate ?? effectiveEnd - 30 * 24 * 60 * 60 * 1000;

    const baseQuery = eventId
      ? ctx.db
          .query("transactions")
          .withIndex("by_event_created_at", (q) =>
            q.eq("eventId", eventId).gte("createdAt", effectiveStart).lte("createdAt", effectiveEnd),
          )
      : ctx.db
          .query("transactions")
          .withIndex("by_created_at", (q) => q.gte("createdAt", effectiveStart).lte("createdAt", effectiveEnd));

    const pageResult = await baseQuery
      .order("desc")
      .paginate({ cursor: cursor ?? null, numItems: limit });

    const pageItems = pageResult.page.filter((t) => !(t.paymentMethod === "free" || t.amount === 0));

    const eventIdsToFetch = Array.from(
      new Set(pageItems.map((t) => t.eventId as unknown as string)),
    ) as any[];

    const events = await Promise.all(eventIdsToFetch.map((id) => ctx.db.get(id)));
    const eventsMap = new Map<string, any>();
    for (const ev of events) {
      if (ev) eventsMap.set(ev._id as unknown as string, ev);
    }

    const transactionsWithEventInfo = pageItems.map((t) => {
      const ev = eventsMap.get(t.eventId as unknown as string);
      return {
        ...t,
        eventName: ev?.name,
        eventStartDate: ev?.eventStartDate,
      };
    });

    return {
      transactions: transactionsWithEventInfo,
      hasMore: !pageResult.isDone,
      cursor: pageResult.continueCursor,
    };
  },
});


// Nova função para buscar eventos de forma leve e paginada para dropdowns
export const searchEventsForDropdown = query({
  args: {
    userId: v.string(),
    searchTerm: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, searchTerm, limit = 50 }) => {
    // Verificar se o usuário é admin
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    let events;

    if (searchTerm) {
      // Usar o índice de busca se houver termo
      events = await ctx.db
        .query("events")
        .withSearchIndex("search_events", (q) => 
          q.search("name", searchTerm)
        )
        .take(limit);
    } else {
      // Buscar os eventos mais recentes se não houver termo
      // Ordenando por data de criação (padrão do sistema)
      events = await ctx.db
        .query("events")
        .order("desc") 
        .take(limit);
    }

    // Mapear apenas os dados necessários para o dropdown
    return events.map(event => ({
      _id: event._id,
      name: event.name,
      eventStartDate: event.eventStartDate,
      location: event.location,
    }));
  },
});




/** Saldo disponível real (histórico completo): produtores online menos saques e comissão offline proporcional. */
async function computePlatformBalances(
  ctx: { db: any },
  userId: string,
  startDate: number | undefined,
  endDate: number | undefined,
) {
  const allFeeSettings = await ctx.db.query("eventFeeSettings").collect();
  const feeSettingsMap = new Map();
  allFeeSettings.forEach((fs: { eventId: string }) => feeSettingsMap.set(fs.eventId, fs));

  let paidTransactions;
  let completedTransactions;

  if (startDate && endDate) {
    const allTransactionsInRange = await ctx.db
      .query("transactions")
      .withIndex("by_createdAt", (q: any) => q.gte("createdAt", startDate).lte("createdAt", endDate))
      .collect();

    paidTransactions = allTransactionsInRange.filter((t: { status: string }) => t.status === "paid");
    completedTransactions = allTransactionsInRange.filter((t: { status: string }) => t.status === "completed");
  } else {
    paidTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_status", (q: any) => q.eq("status", "paid"))
      .collect();

    completedTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_status", (q: any) => q.eq("status", "completed"))
      .collect();
  }

  const transactions = [...paidTransactions, ...completedTransactions];

  let totalPixAvailable = 0;
  let totalCardAvailable = 0;
  let totalOfflineAmount = 0;
  let totalOfflineCommission = 0;

  for (const tx of transactions) {
    if (tx.amount < 0) continue;
    if (tx.paymentMethod === "OFFLINE_ADJUSTMENT") continue;

    const totalAmount = tx.amount;
    const discountAmount = tx.metadata?.discountAmount || 0;
    const paymentMethod = tx.paymentMethod === "CARD" || tx.paymentMethod === "card" ? "CARD" : "PIX";
    const feeSettings = feeSettingsMap.get(tx.eventId);

    const producerAmount = calculateProducerAmount(
      totalAmount,
      discountAmount,
      paymentMethod,
      feeSettings || undefined,
    );

    if (paymentMethod === "PIX") {
      totalPixAvailable += producerAmount;
    } else {
      totalCardAvailable += producerAmount;
    }
  }

  const offlineSalesQuery = ctx.db.query("offlineSales");
  let offlineSales;
  if (startDate && endDate) {
    offlineSales = await offlineSalesQuery
      .filter((q: any) =>
        q.and(
          q.or(q.eq(q.field("status"), "recorded"), q.eq(q.field("status"), "settled")),
          q.gte(q.field("createdAt"), startDate),
          q.lte(q.field("createdAt"), endDate),
        ),
      )
      .collect();
  } else {
    offlineSales = await offlineSalesQuery
      .filter((q: any) => q.or(q.eq(q.field("status"), "recorded"), q.eq(q.field("status"), "settled")))
      .collect();
  }

  for (const sale of offlineSales) {
    totalOfflineAmount += sale.totalAmount || 0;

    let commission = 0;
    if (sale.producerFeeAmount !== undefined) {
      commission = sale.producerFeeAmount;
    } else {
      const feeSettings = feeSettingsMap.get(sale.eventId);
      const rate = feeSettings?.offlineFee ?? 0.05;
      commission = (sale.totalAmount || 0) * rate;
    }
    totalOfflineCommission += commission;
  }

  let withdrawals;
  if (startDate && endDate) {
    withdrawals = await ctx.db
      .query("organizationWithdrawals")
      .withIndex("by_status", (q: any) => q.eq("status", "completed"))
      .filter((q: any) =>
        q.and(q.gte(q.field("processedAt"), startDate), q.lte(q.field("processedAt"), endDate)),
      )
      .collect();
  } else {
    withdrawals = await ctx.db
      .query("organizationWithdrawals")
      .withIndex("by_status", (q: any) => q.eq("status", "completed"))
      .collect();
  }

  let totalWithdrawn = 0;

  for (const w of withdrawals) {
    if (w.type === "credit") {
      totalWithdrawn -= w.amount;
    } else {
      totalWithdrawn += w.amount;
    }
  }

  const totalAvailableBeforeDeductions = totalPixAvailable + totalCardAvailable;
  const totalDeductions = totalWithdrawn + totalOfflineCommission;

  if (totalDeductions > 0 && totalAvailableBeforeDeductions > 0) {
    const pixProp = totalPixAvailable / totalAvailableBeforeDeductions;
    const cardProp = totalCardAvailable / totalAvailableBeforeDeductions;

    totalPixAvailable = Math.max(0, totalPixAvailable - totalDeductions * pixProp);
    totalCardAvailable = Math.max(0, totalCardAvailable - totalDeductions * cardProp);
  } else if (totalDeductions < 0) {
    totalPixAvailable += Math.abs(totalDeductions);
  }

  return {
    totalPixAvailable,
    totalCardAvailable,
    totalOfflineAmount,
    totalOfflineCommission,
    totalWithdrawn,
  };
}




/** Saldo disponível real da plataforma (não depende do filtro de datas da página). */
export const getPlatformAvailableBalance = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const admin = await ctx.db
      .query("platformAdmins")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!admin) {
      throw new Error("Acesso não autorizado");
    }

    const balances = await computePlatformBalances(ctx, userId, undefined, undefined);
    return {
      totalPixAvailable: balances.totalPixAvailable,
      totalCardAvailable: balances.totalCardAvailable,
    };
  },
});