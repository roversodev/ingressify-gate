import { GenericId, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { feeCalculations } from "../lib/fees";
const { onlinePaidProducerAmountFromTransaction } = feeCalculations;

/**
 * Impacto no saldo disponível: débitos (saque) somam; créditos só após concluído reduzem (estorno na plataforma).
 * `type` omitido = débito (compatível com registros antigos).
 */
export function netWithdrawalAmountForBalance(w: {
  amount: number;
  type?: "credit" | "debit";
  status: string;
}): number {
  const isCredit = w.type === "credit";
  if (isCredit) {
    if (w.status === "completed") return -w.amount;
    return 0;
  }
  if (w.status === "completed" || w.status === "processing" || w.status === "pending") {
    return w.amount;
  }
  return 0;
}
// Criar uma nova organização
export const createOrganization = mutation({
  args: {
    name: v.string(),
    userId: v.string(),
    description: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    responsibleName: v.string(),
    responsibleDocument: v.optional(v.string()),
    // Novos args (opcionais)
    recipientId: v.optional(v.string()),
    recipientType: v.optional(v.union(v.literal("PF"), v.literal("PJ"))),
    recipientCode: v.optional(v.string()),
    pixKeys: v.optional(v.array(v.object({
      keyType: v.union(
        v.literal("cpf"), 
        v.literal("cnpj"), 
        v.literal("email"), 
        v.literal("phone"), 
        v.literal("random")
      ),
      key: v.string(),
      description: v.optional(v.string()),
      isDefault: v.boolean(),
    }))),
  },
  handler: async (ctx, args) => {


    // Criar a organização
    const organizationId = await ctx.db.insert("organizations", {
      name: args.name,
      description: args.description,
      imageStorageId: args.imageStorageId,
      createdAt: Date.now(),
      createdBy: args.userId,
      responsibleName: args.responsibleName,
      responsibleDocument: args.responsibleDocument ?? "",
      ...(args.recipientId ? { recipientId: args.recipientId } : {}),
      ...(args.recipientType ? { recipientType: args.recipientType } : {}),
      ...(args.recipientCode ? { recipientCode: args.recipientCode } : {}),
      pixKeys: args.pixKeys || [],
    });

    // Adicionar o criador como membro proprietário
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .first();

    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    await ctx.db.insert("organizationMembers", {
      organizationId,
      userId: args.userId,
      email: user.email,
      role: "owner",
      status: "active",
      invitedBy: args.userId,
      invitedAt: Date.now(),
      joinedAt: Date.now(),
    });

    return organizationId;
  },
});

// Obter organizações do usuário
export const getUserOrganizations = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {

    // Buscar membros da organização para este usuário
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Buscar detalhes de cada organização
    const organizations = await Promise.all(
      memberships.map(async (membership) => {
        const org = await ctx.db.get(membership.organizationId);
        return {
          ...org,
          role: membership.role,
        };
      })
    );

    return organizations;
  },
});

// Convidar membro para organização
export const inviteMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("staff")),
    userId: v.string()
  },
  handler: async (ctx, args) => {
    

    // Verificar se o usuário tem permissão (owner ou admin)
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => 
        q.eq(q.field("status"), "active")
      )
      .first();

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Sem permissão para convidar membros");
    }

    // Gerar token único
    const inviteToken = Math.random().toString(36).substring(2, 15) + 
                       Math.random().toString(36).substring(2, 15);

    // Criar convite
    const inviteId = await ctx.db.insert("organizationInvites", {
      organizationId: args.organizationId,
      email: args.email,
      role: args.role,
      invitedBy: args.userId,
      status: "pending",
      inviteToken,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 dias
    });

    return { inviteId, inviteToken };
  },
});

// Aceitar convite
export const acceptInvite = mutation({
  args: {
    inviteToken: v.string(),
    userId: v.string()
  },
  handler: async (ctx, args) => {
    // Buscar o convite
    const invite = await ctx.db
      .query("organizationInvites")
      .withIndex("by_token", (q) => q.eq("inviteToken", args.inviteToken))
      .first();

    if (!invite) {
      return {
        success: false,
        errorType: "INVITE_NOT_FOUND",
        message: "Convite não encontrado"
      };
    }

    // Buscar a organização para retornar informações
    const organization = await ctx.db.get(invite.organizationId);
    if (!organization) {
      return {
        success: false,
        errorType: "ORGANIZATION_NOT_FOUND",
        message: "Organização não encontrada"
      };
    }

    // Verificar se já foi aceito
    if (invite.status === "accepted") {
      return {
        success: false,
        errorType: "ALREADY_ACCEPTED",
        message: "Este convite já foi aceito",
        organizationId: invite.organizationId,
        organizationName: organization.name
      };
    }

    // Verificar se foi rejeitado
    if (invite.status === "rejected") {
      return {
        success: false,
        errorType: "INVITE_REJECTED",
        message: "Este convite foi rejeitado"
      };
    }

    // Verificar se expirou
    if (invite.status === "expired" || invite.expiresAt < Date.now()) {
      if (invite.status !== "expired") {
        await ctx.db.patch(invite._id, { status: "expired" });
      }
      return {
        success: false,
        errorType: "INVITE_EXPIRED",
        message: "Este convite expirou"
      };
    }

    // Verificar se ainda está pendente
    if (invite.status !== "pending") {
      return {
        success: false,
        errorType: "INVITE_UNAVAILABLE",
        message: "Este convite não está mais disponível"
      };
    }

    // Verificar se o email do usuário corresponde ao do convite
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .first();

    if (!user) {
      return {
        success: false,
        errorType: "USER_NOT_FOUND",
        message: "Usuário não encontrado"
      };
    }

    if (user.email !== invite.email) {
      return {
        success: false,
        errorType: "EMAIL_MISMATCH",
        message: "Este convite não foi enviado para o seu email"
      };
    }

    // Verificar se já é membro
    const existingMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", invite.organizationId).eq("userId", args.userId)
      )
      .first();

    if (existingMembership) {
      // Atualizar papel se necessário
      if (existingMembership.status !== "active" || existingMembership.role !== invite.role) {
        await ctx.db.patch(existingMembership._id, {
          role: invite.role,
          status: "active",
          joinedAt: Date.now(),
        });
      }
    } else {
      // Criar novo membro
      await ctx.db.insert("organizationMembers", {
        organizationId: invite.organizationId,
        userId: args.userId,
        email: user.email,
        role: invite.role,
        status: "active",
        invitedBy: invite.invitedBy,
        invitedAt: invite.createdAt,
        joinedAt: Date.now(),
      });
    }

    // Atualizar status do convite
    await ctx.db.patch(invite._id, {
      status: "accepted",
      acceptedAt: Date.now(),
    });

    return { 
      success: true,
      organizationId: invite.organizationId,
      organizationName: organization.name,
      role: invite.role
    };
  },
});



