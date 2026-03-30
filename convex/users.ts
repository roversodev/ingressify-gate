import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const updateUser = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, { userId, name, email }) => {
    // Check if user exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (existingUser) {
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        name,
        email,
      });
      return existingUser._id;
    }

    // Create new user
    const newUserId = await ctx.db.insert("users", {
      userId,
      name,
      email,
    });

    return newUserId;
  },
});

export const getUserById = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    return user;
  },
});

export const checkUserExistsByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    
    return {
      exists: !!user,
      user: user ? { 
        userId: user.userId, 
        name: user.name, 
        email: user.email,
        phone: user.phone || null
      } : null
    };
  },
});

// Query específica para buscar informações completas do usuário por email
export const getUserInfoByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    
    if (!user) {
      return null;
    }
    
    return {
      userId: user.userId,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      cpf: user.cpf || null
    };
  },
});

// Função para atualizar o telefone do usuário
export const updateUserPhone = mutation({
  args: {
    userId: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, { userId, phone }) => {
    // Buscar o usuário existente
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (!existingUser) {
      throw new Error("Usuário não encontrado");
    }

    // Atualizar o telefone
    await ctx.db.patch(existingUser._id, {
      phone: phone,
    });

    return { success: true };
  },
});

// Função para buscar telefone do usuário
export const getUserPhone = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    return user?.phone || null;
  },
});

// Função para atualizar todos os dados do cliente
export const updateCustomerData = mutation({
  args: {
    userId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    cpf: v.optional(v.string()),
  },
  handler: async (ctx, { userId, name, email, phone, cpf }) => {
    // Buscar o usuário existente
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (!existingUser) {
      throw new Error("Usuário não encontrado");
    }

    // Preparar dados para atualização
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (cpf !== undefined) updateData.cpf = cpf;

    // Atualizar apenas os campos fornecidos
    await ctx.db.patch(existingUser._id, updateData);

    return { success: true, updatedFields: Object.keys(updateData) };
  },
});

// Função para atualizar o CPF do usuário
export const updateUserCpf = mutation({
  args: {
    userId: v.string(),
    cpf: v.string(),
  },
  handler: async (ctx, { userId, cpf }) => {
    // Buscar o usuário existente
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (!existingUser) {
      throw new Error("Usuário não encontrado");
    }

    // Atualizar o CPF
    await ctx.db.patch(existingUser._id, {
      cpf: cpf,
    });

    return { success: true };
  },
});

// Verificar se o perfil do usuário está completo
export const checkProfileComplete = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (!user) {
      return { complete: false, user: null };
    }

    // Verificar se todos os campos necessários estão preenchidos
    const isComplete = !!(
      user.phone &&
      user.cpf &&
      user.birthDate &&
      user.gender
    );

    return {
      complete: isComplete,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        cpf: user.cpf || "",
        birthDate: user.birthDate || "",
        gender: user.gender || "",
        profileComplete: user.profileComplete || false
      }
    };
  },
});

// Atualizar o perfil completo do usuário
export const updateUserProfile = mutation({
  args: {
    userId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    cpf: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    gender: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, ...updateData } = args;
    
    // Buscar o usuário existente
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (!existingUser) {
      throw new Error("Usuário não encontrado");
    }

    // Verificar se todos os campos necessários estão preenchidos
    const updatedUser = { ...existingUser, ...updateData };
    const isComplete = !!(
      updatedUser.phone &&
      updatedUser.cpf &&
      updatedUser.birthDate &&
      updatedUser.gender
    );

    // Atualizar o usuário com os novos dados e o status de perfil completo
    await ctx.db.patch(existingUser._id, {
      ...updateData,
      profileComplete: isComplete,
    });

    return { success: true, profileComplete: isComplete };
  },
});

// Função para validar CPF
export const validateCpf = query({
  args: { cpf: v.string() },
  handler: async (ctx, { cpf }) => {
    // Remove caracteres não numéricos
    const cleanCpf = cpf.replace(/\D/g, "");
    
    // Verifica se tem 11 dígitos
    if (cleanCpf.length !== 11) {
      return { valid: false, message: "CPF deve conter 11 dígitos" };
    }
    
    // Verifica se todos os dígitos são iguais (caso inválido comum)
    if (/^(\d)\1{10}$/.test(cleanCpf)) {
      return { valid: false, message: "CPF inválido" };
    }
    
    // Algoritmo de validação do CPF
    let sum = 0;
    let remainder;
    
    // Primeiro dígito verificador
    for (let i = 1; i <= 9; i++) {
      sum += parseInt(cleanCpf.substring(i - 1, i)) * (11 - i);
    }
    
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCpf.substring(9, 10))) {
      return { valid: false, message: "CPF inválido" };
    }
    
    // Segundo dígito verificador
    sum = 0;
    for (let i = 1; i <= 10; i++) {
      sum += parseInt(cleanCpf.substring(i - 1, i)) * (12 - i);
    }
    
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCpf.substring(10, 11))) {
      return { valid: false, message: "CPF inválido" };
    }
    
    return { valid: true, message: "CPF válido" };
  },
});

