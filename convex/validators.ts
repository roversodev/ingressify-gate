import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

interface ValidatorWithUser {
  _id: Id<"ticketValidators">;
  _creationTime: number;
  userId?: string;
  acceptedAt?: number;
  eventId: Id<"events">;
  email: string;
  createdAt: number;
  status: "pending" | "accepted" | "rejected";
  expiresAt: number;
  invitedBy: string;
  inviteToken: string;
  user?: { name: string } | null;
}

// Função para gerar um token aleatório (substitui randomBytes do crypto)
function generateRandomToken(length = 32) {
  const characters = 'abcdef0123456789';
  let token = '';
  for (let i = 0; i < length * 2; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    token += characters[randomIndex];
  }
  return token;
}

// Função para convidar um validador
export const inviteValidator = mutation({
  args: {
    eventId: v.id("events"),
    email: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, { eventId, email, userId }) => {
    try {
      // Verificar se o evento existe
      const event = await ctx.db.get(eventId);
      if (!event) {
        return {
          success: false,
          message: "Evento não encontrado"
        };
      }
      
      // Verificar permissão: o usuário é o dono do evento OU é membro da organização
      let hasPermission = event.userId === userId;
      
      // Se não é o dono e o evento pertence a uma organização, verificar se é membro
      if (!hasPermission && event.organizationId) {
        const membership = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization_user", (q) => 
            q.eq("organizationId", event.organizationId!).eq("userId", userId)
          )
          .filter((q) => 
            q.eq(q.field("status"), "active")
          )
          .first();

        hasPermission = !!membership;
      }

      if (!hasPermission) {
        return {
          success: false,
          message: "Você não tem permissão para convidar validadores para este evento"
        };
      }

      // Verificar se o email já foi convidado para este evento
      const existingInvite = await ctx.db
        .query("ticketValidators")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .filter((q) => q.eq(q.field("email"), email))
        .first();

      if (existingInvite) {
        return {
          success: false,
          message: "Este email já foi convidado para validar ingressos deste evento"
        };
      }

      // Gerar token único para o convite
      const token = generateRandomToken(32);

      // Criar o convite
      const validatorId = await ctx.db.insert("ticketValidators", {
        eventId,
        email,
        invitedBy: userId,
        status: "pending",
        inviteToken: token,
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // Expira em 7 dias
      });

      return { 
        success: true,
        message: "Convite enviado com sucesso!",
        data: { validatorId, token }
      };
    } catch (error) {
      console.error("Erro ao convidar validador:", error);
      return {
        success: false,
        message: "Erro interno do servidor. Tente novamente."
      };
    }
  },
});

// Função para aceitar um convite
export const acceptInvitation = mutation({
  args: {
    token: v.string(),
    userId: v.string(),
    userEmail: v.string(),
  },
  handler: async (ctx, { token, userId, userEmail }) => {
    // Verificar se o usuário está autenticado

    // Buscar o convite pelo token
    const invitation = await ctx.db
      .query("ticketValidators")
      .withIndex("by_token", (q) => q.eq("inviteToken", token))
      .first();

    if (!invitation) {
      throw new Error("Convite não encontrado");
    }

    if (invitation.status !== "pending") {
      throw new Error("Este convite já foi utilizado ou rejeitado");
    }

    if (invitation.expiresAt < Date.now()) {
      throw new Error("Este convite expirou");
    }

    // Verificar se o email do usuário logado corresponde ao email convidado
    if (userEmail !== invitation.email) {
      throw new Error("Este convite foi enviado para outro email");
    }

    // Atualizar o convite
    await ctx.db.patch(invitation._id, {
      userId,
      status: "accepted",
      acceptedAt: Date.now(),
    });

    // Buscar informações do evento
    const event = await ctx.db.get(invitation.eventId);

    return { success: true, event };
  },
});