// Verificar status do convite
export const checkInviteStatus = query({
  args: {
    inviteToken: v.string(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("organizationInvites")
      .withIndex("by_token", (q) => q.eq("inviteToken", args.inviteToken))
      .first();

    if (!invite) {
      return {
        exists: false,
        status: null,
        message: "Convite não encontrado"
      };
    }

    // Buscar informações da organização
    const organization = await ctx.db.get(invite.organizationId);

    // Verificar se expirou (apenas verificação, sem modificar)
    const isExpired = invite.expiresAt < Date.now();

    return {
      exists: true,
      status: isExpired ? "expired" : invite.status,
      email: invite.email,
      role: invite.role,
      organizationId: invite.organizationId,
      organizationName: organization?.name || "Organização não encontrada",
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt
    };
  },
});

// Verificar se o usuário pertence a alguma organização
export const checkUserHasOrganization = query({
  args: {
    userId: v.string()
  },
  handler: async (ctx, args) => {

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    return { hasOrganization: !!membership };
  },
});

// Obter membros de uma organização
export const getOrganizationMembers = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const membersWithUserInfo = await Promise.all(
      members.map(async (member) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_user_id", (q) => q.eq("userId", member.userId))
          .first();

        return {
          ...member,
          userName: user?.name || null,
          userImage: null,
          userPhone: user?.phone || null,
        };
      })
    );

    return membersWithUserInfo;
  },
});

// Obter convites pendentes de uma organização
export const getOrganizationPendingInvites = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const invites = await ctx.db
      .query("organizationInvites")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    return invites;
  },
});

// Remover membro da organização
export const removeMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberId: v.id("organizationMembers"),
    userId: v.string() // ID do usuário que está executando a ação
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão (owner ou admin)
    const userMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => 
        q.eq(q.field("status"), "active")
      )
      .first();

    if (!userMembership) {
      throw new Error("Usuário não encontrado na organização");
    }

    // Verificar se tem permissão
    if (userMembership.role !== "owner" && userMembership.role !== "admin") {
      throw new Error("Sem permissão para remover membros");
    }

    // Buscar o membro a ser removido
    const memberToRemove = await ctx.db.get(args.memberId);
    if (!memberToRemove) {
      throw new Error("Membro não encontrado");
    }

    // Não permitir remover o proprietário
    if (memberToRemove.role === "owner") {
      throw new Error("Não é possível remover o proprietário da organização");
    }

    // Admins só podem remover staff
    if (userMembership.role === "admin" && memberToRemove.role === "admin") {
      throw new Error("Administradores não podem remover outros administradores");
    }

    // Delete any pending invites for this member
    const pendingInvites = await ctx.db
      .query("organizationInvites")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => 
        q.and(
          q.eq(q.field("status"), "accepted"),
          q.eq(q.field("email"), memberToRemove.email)
        )
      )
      .collect();

    // Delete all found invites
    await Promise.all(
      pendingInvites.map(invite => ctx.db.delete(invite._id))
    );

    // Delete the member
    await ctx.db.delete(args.memberId);

    return { success: true };
  },
});

// Alterar papel de um membro
export const updateMemberRole = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberId: v.id("organizationMembers"),
    newRole: v.union(v.literal("admin"), v.literal("staff")),
    userId: v.string() // ID do usuário que está executando a ação
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão (owner ou admin)
    const userMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => 
        q.eq(q.field("status"), "active")
      )
      .first();

    if (!userMembership) {
      throw new Error("Usuário não encontrado na organização");
    }

    // Apenas owner pode promover a admin
    if (args.newRole === "admin" && userMembership.role !== "owner") {
      throw new Error("Apenas o proprietário pode promover membros a administradores");
    }

    // Buscar o membro a ser atualizado
    const memberToUpdate = await ctx.db.get(args.memberId);
    if (!memberToUpdate) {
      throw new Error("Membro não encontrado");
    }

    // Não permitir alterar o papel do proprietário
    if (memberToUpdate.role === "owner") {
      throw new Error("Não é possível alterar o papel do proprietário");
    }

    // Admins só podem gerenciar staff
    if (userMembership.role === "admin" && memberToUpdate.role === "admin") {
      throw new Error("Administradores não podem alterar o papel de outros administradores");
    }

    // Atualizar o papel
    await ctx.db.patch(args.memberId, {
      role: args.newRole
    });

    return { success: true };
  },
});

// Cancelar convite pendente
export const cancelInvite = mutation({
  args: {
    inviteId: v.id("organizationInvites"),
    userId: v.string() // ID do usuário que está executando a ação
  },
  handler: async (ctx, args) => {
    // Buscar o convite
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new Error("Convite não encontrado");
    }

    // Verificar se o usuário tem permissão
    const userMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", invite.organizationId).eq("userId", args.userId)
      )
      .filter((q) => 
        q.eq(q.field("status"), "active")
      )
      .first();

    if (!userMembership || (userMembership.role !== "owner" && userMembership.role !== "admin")) {
      throw new Error("Sem permissão para cancelar convites");
    }

    // Atualizar status do convite
    await ctx.db.patch(args.inviteId, {
      status: "rejected"
    });

    return { success: true };
  },
});