// Função para verificar se CPF já existe
export const checkCpfExists = query({
  args: { 
    cpf: v.string(),
    userId: v.optional(v.string()) // Opcional para ignorar o próprio usuário na verificação
  },
  handler: async (ctx, { cpf, userId }) => {
    // Remove caracteres não numéricos
    const cleanCpf = cpf.replace(/\D/g, "");
    
    // Busca usuários com este CPF
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("cpf"), cleanCpf))
      .collect();
    
    // Se não encontrou nenhum, o CPF está disponível
    if (users.length === 0) {
      return { exists: false, message: "CPF disponível" };
    }
    
    // Se encontrou apenas 1 e é o próprio usuário, o CPF está disponível
    if (users.length === 1 && userId && users[0].userId === userId) {
      return { exists: false, message: "CPF disponível" };
    }
    
    // Caso contrário, o CPF já está em uso
    return { exists: true, message: "CPF já cadastrado por outro usuário" };
  },
});


export const getUserStats = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // Buscar eventos do usuário
    const events = await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .collect();

    // Buscar convites de validador aceitos pelo usuário
    const acceptedValidatorInvites = await ctx.db
      .query("ticketValidators")
      .filter((q) => 
        q.and(
          q.eq(q.field("userId"), args.userId),
          q.eq(q.field("status"), "accepted")
        )
      )
      .collect();

    // Contar tickets validados (status "used") nos eventos onde o usuário é validador
    let totalValidations = 0;
    
    for (const validatorInvite of acceptedValidatorInvites) {
      const usedTickets = await ctx.db
        .query("tickets")
        .filter((q) => 
          q.and(
            q.eq(q.field("eventId"), validatorInvite.eventId),
            q.eq(q.field("status"), "used")
          )
        )
        .collect();
      
      totalValidations += usedTickets.length;
    }

    // Como não temos dados de falhas de validação, assumimos 100% de precisão
    const accuracy = totalValidations > 0 ? 100 : 100;

    return {
      totalEvents: events.length,
      totalValidations,
      accuracy,
    };
  },
});


export const excludeUser = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // First find the user document to get its _id
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Delete the user using the document _id
    await ctx.db.delete(user._id);
  },
});


export const getUsersInfoByEmails = query({
  args: { emails: v.array(v.string()) },
  handler: async (ctx, { emails }) => {
    const users = await Promise.all(
      emails.map(async (email) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", email))
          .first();
        
        if (!user) {
          return null;
        }
        
        return {
          userId: user.userId,
          name: user.name,
          email: user.email,
          phone: user.phone || null,
          cpf: user.cpf || null
        };
      })
    );
    
    // Filtrar usuários nulos e retornar um mapa email -> userInfo
    const userMap: Record<string, any> = {};
    emails.forEach((email, index) => {
      const user = users[index];
      if (user) {
        userMap[email] = user;
      }
    });
    
    return userMap;
  },
});

export const addOneSignalPlayerId = mutation({
  args: {
    userId: v.string(),
    playerId: v.string(),
  },
  handler: async (ctx, { userId, playerId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    const current = user.oneSignalPlayerIds || [];
    if (!current.includes(playerId)) {
      await ctx.db.patch(user._id, {
        oneSignalPlayerIds: [...current, playerId],
      });
    }

    return { success: true, playerIds: user.oneSignalPlayerIds || [] };
  },
});

export const removeOneSignalPlayerId = mutation({
  args: {
    userId: v.string(),
    playerId: v.string(),
  },
  handler: async (ctx, { userId, playerId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    const current = user.oneSignalPlayerIds || [];
    if (current.includes(playerId)) {
      await ctx.db.patch(user._id, {
        oneSignalPlayerIds: current.filter((id) => id !== playerId),
      });
    }

    return { success: true, playerIds: user.oneSignalPlayerIds || [] };
  },
});

export const getUserOneSignalPlayerIds = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    return user?.oneSignalPlayerIds || [];
  },
});