// Função para listar validadores de um evento
export const getEventValidators = query({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
  },
  handler: async (ctx, { eventId, userId }) => {

    // Verificar se o evento existe
    const event = await ctx.db.get(eventId);
    if (!event) {
      throw new Error("Evento não encontrado");
    }

    // Verificar permissão: o usuário é o dono do evento OU é membro da organização
    let hasPermission = event.userId === userId;
    
    // Se não é o dono e o evento pertence a uma organização, verificar se é membro
    if (!hasPermission && event.organizationId) {
      const membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization_user", (q) => 
          q.eq("organizationId", event.organizationId!).eq("userId", userId)
        )
        .filter((q) => 
          q.eq(q.field("status"), "active")
        )
        .first();

      hasPermission = !!membership;
    }

    if (!hasPermission) {
      throw new Error("Você não tem permissão para ver os validadores deste evento");
    }

    // Buscar todos os validadores do evento
    const validators = await ctx.db
      .query("ticketValidators")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    // Buscar informações dos usuários que aceitaram o convite
    const validatorsWithDetails: ValidatorWithUser[] = await Promise.all(
      validators.map(async (validator) => {
        if (validator.userId) {
          const user = await ctx.db
            .query("users")
            .withIndex("by_user_id", (q) => q.eq("userId", validator.userId!))
            .first();

          return {
            ...validator,
            user: user ? { name: user.name } : null,
          };
        }
        return validator as ValidatorWithUser;
      })
    );

    return validatorsWithDetails;
  },
});

// Função para remover um validador
export const removeValidator = mutation({
  args: {
    validatorId: v.id("ticketValidators"),
    userId: v.string(),
  },
  handler: async (ctx, { validatorId, userId }) => {
    try {
      // Buscar o validador
      const validator = await ctx.db.get(validatorId);
      if (!validator) {
        return {
          success: false,
          message: "Validador não encontrado"
        };
      }

      // Verificar se o evento existe
      const event = await ctx.db.get(validator.eventId);
      if (!event) {
        return {
          success: false,
          message: "Evento não encontrado"
        };
      }
      
      // Verificar permissão: o usuário é o dono do evento OU é membro da organização
      let hasPermission = event.userId === userId;
      
      // Se não é o dono e o evento pertence a uma organização, verificar se é membro
      if (!hasPermission && event.organizationId) {
        const membership = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization_user", (q) => 
            q.eq("organizationId", event.organizationId!).eq("userId", userId)
          )
          .filter((q) => 
            q.eq(q.field("status"), "active")
          )
          .first();

        hasPermission = !!membership;
      }

      if (!hasPermission) {
        return {
          success: false,
          message: "Você não tem permissão para remover validadores deste evento"
        };
      }

      // Remover o validador
      await ctx.db.delete(validatorId);

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

// Função para verificar se um usuário pode validar ingressos de um evento
export const canValidateTickets = query({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
  },
  handler: async (ctx, { eventId, userId }) => {

    // Verificar se o evento existe
    const event = await ctx.db.get(eventId);
    if (!event) {
      return { canValidate: false, reason: "Evento não encontrado" };
    }

    // Buscar membership ativo da organização (se houver) para enriquecer a resposta
    let membership: any = null;
    if (event.organizationId) {
      membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization_user", (q) =>
          q.eq("organizationId", event.organizationId!).eq("userId", userId)
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
    }
    const isMember = !!membership;
    const role = membership?.role;

    // Se o usuário é o dono do evento, ele pode validar
    if (event.userId === userId) {
      return { canValidate: true, isOwner: true, isMember, role };
    }

    // Verificar se o usuário é um validador aceito
    const validator = await ctx.db
      .query("ticketValidators")
      .withIndex("by_event_user", (q) => q.eq("eventId", eventId).eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .first();

    if (validator) {
      return { canValidate: true, isOwner: false, isMember, role };
    }

    // Membro ativo da organização também pode validar
    if (isMember) {
      return { canValidate: true, isOwner: false, isMember: true, role };
    }

    return { canValidate: false, reason: "Sem permissão para validar ingressos", isOwner: false, isMember: false };
  },
});

// Função para obter eventos que o usuário pode validar como convidado
export const getEventsUserCanValidate = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {

    // Buscar todos os convites aceitos para este usuário
    const validatorInvitations = await ctx.db
      .query("ticketValidators")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    // Buscar detalhes dos eventos
    const eventsWithDetails = await Promise.all(
      validatorInvitations.map(async (invitation) => {
        const event = await ctx.db.get(invitation.eventId);
        if (!event) return null;

        return {
          ...event,
          validatorId: invitation._id,
          invitedAt: invitation.createdAt,
          acceptedAt: invitation.acceptedAt,
        };
      })
    );

    // Filtrar eventos nulos (caso algum evento tenha sido excluído)
    return eventsWithDetails.filter(Boolean);
  },
});



// Buscar convites de validador por email (útil para usuários não logados)
export const getValidatorInvitationsByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, { email }) => {
    // Buscar todos os convites para este email
    const validatorInvitations = await ctx.db
      .query("ticketValidators")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();

    // Buscar detalhes dos eventos e informações do usuário que convidou
    const invitationsWithDetails = await Promise.all(
      validatorInvitations.map(async (invitation) => {
        const event = await ctx.db.get(invitation.eventId);
        if (!event) return null;

        // Buscar informações do usuário que fez o convite
        const inviterUser = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", invitation.invitedBy))
          .first();

        return {
          _id: invitation._id,
          eventId: invitation.eventId,
          email: invitation.email,
          status: invitation.status,
          createdAt: invitation.createdAt,
          acceptedAt: invitation.acceptedAt,
          expiresAt: invitation.expiresAt,
          inviteToken: invitation.inviteToken,
          event: {
            _id: event._id,
            name: event.name,
          },
          invitedBy: {
            userId: invitation.invitedBy,
            name: inviterUser?.name || "Usuário desconhecido",
            email: inviterUser?.email,
          },
        };
      })
    );

    // Filtrar convites nulos (caso algum evento tenha sido excluído)
    const validInvitations = invitationsWithDetails.filter(Boolean);

    // Ordenar por data de criação (mais recentes primeiro)
    return validInvitations.sort((a, b) => (b?.createdAt ?? 0) - (a?.createdAt ?? 0));
  },
});