// Obter transações da organização
export const getOrganizationTransactions = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão para acessar a organização
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

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
    const transactions: { _id: GenericId<"transactions">; _creationTime: number; userId: string; eventId: GenericId<"events">; createdAt: number; status: string; transactionId: string; customerId: string; amount: number; paymentMethod: string; metadata: any; }[] = [];
    
    for (const eventId of eventIds) {
      const eventTransactions = await ctx.db
        .query("transactions")
        .filter((q) => q.eq(q.field("eventId"), eventId))
        .collect();
      
      transactions.push(...eventTransactions);
    }

    // Ordenar por data (mais recente primeiro)
    return transactions.sort((a, b) => {
      // Assumindo que há um campo createdAt, caso contrário, precisamos adicionar
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  },
});

// Obter estatísticas financeiras da organização
export const getOrganizationFinancialStats = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão para acessar a organização
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    // Buscar eventos da organização
    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const stats = {
      totalEvents: events.length,
      activeEvents: events.filter(e => !e.is_cancelled).length,
      chargebackCount: 0,
      totalEarnings: 0,
      totalEarningsWithDiscount: 0,
      totalTicketsSold: 0,
      monthlyEarnings: {} as Record<string, number>,
      paymentMethodStats: {
        card: {
          count: 0,
          amount: 0,
          pendingAmount: 0,
          availableAmount: 0,
        },
        pix: {
          count: 0,
          amount: 0,
          availableAmount: 0,
        },
      },
    };

    // Calcular ganhos por evento e por método de pagamento
    for (const event of events) {
      // Buscar transações pagas do evento usando índice
      const transactions = await ctx.db
        .query("transactions")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .filter((q) => q.eq(q.field("status"), "paid"))
        .collect();

      // Se não há transações pagas, evite buscar eventFeeSettings
      if (transactions.length > 0) {
        const eventFeeSettings = await ctx.db
          .query("eventFeeSettings")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .first();

        for (const transaction of transactions) {
          const pm = transaction.paymentMethod || "";
          if (pm === "OFFLINE_ADJUSTMENT" || pm === "OFFLINE_ADJUSTMENT_REFUND") {
            continue;
          }

          // Bruto cobrado ao comprador (checkout online)
          stats.totalEarnings += transaction.amount;

          const paymentMethod =
            transaction.paymentMethod === "credit_card" || transaction.paymentMethod === "CARD"
              ? "CARD"
              : "PIX";

          const sellerAmount = onlinePaidProducerAmountFromTransaction(
            transaction,
            eventFeeSettings || undefined,
          );

          stats.totalEarningsWithDiscount += sellerAmount;

          if (paymentMethod === "CARD") {
            stats.paymentMethodStats.card.count++;
            stats.paymentMethodStats.card.amount += sellerAmount;
            const releaseDate = transaction.createdAt + (15 * 24 * 60 * 60 * 1000);
            if (Date.now() >= releaseDate) {
              stats.paymentMethodStats.card.availableAmount += sellerAmount;
            } else {
              stats.paymentMethodStats.card.pendingAmount += sellerAmount;
            }
          } else {
            stats.paymentMethodStats.pix.count++;
            stats.paymentMethodStats.pix.amount += sellerAmount;
            stats.paymentMethodStats.pix.availableAmount += sellerAmount;
          }

          const date = new Date(transaction.createdAt);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          stats.monthlyEarnings[monthKey] = (stats.monthlyEarnings[monthKey] || 0) + sellerAmount;
        }
      }

      // Contar ingressos vendidos com filtro e índice
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

      for (const ticket of tickets) {
        stats.totalTicketsSold += ticket.quantity;
      }
    }

    return stats;
  },
});

// Obter organização por ID
export const getOrganizationById = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    return organization;
  },
});

// Atualizar organização
export const updateOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    responsibleName: v.string(),
    responsibleDocument: v.string(),
    pixKeys: v.optional(v.array(v.object({
      keyType: v.union(
        v.literal("cpf"), 
        v.literal("cnpj"), 
        v.literal("email"), 
        v.literal("phone"), 
        v.literal("random")
      ),
      key: v.string(),
      description: v.optional(v.string()),
      isDefault: v.boolean(),
    }))),
    // Novos args (opcionais)
    recipientId: v.optional(v.string()),
    recipientType: v.optional(v.union(v.literal("PF"), v.literal("PJ"))),
    recipientCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // Verificar se o usuário tem permissão (owner ou admin)
      const membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization_user", (q) => 
          q.eq("organizationId", args.organizationId).eq("userId", args.userId)
        )
        .filter((q) => 
          q.eq(q.field("status"), "active")
        )
        .first();

      if (!membership) {
        return {
          success: false,
          errorType: 'NOT_MEMBER',
          message: 'Você não é membro desta organização'
        };
      }
      
      if (membership.role !== "owner" && membership.role !== "admin") {
        return {
          success: false,
          errorType: 'PERMISSION_DENIED',
          message: 'Apenas proprietários e administradores podem editar a organização'
        };
      }

      // Atualizar a organização
      await ctx.db.patch(args.organizationId, {
        name: args.name,
        description: args.description,
        imageStorageId: args.imageStorageId,
        responsibleName: args.responsibleName,
        ...(args.responsibleDocument !== undefined
          ? { responsibleDocument: args.responsibleDocument }
          : {}),
        // Atualiza se vier preenchido
        ...(args.recipientId !== undefined
          ? { recipientId: args.recipientId }
          : {}),
        ...(args.recipientType !== undefined
          ? { recipientType: args.recipientType }
          : {}),
        ...(args.recipientCode !== undefined
          ? { recipientCode: args.recipientCode }
          : {}),
        pixKeys: args.pixKeys || [],
      });
      
      return {
        success: true
      };
    } catch (error) {
      // Log do erro real no servidor
      console.error('Erro interno na atualização da organização:', error);
      
      return {
        success: false,
        errorType: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor'
      };
    }
  },
});

