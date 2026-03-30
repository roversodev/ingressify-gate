import { mutation, query } from "./\_generated/server";
import { v } from "convex/values";

// Obter listas de um evento
export const getEventLists = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const eventLists = await ctx.db
      .query("eventLists")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    // Adicionar contagem de inscrições para cada lista
    const listsWithSubscriptionsCount = await Promise.all(
      eventLists.map(async (list) => {
        const subscriptionsCount = await ctx.db
          .query("listSubscriptions")
          .withIndex("by_list", (q) => q.eq("listId", list._id))
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect()
          .then(subscriptions => subscriptions.length);

        return {
          ...list,
          subscriptionsCount
        };
      })
    );

    return listsWithSubscriptionsCount;
  },
});

// Obter uma lista pelo URL público
export const getEventListByPublicUrl = query({
  args: { publicUrl: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("eventLists")
      .withIndex("by_public_url", (q) => q.eq("publicUrl", args.publicUrl))
      .first();
  },
});

// Verificar se um usuário está inscrito em uma lista
export const getUserSubscription = query({
  args: { listId: v.id("eventLists"), userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("listSubscriptions")
      .withIndex("by_user_list", (q) => 
        q.eq("userId", args.userId).eq("listId", args.listId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
  },
});

// Criar uma nova lista
export const createEventList = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    publicUrl: v.string(),
    maxSubscriptions: v.optional(v.number()),
    userId: v.string(),
    listType: v.string(), // "public" ou "private"
    validationUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verificar se o URL já existe
    const existingList = await ctx.db
      .query("eventLists")
      .withIndex("by_public_url", (q) => q.eq("publicUrl", args.publicUrl))
      .first();
    
    if (existingList) {
      throw new Error("Esta URL já está em uso. Por favor, escolha outra.");
    }
    
    return await ctx.db.insert("eventLists", {
      eventId: args.eventId,
      name: args.name,
      description: args.description,
      isActive: args.isActive,
      createdAt: Date.now(),
      createdBy: args.userId,
      publicUrl: args.publicUrl,
      maxSubscriptions: args.maxSubscriptions,
      currentSubscriptions: 0,
      listType: args.listType || "public",
      validationUrl: args.validationUrl,
    });
  },
});

// Atualizar uma lista existente
export const updateEventList = mutation({
  args: {
    listId: v.id("eventLists"),
    name: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    publicUrl: v.string(),
    maxSubscriptions: v.optional(v.number()),
    listType: v.string(),
    validationUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.listId);
    if (!list) {
      throw new Error("Lista não encontrada");
    }
    
    // Verificar se o URL já existe (exceto para a própria lista)
    if (list.publicUrl !== args.publicUrl) {
      const existingList = await ctx.db
        .query("eventLists")
        .withIndex("by_public_url", (q) => q.eq("publicUrl", args.publicUrl))
        .first();
      
      if (existingList) {
        throw new Error("Esta URL já está em uso. Por favor, escolha outra.");
      }
    }
    
    return await ctx.db.patch(args.listId, {
      name: args.name,
      description: args.description,
      isActive: args.isActive,
      publicUrl: args.publicUrl,
      maxSubscriptions: args.maxSubscriptions,
      listType: args.listType,
      validationUrl: args.validationUrl,
    });
  },
});

// Gerar URL de validação única
export const generateValidationUrl = mutation({
  args: {},
  handler: async (ctx) => {
    // Gerar string aleatória para URL de validação
    const randomString = Math.random().toString(36).substring(2, 15) + 
                         Math.random().toString(36).substring(2, 15);
    
    return { validationUrl: `validate-${randomString}` };
  },
});