export const updateValidatorPermissions = mutation({
  args: {
    validatorId: v.id("ticketValidators"),
    eventId: v.id("events"),
    userId: v.string(),
    dayIds: v.optional(v.array(v.id("eventDays"))),
    lotIds: v.optional(v.array(v.id("ticketLots"))),
    ticketTypeIds: v.optional(v.array(v.id("ticketTypes"))),
  },
  handler: async (ctx, args) => {
    const validator = await ctx.db.get(args.validatorId);
    if (!validator) {
      return { success: false, message: "Validador não encontrado" };
    }

    if (validator.eventId !== args.eventId) {
      return { success: false, message: "Validador não pertence a este evento" };
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      return { success: false, message: "Evento não encontrado" };
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
      return { success: false, message: "Você não tem permissão para atualizar este validador" };
    }

    const update: any = {};

    // Dia: se vier array vazio ou undefined, limpamos o campo (sem restrição por dia)
    if (args.dayIds && args.dayIds.length > 0) {
      update.allowedDayIds = args.dayIds;
    } else {
      update.allowedDayIds = undefined;
    }

    // Lote: mesmo comportamento
    if (args.lotIds && args.lotIds.length > 0) {
      update.allowedLotIds = args.lotIds;
    } else {
      update.allowedLotIds = undefined;
    }

    // Tipo de ingresso: idem
    if (args.ticketTypeIds && args.ticketTypeIds.length > 0) {
      update.allowedTicketTypeIds = args.ticketTypeIds;
    } else {
      update.allowedTicketTypeIds = undefined;
    }

    await ctx.db.patch(args.validatorId, update);

    return { success: true, message: "Permissões atualizadas com sucesso" };
  },
});