// Solicitar saque para organização
export const requestWithdrawal = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    amount: v.number(),
    pixKeyIndex: v.number(),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    try {
      // Verificar se o usuário tem permissão (owner ou admin)
      const membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization_user", (q) => 
          q.eq("organizationId", args.organizationId).eq("userId", args.userId)
        )
        .filter((q) => 
          q.eq(q.field("status"), "active")
        )
        .first();

      if (!membership) {
        return {
          success: false,
          errorType: "NOT_MEMBER",
          message: "Você não é membro desta organização"
        };
      }
      
      if (membership.role !== "owner" && membership.role !== "admin") {
        return {
          success: false,
          errorType: "INSUFFICIENT_PERMISSION",
          message: "Apenas proprietários e administradores podem solicitar saques"
        };
      }

      // Buscar a organização
      const organization = await ctx.db.get(args.organizationId);
      if (!organization) {
        return {
          success: false,
          errorType: "NOT_FOUND",
          message: "Organização não encontrada"
        };
      }

      // Verificar se a organização tem chaves PIX cadastradas
      if (!organization.pixKeys || organization.pixKeys.length === 0) {
        return {
          success: false,
          errorType: "NO_PIX_KEYS",
          message: "A organização não possui chaves PIX cadastradas"
        };
      }

      // Verificar se o índice da chave PIX é válido
      if (args.pixKeyIndex < 0 || args.pixKeyIndex >= organization.pixKeys.length) {
        return {
          success: false,
          errorType: "INVALID_PIX_KEY",
          message: "Chave PIX inválida"
        };
      }

      const selectedPixKey = organization.pixKeys[args.pixKeyIndex];

      // Buscar eventos relevantes
      let eventsToProcess = [];
      if (args.eventId) {
        const event = await ctx.db.get(args.eventId);
        if (!event || event.organizationId !== args.organizationId) {
          return {
            success: false,
            errorType: "INVALID_EVENT",
            message: "Evento inválido ou não pertence à organização"
          };
        }
        eventsToProcess = [event];
      } else {
        eventsToProcess = await ctx.db
          .query("events")
          .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
          .collect();
      }

      // Calcular saldo disponível (receita líquida)
      let totalAvailable = 0;

      for (const event of eventsToProcess) {
        // Buscar configurações de taxas do evento
        const feeSettings = await ctx.db
          .query("eventFeeSettings")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .first();

        // Buscar transações pagas do evento
        const transactions = await ctx.db
          .query("transactions")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .filter((q) => q.eq(q.field("status"), "paid"))
          .collect();

        for (const tx of transactions) {
          const pm = tx.paymentMethod || "";
          if (pm === "OFFLINE_ADJUSTMENT" || pm === "OFFLINE_ADJUSTMENT_REFUND") {
            continue;
          }

          const sellerAmount = onlinePaidProducerAmountFromTransaction(
            tx,
            feeSettings || undefined,
          );

          // D+0: Disponível imediatamente (conforme dashboard)
          totalAvailable += sellerAmount;
        }
      }

      // Buscar saques anteriores
      let withdrawalsQuery = ctx.db
        .query("organizationWithdrawals")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId));
      
      // Se um evento foi especificado, filtrar saques desse evento
      if (args.eventId) {
        withdrawalsQuery = withdrawalsQuery.filter(q => q.eq(q.field("eventId"), args.eventId));
      }

      const previousWithdrawals = await withdrawalsQuery.collect();

      const totalWithdrawn = previousWithdrawals.reduce(
        (sum, w) => sum + netWithdrawalAmountForBalance(w),
        0
      );

      // Calcular saldo final disponível
      const finalAvailableBalance = totalAvailable - totalWithdrawn;
      
      // Permitir uma margem de erro pequena para arredondamentos
      if (args.amount > finalAvailableBalance + 0.01) {
        return {
          success: false,
          errorType: "INSUFFICIENT_BALANCE",
          message: "Saldo insuficiente para este saque"
        };
      }

      // Criar solicitação de saque
      const withdrawalId = await ctx.db.insert("organizationWithdrawals", {
        organizationId: args.organizationId,
        userId: args.userId,
        amount: args.amount,
        status: "pending",
        type: "debit",
        pixKey: {
          keyType: selectedPixKey.keyType,
          key: selectedPixKey.key,
          description: selectedPixKey.description,
        },
        requestedAt: Date.now(),
        eventId: args.eventId, // Adicionando o eventId ao registro de saque
      });

      return { success: true, withdrawalId };
    } catch (error) {
      // Log do erro real no servidor
      console.error('Erro interno na solicitação de saque:', error);
      
      return {
        success: false,
        errorType: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor'
      };
    }
  },
});

// Buscar histórico de saques da organização
export const getOrganizationWithdrawals = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    eventId: v.optional(v.id("events")), // Adicionar filtro por evento
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão para acessar a organização
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    let withdrawalsQuery = ctx.db
      .query("organizationWithdrawals")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId));

    // Aplicar filtro por evento se fornecido
    if (args.eventId) {
      withdrawalsQuery = withdrawalsQuery.filter((q) => q.eq(q.field("eventId"), args.eventId));
    }

    const withdrawals = await withdrawalsQuery
      .order("desc")
      .collect();

    return withdrawals;
  },
});