// Adicionar pessoa à lista (para listas privadas)
export const addPersonToList = mutation({
  args: {
    listId: v.id("eventLists"),
    adminId: v.string(), // ID do admin que está adicionando
    personName: v.string(),
    personEmail: v.optional(v.string()),
    personPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.listId);
    if (!list) {
      throw new Error("Lista não encontrada");
    }
    
    if (!list.isActive) {
      throw new Error("Esta lista não está ativa.");
    }
    
    // Verificar se já atingiu o limite de inscrições
    if (list.maxSubscriptions && list.currentSubscriptions >= list.maxSubscriptions) {
      throw new Error("Esta lista já atingiu o limite máximo de inscrições.");
    }
    
    // Criar um ID de usuário temporário baseado no nome e email/telefone
    const tempUserId = `temp-${args.personName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
    
    // Criar a inscrição
    await ctx.db.insert("listSubscriptions", {
      listId: args.listId,
      userId: tempUserId,
      eventId: list.eventId,
      subscribedAt: Date.now(),
      status: "active",
      addedBy: args.adminId,
      checkedIn: false,
    });
    
    // Atualizar o contador de inscrições
    await ctx.db.patch(args.listId, {
      currentSubscriptions: list.currentSubscriptions + 1,
    });
    
    return { success: true };
  },
});

// Adicionar validador para a lista (sem convite)
export const inviteValidator = mutation({
  args: {
    listId: v.id("eventLists"),
    inviterId: v.string(),
    validatorEmail: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const list = await ctx.db.get(args.listId);
      if (!list) {
        return {
          success: false,
          message: "Lista não encontrada"
        };
      }
      
      if (!list.validationUrl) {
        return {
          success: false,
          message: "Esta lista não tem validação habilitada."
        };
      }
      
      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(args.validatorEmail)) {
        return {
          success: false,
          message: "O formato do email é inválido."
        };
      }
      
      // Verificar se o validador já foi adicionado
      const existingValidator = await ctx.db
        .query("listValidators")
        .withIndex("by_email", (q) => q.eq("email", args.validatorEmail))
        .filter((q) => q.eq(q.field("listId"), args.listId))
        .first();
      
      if (existingValidator) {
        return {
          success: false,
          message: "Este validador já foi adicionado para esta lista."
        };
      }
      
      // Adicionar o validador diretamente
      await ctx.db.insert("listValidators", {
        listId: args.listId,
        userId: "", // Será preenchido quando o validador acessar a página
        email: args.validatorEmail,
        invitedBy: args.inviterId,
        invitedAt: Date.now(),
        status: "accepted", // Já está aceito, sem necessidade de convite
      });
      
      return { 
        success: true,
        message: "Validador adicionado com sucesso!"
      };
    } catch (error) {
      console.error("Erro ao adicionar validador:", error);
      return {
        success: false,
        message: "Erro interno do servidor. Tente novamente."
      };
    }
  },
});

// Realizar check-in de um participante
export const checkInParticipant = mutation({
  args: {
    listId: v.id("eventLists"),
    participantId: v.string(),
    validatorId: v.string(),
  },
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.listId);
    if (!list) {
      throw new Error("Lista não encontrada");
    }
    
    // Verificar se o validador tem permissão
    const validator = await ctx.db
      .query("listValidators")
      .withIndex("by_user", (q) => q.eq("userId", args.validatorId))
      .filter((q) => 
        q.eq(q.field("listId"), args.listId) && 
        q.eq(q.field("status"), "accepted")
      )
      .first();
    
    if (!validator && args.validatorId !== list.createdBy) {
      throw new Error("Você não tem permissão para validar esta lista.");
    }
    
    // Buscar a inscrição
    const subscription = await ctx.db
      .query("listSubscriptions")
      .withIndex("by_user_list", (q) => 
        q.eq("userId", args.participantId).eq("listId", args.listId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    
    if (!subscription) {
      throw new Error("Participante não encontrado na lista.");
    }
    
    if (subscription.checkedIn) {
      throw new Error("Este participante já realizou check-in.");
    }
    
    // Atualizar o status de check-in
    await ctx.db.patch(subscription._id, {
      checkedIn: true,
      checkedInAt: Date.now(),
      checkedInBy: args.validatorId,
    });
    
    return { success: true };
  },
});

// Obter lista pelo URL de validação
export const getEventListByValidationUrl = query({
  args: { validationUrl: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("eventLists")
      .withIndex("by_validation_url", (q) => q.eq("validationUrl", args.validationUrl))
      .first();
  },
});

// Verificar se um usuário tem permissão para validar uma lista
export const checkValidatorPermission = query({
  args: { 
    validationUrl: v.string(),
    userId: v.string() 
  },
  handler: async (ctx, args) => {
    // Obter a lista pelo URL de validação
    const list = await ctx.db
      .query("eventLists")
      .withIndex("by_validation_url", (q) => q.eq("validationUrl", args.validationUrl))
      .first();
    
    if (!list) {
      return { hasPermission: false, message: "Lista não encontrada" };
    }
    
    // Verificar se o usuário é o criador da lista
    if (list.createdBy === args.userId) {
      return { hasPermission: true, list };
    }
    
    // Verificar se o usuário é um validador da lista
    const validator = await ctx.db
      .query("listValidators")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => 
        q.eq(q.field("listId"), list._id)
      )
      .first();
    
    if (validator) {
      return { hasPermission: true, list };
    }
    
    return { 
      hasPermission: false, 
      message: "Você não tem permissão para acessar esta página de validação" 
    };
  },
});

// Excluir uma lista
export const deleteEventList = mutation({
  args: { listId: v.id("eventLists") },
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.listId);
    if (!list) {
      throw new Error("Lista não encontrada");
    }
    
    // Excluir todas as inscrições relacionadas
    const subscriptions = await ctx.db
      .query("listSubscriptions")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .collect();
    
    for (const subscription of subscriptions) {
      await ctx.db.delete(subscription._id);
    }
    
    // Excluir a lista
    await ctx.db.delete(args.listId);
    
    return { success: true };
  },
});

// Inscrever um usuário em uma lista
export const subscribeToList = mutation({
  args: {
    listId: v.id("eventLists"),
    userId: v.string(),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.listId);
    if (!list) {
      throw new Error("Lista não encontrada");
    }
    
    if (!list.isActive) {
      throw new Error("Esta lista não está aceitando inscrições no momento.");
    }
    
    // Verificar se já atingiu o limite de inscrições
    if (list.maxSubscriptions && list.currentSubscriptions >= list.maxSubscriptions) {
      throw new Error("Esta lista já atingiu o limite máximo de inscrições.");
    }
    
    // Verificar se o usuário já está inscrito
    const existingSubscription = await ctx.db
      .query("listSubscriptions")
      .withIndex("by_user_list", (q) => 
        q.eq("userId", args.userId).eq("listId", args.listId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    
    if (existingSubscription) {
      throw new Error("Você já está inscrito nesta lista.");
    }
    
    // Criar a inscrição
    await ctx.db.insert("listSubscriptions", {
      listId: args.listId,
      userId: args.userId,
      eventId: args.eventId,
      subscribedAt: Date.now(),
      status: "active",
      checkedIn: false,
    });
    
    // Atualizar o contador de inscrições
    await ctx.db.patch(args.listId, {
      currentSubscriptions: list.currentSubscriptions + 1,
    });
    
    return { success: true };
  },
});

// Obter todas as inscrições de uma lista
export const getListSubscriptions = query({
  args: { listId: v.id("eventLists") },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("listSubscriptions")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    
    // Buscar informações do usuário para cada inscrição
    const subscriptionsWithUserInfo = await Promise.all(
      subscriptions.map(async (subscription) => {
        // Verificar se é um usuário temporário (adicionado manualmente)
        if (subscription.userId.startsWith('temp-')) {
          // Para usuários temporários, extrair o nome do userId
          const nameFromId = subscription.userId.replace('temp-', '').split('-')[0].replace(/-/g, ' ');
          return {
            ...subscription,
            userName: nameFromId || subscription.userId
          };
        }
        
        // Buscar informações do usuário real
        const user = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", subscription.userId))
          .first();
        
        return {
          ...subscription,
          userName: user?.name || subscription.userId
        };
      })
    );
    
    return subscriptionsWithUserInfo;
  },
});

// Obter uma lista pelo ID
export const getEventListById = query({
  args: { listId: v.id("eventLists") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.listId);
  },
});

// Obter validadores de uma lista
export const getListValidators = query({
  args: { listId: v.id("eventLists") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("listValidators")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .collect();
  },
});

// Remover um validador
export const removeValidator = mutation({
  args: {
    validatorId: v.id("listValidators"),
    adminId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const validator = await ctx.db.get(args.validatorId);
      if (!validator) {
        return {
          success: false,
          message: "Validador não encontrado"
        };
      }
      
      // Verificar se o admin tem permissão (é o criador da lista)
      const list = await ctx.db.get(validator.listId);
      if (!list) {
        return {
          success: false,
          message: "Lista não encontrada"
        };
      }
      
      if (list.createdBy !== args.adminId) {
        return {
          success: false,
          message: "Você não tem permissão para remover este validador"
        };
      }
      
      // Remover o validador
      await ctx.db.delete(args.validatorId);
      
      return { 
        success: true,
        message: "Validador removido com sucesso!"
      };
    } catch (error) {
      console.error("Erro ao remover validador:", error);
      return {
        success: false,
        message: "Erro interno do servidor. Tente novamente."
      };
    }
  },
});

// Atualizar o userId do validador quando ele acessar a página
export const updateValidatorUserId = mutation({
  args: {
    validationUrl: v.string(),
    email: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Obter a lista pelo URL de validação
    const list = await ctx.db
      .query("eventLists")
      .withIndex("by_validation_url", (q) => q.eq("validationUrl", args.validationUrl))
      .first();
    
    if (!list) {
      throw new Error("Lista não encontrada");
    }
    
    // Buscar o validador pelo email
    const validator = await ctx.db
      .query("listValidators")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("listId"), list._id))
      .first();
    
    if (!validator) {
      return { success: false, message: "Validador não encontrado" };
    }
    
    // Atualizar o userId do validador
    await ctx.db.patch(validator._id, {
      userId: args.userId,
    });
    
    return { success: true };
  },
});