/** Idade em anos a partir de birthDate (YYYY-MM-DD ou ISO). */
function ageFromBirthDate(birthDateStr: string): number {
  const birthDate = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

// Obter estatísticas demográficas dos compradores de ingressos da organização
// Otimizado: 1) compradores únicos (Set), não 1 query users por ingresso; 2) leituras em lote com Promise.all
export const getOrganizationDemographicStats = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const stats = {
      genderStats: {
        male: 0,
        female: 0,
        other: 0,
        prefer_not_to_say: 0,
        not_informed: 0,
      },
      ageStats: {
        under18: 0,
        age18to24: 0,
        age25to34: 0,
        age35to44: 0,
        age45to54: 0,
        age55plus: 0,
        not_informed: 0,
      },
      uniqueBuyers: 0,
      buyersWithCompleteProfile: 0,
    };

    const buyerUserIds = new Set<string>();

    for (const event of events) {
      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .filter((q) =>
          q.or(q.eq(q.field("status"), "valid"), q.eq(q.field("status"), "used"))
        )
        .collect();

      for (const t of tickets) {
        if (t.userId && typeof t.userId === "string") {
          buyerUserIds.add(t.userId);
        }
      }
    }

    stats.uniqueBuyers = buyerUserIds.size;

    const ids = [...buyerUserIds];
    const BATCH = 80;
    let buyersWithCompleteProfile = 0;

    const addGender = (user: Doc<"users"> | null) => {
      if (!user) {
        stats.genderStats.not_informed++;
        return;
      }
      const g = user.gender;
      if (g === "male" || g === "female" || g === "other" || g === "prefer_not_to_say") {
        stats.genderStats[g]++;
      } else if (g) {
        stats.genderStats.not_informed++;
      } else {
        stats.genderStats.not_informed++;
      }
    };

    const addAge = (user: Doc<"users"> | null) => {
      if (!user || !user.birthDate) {
        stats.ageStats.not_informed++;
        return;
      }
      const adjustedAge = ageFromBirthDate(user.birthDate);
      if (adjustedAge < 18) stats.ageStats.under18++;
      else if (adjustedAge <= 24) stats.ageStats.age18to24++;
      else if (adjustedAge <= 34) stats.ageStats.age25to34++;
      else if (adjustedAge <= 44) stats.ageStats.age35to44++;
      else if (adjustedAge <= 54) stats.ageStats.age45to54++;
      else stats.ageStats.age55plus++;
    };

    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const userDocs = await Promise.all(
        slice.map((uid) =>
          ctx.db
            .query("users")
            .withIndex("by_user_id", (q) => q.eq("userId", uid))
            .first()
        )
      );

      for (let j = 0; j < slice.length; j++) {
        const user = userDocs[j];
        if (user?.profileComplete) buyersWithCompleteProfile++;
        addGender(user ?? null);
        addAge(user ?? null);
      }
    }

    stats.buyersWithCompleteProfile = buyersWithCompleteProfile;

    return stats;
  },
});


// Buscar dados completos dos compradores da organização
export const getOrganizationBuyersData = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão para acessar a organização
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    // Buscar eventos da organização
    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const buyersData = [];
    const uniqueBuyerIds = new Set();

    // Para cada evento, buscar os tickets e os compradores
    for (const event of events) {
      // Buscar tickets válidos do evento
      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
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

        if (user && !uniqueBuyerIds.has(user.userId)) {
          uniqueBuyerIds.add(user.userId);

          // Calcular idade se data de nascimento estiver disponível
          let age = null;
          let ageRange = "Não informado";
          
          if (user.birthDate) {
            const birthDate = new Date(user.birthDate);
            const today = new Date();
            const calculatedAge = today.getFullYear() - birthDate.getFullYear();
            
            // Ajustar se o aniversário ainda não ocorreu este ano
            const monthDiff = today.getMonth() - birthDate.getMonth();
            const dayDiff = today.getDate() - birthDate.getDate();
            age = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? calculatedAge - 1 : calculatedAge;

            // Definir faixa etária
            if (age < 18) {
              ageRange = "Menor de 18";
            } else if (age >= 18 && age <= 24) {
              ageRange = "18-24";
            } else if (age >= 25 && age <= 34) {
              ageRange = "25-34";
            } else if (age >= 35 && age <= 44) {
              ageRange = "35-44";
            } else if (age >= 45 && age <= 54) {
              ageRange = "45-54";
            } else if (age >= 55) {
              ageRange = "55+";
            }
          }

          // Buscar todos os tickets deste usuário para calcular totais
          const userTickets = await ctx.db
            .query("tickets")
            .withIndex("by_user", (q) => q.eq("userId", user.userId))
            .filter((q) => q.or(
              q.eq(q.field("status"), "valid"),
              q.eq(q.field("status"), "used")
            ))
            .collect();

          const totalTickets = userTickets.reduce((sum, t) => sum + t.quantity, 0);
          const totalSpent = userTickets.reduce((sum, t) => sum + t.totalAmount, 0);
          const lastPurchase = Math.max(...userTickets.map(t => t.purchasedAt));

          buyersData.push({
            userId: user.userId,
            name: user.name,
            email: user.email,
            phone: user.phone || "Não informado",
            cpf: user.cpf || "Não informado",
            age,
            ageRange,
            gender: user.gender || "Não informado",
            birthDate: user.birthDate || "Não informado",
            profileComplete: user.profileComplete || false,
            totalTickets,
            totalSpent,
            lastPurchase,
            eventName: event.name,
            eventId: event._id,
          });
        }
      }
    }

    return buyersData;
  },
});




// Nova query otimizada para obter transações paginadas
export const getOrganizationTransactionsPaginated = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    page: v.number(),
    limit: v.number(),
    paymentMethod: v.optional(v.string()),
    status: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão para acessar a organização
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    // Buscar eventos da organização
    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const eventIds = events.map(event => event._id);

    // Se não houver eventos, retornar resultado vazio
    if (eventIds.length === 0) {
      return {
        transactions: [],
        totalCount: 0,
        hasMore: false,
        page: args.page,
        limit: args.limit,
      };
    }

    // Buscar todas as transações dos eventos da organização com filtros
    let allTransactions: any[] = [];

    for (const eventId of eventIds) {
      // Se um evento específico foi selecionado, pule os outros
      if (args.eventId && eventId !== args.eventId) continue;

      let query = ctx.db
        .query("transactions")
        .withIndex("by_event", (q) => q.eq("eventId", eventId));

      // Aplicar filtros se especificados
      if (args.paymentMethod && args.paymentMethod !== "all") {
        if (args.paymentMethod === "CARD") {
          query = query.filter((q) => 
            q.or(
              q.eq(q.field("paymentMethod"), "credit_card"),
              q.eq(q.field("paymentMethod"), "CARD")
            )
          );
        } else {
          query = query.filter((q) => q.eq(q.field("paymentMethod"), args.paymentMethod));
        }
      }

      if (args.status && args.status !== "all") {
        query = query.filter((q) => q.eq(q.field("status"), args.status));
      }

      const eventTransactions = await query.collect();
      allTransactions.push(...eventTransactions);
    }

    // Ordenar por data (mais recente primeiro)
    allTransactions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Calcular paginação
    const totalCount = allTransactions.length;
    const startIndex = (args.page - 1) * args.limit;
    const endIndex = startIndex + args.limit;
    const paginatedTransactions = allTransactions.slice(startIndex, endIndex);
    const hasMore = endIndex < totalCount;

    return {
      transactions: paginatedTransactions,
      totalCount,
      hasMore,
      page: args.page,
      limit: args.limit,
    };
  },
});

// Nova query otimizada para obter apenas o resumo financeiro (sem transações)
export const getOrganizationFinancialSummary = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    eventId: v.optional(v.id("events")), // Adicionar filtro por evento
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão para acessar a organização
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    // Buscar eventos da organização (filtrar por evento específico se fornecido)
    let events;
    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      events = event && event.organizationId === args.organizationId ? [event] : [];
    } else {
      events = await ctx.db
        .query("events")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .collect();
    }

    const summary = {
      totalEvents: events.length,
      activeEvents: events.filter(e => !e.is_cancelled).length,
      totalEarnings: 0,
      chargebackCount: 0,
      totalEarningsWithDiscount: 0,
      totalTicketsSold: 0,
      monthlyEarnings: {} as Record<string, number>,
      offlineAdjustmentTotal: 0,
      paymentMethodStats: {
        card: {
          count: 0,
          amount: 0,
          pendingAmount: 0,
          availableAmount: 0,
        },
        pix: {
          count: 0,
          amount: 0,
          availableAmount: 0,
        },
      },
    };

    for (const event of events) {
      // Buscar transações pagas ou com chargeback do evento com índice
      const transactions = await ctx.db
        .query("transactions")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .filter((q) => q.or(
          q.eq(q.field("status"), "paid"),
          q.eq(q.field("status"), "charged_back")
        ))
        .collect();

      // Só buscar fee settings se houver transações
      let eventFeeSettings = undefined;
      if (transactions.length > 0) {
        eventFeeSettings = await ctx.db
          .query("eventFeeSettings")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .first();
      }

      for (const transaction of transactions) {
        if (transaction.status === "charged_back") {
          summary.chargebackCount++;
          continue;
        }

        const pm = transaction.paymentMethod || "";
        if (pm === "OFFLINE_ADJUSTMENT" || pm === "OFFLINE_ADJUSTMENT_REFUND") {
          continue;
        }

        // Bruto cobrado ao comprador (checkout online)
        summary.totalEarnings += transaction.amount;

        const paymentMethod =
          transaction.paymentMethod === "credit_card" || transaction.paymentMethod === "CARD"
            ? "CARD"
            : "PIX";

        const sellerAmount = onlinePaidProducerAmountFromTransaction(
          transaction,
          eventFeeSettings || undefined,
        );

        summary.totalEarningsWithDiscount += sellerAmount;

        if (paymentMethod === "CARD") {
          summary.paymentMethodStats.card.count++;
          summary.paymentMethodStats.card.amount += sellerAmount;
          // D+0: Disponível imediatamente
          summary.paymentMethodStats.card.availableAmount += sellerAmount;
        } else {
          summary.paymentMethodStats.pix.count++;
          summary.paymentMethodStats.pix.amount += sellerAmount;
          summary.paymentMethodStats.pix.availableAmount += sellerAmount;
        }

        const date = new Date(transaction.createdAt);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        summary.monthlyEarnings[monthKey] = (summary.monthlyEarnings[monthKey] || 0) + sellerAmount;
      }

      const allEventTxs = await ctx.db
        .query("transactions")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      for (const tx of allEventTxs) {
        if (
          tx.paymentMethod === "OFFLINE_ADJUSTMENT" ||
          tx.paymentMethod === "OFFLINE_ADJUSTMENT_REFUND"
        ) {
          summary.offlineAdjustmentTotal += tx.amount;
        }
      }
    }

    return summary;
  },
});

/** Saldo líquido por evento (receita cartão+pix+offline − movimentação líquida de saques/créditos). */
export const getOrganizationEventNetBalances = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const eventWithdrawals = await ctx.db
      .query("organizationWithdrawals")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const results: {
      eventId: Id<"events">;
      name: string;
      grossAvailable: number;
      netWithdrawn: number;
      netBalance: number;
    }[] = [];

    for (const event of events) {
      let cardAvailable = 0;
      let pixAvailable = 0;
      let offlineAdjustment = 0;

      const feeSettings = await ctx.db
        .query("eventFeeSettings")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .first();

      const transactions = await ctx.db
        .query("transactions")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .filter((q) =>
          q.or(
            q.eq(q.field("status"), "paid"),
            q.eq(q.field("status"), "charged_back")
          )
        )
        .collect();

      for (const transaction of transactions) {
        if (transaction.status === "charged_back") continue;
        const pm = transaction.paymentMethod || "";
        if (pm === "OFFLINE_ADJUSTMENT" || pm === "OFFLINE_ADJUSTMENT_REFUND") {
          continue;
        }
        const paymentMethod =
          transaction.paymentMethod === "credit_card" || transaction.paymentMethod === "CARD"
            ? "CARD"
            : "PIX";
        const sellerAmount = onlinePaidProducerAmountFromTransaction(
          transaction,
          feeSettings || undefined,
        );
        if (paymentMethod === "CARD") cardAvailable += sellerAmount;
        else pixAvailable += sellerAmount;
      }

      const allEventTxs = await ctx.db
        .query("transactions")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      for (const tx of allEventTxs) {
        if (
          tx.paymentMethod === "OFFLINE_ADJUSTMENT" ||
          tx.paymentMethod === "OFFLINE_ADJUSTMENT_REFUND"
        ) {
          offlineAdjustment += tx.amount;
        }
      }

      const grossAvailable = cardAvailable + pixAvailable + offlineAdjustment;

      const netWithdrawn = eventWithdrawals
        .filter((w) => w.eventId === event._id)
        .reduce((sum, w) => sum + netWithdrawalAmountForBalance(w), 0);

      const netBalance = grossAvailable - netWithdrawn;

      results.push({
        eventId: event._id,
        name: event.name,
        grossAvailable,
        netWithdrawn,
        netBalance,
      });
    }

    return { events: results };
  },
});

// Nova query para saques filtrados por evento
export const getOrganizationWithdrawalsPaginated = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    eventId: v.optional(v.id("events")),
    page: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão para acessar a organização
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    // Buscar saques da organização
    let withdrawalsQuery = ctx.db
      .query("organizationWithdrawals")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId));

    // Aplicar filtro por evento se fornecido
    if (args.eventId) {
      withdrawalsQuery = withdrawalsQuery.filter((q) => q.eq(q.field("eventId"), args.eventId));
    }

    const allWithdrawals = await withdrawalsQuery
      .order("desc")
      .collect();

    // Implementar paginação
    const totalCount = allWithdrawals.length;
    const startIndex = (args.page - 1) * args.limit;
    const endIndex = startIndex + args.limit;
    const paginatedWithdrawals = allWithdrawals.slice(startIndex, endIndex);

    return {
      withdrawals: paginatedWithdrawals,
      totalCount,
      hasMore: endIndex < totalCount,
      page: args.page,
      limit: args.limit,
    };
  },
});

export const getOrganizationAbandonedCarts = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    // Verificar permissão
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) => 
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    // Buscar eventos da organização
    let events: any[] = [];
    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      if (event && event.organizationId === args.organizationId) {
        events = [event];
      }
    } else {
      events = await ctx.db
        .query("events")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .collect();
    }

    const eventIds = new Set(events.map(e => e._id));
    const eventMap = new Map(events.map(e => [e._id, e]));

    // Buscar carrinhos abandonados (precisamos buscar todos e filtrar no código ou fazer queries individuais)
    // Para otimizar, se tiver eventId, buscamos direto pelo índice. Se não, iteramos.
    let allCarts = [];

    if (args.eventId) {
      allCarts = await ctx.db
        .query("abandonedCarts")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId!))
        .order("desc")
        .collect();
    } else {
      // Buscar para cada evento (pode ser otimizado com índice by_organization se adicionarmos ao schema futuramente)
      for (const event of events) {
        const carts = await ctx.db
          .query("abandonedCarts")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();
        allCarts.push(...carts);
      }
      // Ordenar por data de atualização (mais recente primeiro)
      allCarts.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
    }

    // Enriquecer dados
    const enrichedCarts = allCarts.map(cart => ({
      ...cart,
      eventName: eventMap.get(cart.eventId)?.name || "Evento desconhecido",
      eventSlug: eventMap.get(cart.eventId)?.slug || "",
      eventImageStorageId: eventMap.get(cart.eventId)?.imageStorageId,
    }));

    return enrichedCarts;
  },
});



// Nova query específica para transações de cartão para o calendário de liberações com paginação
export const getOrganizationCardTransactionsForReleasesPaginated = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    page: v.number(),
    limit: v.number(),
    status: v.optional(v.string()), // "pending", "released", "all"
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão para acessar esta organização
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    // Buscar eventos da organização
    const events = await ctx.db
      .query("events")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const eventIds = events.map(event => event._id);

    if (eventIds.length === 0) {
      return {
        transactions: [],
        totalCount: 0,
        hasMore: false,
        page: args.page,
        limit: args.limit,
      };
    }

    // Buscar todas as transações de cartão dos eventos da organização
    let allCardTransactions: any[] = [];
    
    for (const eventId of eventIds) {
      const eventTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .filter((q) =>
          q.and(
            q.or(
              q.eq(q.field("paymentMethod"), "credit_card"),
              q.eq(q.field("paymentMethod"), "CARD")
            ),
            q.eq(q.field("status"), "paid")
          )
        )
        .collect();

      allCardTransactions.push(...eventTransactions);
    }

    // Filtrar por status de liberação se especificado
    if (args.status && args.status !== "all") {
      const now = Date.now();
      allCardTransactions = allCardTransactions.filter(tx => {
        const releaseDate = tx.createdAt + (15 * 24 * 60 * 60 * 1000); // D+15
        const isReleased = releaseDate <= now;
        
        // Debug para transações da Discoteca
        const txDate = new Date(tx.createdAt);
        const relDate = new Date(releaseDate);
        const nowDate = new Date(now);
        
        console.log('🔍 BACKEND DEBUG - Transação:', {
          transactionId: tx._id,
          createdAt: txDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          releaseDate: relDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          now: nowDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          isReleased,
          comparison: `${releaseDate} <= ${now} = ${releaseDate <= now}`,
          diasCalculados: Math.floor((releaseDate - tx.createdAt) / (24 * 60 * 60 * 1000))
        });
        
        if (args.status === "pending") return !isReleased;
        if (args.status === "released") return isReleased;
        return true;
      });
    }

    // Ordenar por data de criação (mais recente primeiro)
    allCardTransactions.sort((a, b) => b.createdAt - a.createdAt);

    // Calcular paginação
    const totalCount = allCardTransactions.length;
    const startIndex = (args.page - 1) * args.limit;
    const endIndex = startIndex + args.limit;
    const paginatedTransactions = allCardTransactions.slice(startIndex, endIndex);

    // Buscar detalhes dos eventos para cada transação
    const transactionsWithDetails = await Promise.all(
      paginatedTransactions.map(async (transaction) => {
        const event = events.find(e => e._id === transaction.eventId);
        
        // Buscar configurações de taxa do evento
        const eventFeeSettings = await ctx.db
          .query("eventFeeSettings")
          .withIndex("by_event", (q) => q.eq("eventId", transaction.eventId))
          .first();

        const sellerAmount = onlinePaidProducerAmountFromTransaction(
          transaction,
          eventFeeSettings || undefined,
        );

        return {
          _id: transaction._id,
          transactionId: transaction.transactionId,
          amount: transaction.amount,
          netAmount: sellerAmount,
          createdAt: transaction.createdAt,
          customerName: transaction.customerName,
          customerEmail: transaction.customerEmail,
          eventId: transaction.eventId,
          eventName: event?.name || "Evento não encontrado",
          releaseDate: transaction.createdAt + (15 * 24 * 60 * 60 * 1000),
          isReleased: (transaction.createdAt + (15 * 24 * 60 * 60 * 1000)) <= Date.now(),
        };
      })
    );

    return {
      transactions: transactionsWithDetails,
      totalCount,
      hasMore: endIndex < totalCount,
      page: args.page,
      limit: args.limit,
    };
  },
});



export const getEventTransactionsPaginated = query({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verificar se o usuário tem permissão para acessar o evento
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Evento não encontrado");

    // Buscar transações apenas deste evento usando o índice por data (se disponível) ou por evento
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(args.limit || 50);

    return transactions;
  },
});


/** Papel do usuário na organização (ex.: habilitar saque só para owner/admin no app) */
export const getMyOrganizationMembership = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!membership) return null;
    return { role: membership.role };
  },
});




export const getOrganizationOfflineSalesSummary = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("Sem permissão para acessar esta organização");
    }

    let events;
    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      events = event && event.organizationId === args.organizationId ? [event] : [];
    } else {
      events = await ctx.db
        .query("events")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .collect();
    }

    const eventIds = events.map((e) => e._id);
    if (eventIds.length === 0) {
      return { totalAmount: 0, count: 0, totalTickets: 0, totalPaidTickets: 0 };
    }

    let totalAmount = 0;
    let count = 0;
    let totalTickets = 0;
    let totalPaidTickets = 0;

    for (const eventId of eventIds) {
      const sales = await ctx.db
        .query("offlineSales")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .filter((q) => q.or(q.eq(q.field("status"), "recorded"), q.eq(q.field("status"), "settled")))
        .collect();

      count += sales.length;
      for (const s of sales) {
        totalAmount += s.totalAmount || 0;
        totalTickets += s.quantity || 0;
        if (s.unitPrice > 0) {
          totalPaidTickets += s.quantity || 0;
        }
      }
    }

    return { totalAmount, count, totalTickets, totalPaidTickets };
  },
});



// Resumo de vendas offline por evento (sem verificação de membership para uso interno)
export const getEventOfflineSalesSummary = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const sales = await ctx.db
      .query("offlineSales")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.or(q.eq(q.field("status"), "recorded"), q.eq(q.field("status"), "settled"))
      )
      .collect();

    const totalAmount = sales.reduce((s, x) => s + (x.totalAmount || 0), 0);
    const totalTickets = sales.reduce((s, x) => s + (x.quantity || 0), 0);
    const paidSales = sales.filter(
      (x) => Math.round((x.totalAmount ?? 0) * 100) > 0,
    );
    const totalPaidAmount = paidSales.reduce((s, x) => s + (x.totalAmount || 0), 0);
    const totalPaidTickets = paidSales.reduce((s, x) => s + (x.quantity || 0), 0);
    const totalCommission = sales.reduce((s, x) => s + (x.commissionAmount || 0), 0);
    const totalProducerFee = sales.reduce((s, x) => s + (x.producerFeeAmount || 0), 0);
    const totalProducerReceipt = sales.reduce(
      (s, x) => s + (x.amountOwedToProducer ?? 0) - (x.producerFeeAmount ?? 0),
      0,
    );

    return {
      totalAmount,
      totalTickets,
      totalPaidAmount,
      totalPaidTickets,
      totalCommission,
      totalProducerFee,
      totalProducerReceipt,
      count: sales.length,
    };
  },
});

// Solicitar crédito (depósito) para organização
export const requestCredit = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    amount: v.number(),
    description: v.string(),
    receiptStorageId: v.id("_storage"),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    try {
      // Verificar se o usuário tem permissão (owner ou admin)
      const membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization_user", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", args.userId)
        )
        .filter((q) =>
          q.eq(q.field("status"), "active")
        )
        .first();

      if (!membership) {
        return {
          success: false,
          errorType: "NOT_MEMBER",
          message: "Você não é membro desta organização"
        };
      }

      if (membership.role !== "owner" && membership.role !== "admin") {
        return {
          success: false,
          errorType: "INSUFFICIENT_PERMISSION",
          message: "Apenas proprietários e administradores podem solicitar créditos"
        };
      }

      const event = await ctx.db.get(args.eventId);
      if (!event || event.organizationId !== args.organizationId) {
        return {
          success: false,
          errorType: "INVALID_EVENT",
          message: "Evento inválido ou não pertence à organização",
        };
      }

      // Verificar se o valor é válido
      if (args.amount <= 0) {
        return {
          success: false,
          errorType: "INVALID_AMOUNT",
          message: "O valor deve ser maior que zero"
        };
      }

      // Criar solicitação de crédito (com valor positivo, o tipo 'credit' define a lógica)
      
      const withdrawalId = await ctx.db.insert("organizationWithdrawals", {
        organizationId: args.organizationId,
        userId: args.userId,
        amount: Math.abs(args.amount), // Salvar valor absoluto
        status: "pending",
        type: "credit",
        notes: args.description,
        receiptStorageId: args.receiptStorageId,
        requestedAt: Date.now(),
        eventId: args.eventId,
      });

      return { success: true, withdrawalId };
    } catch (error) {
      console.error('Erro interno na solicitação de crédito:', error);
      return {
        success: false,
        errorType: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor'
      };
    }
  },
});