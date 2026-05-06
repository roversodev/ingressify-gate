import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  events: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    hasMultipleDays: v.optional(v.boolean()),
    location: v.optional(v.string()),
    latitude: v.optional(v.float64()),
    longitude: v.optional(v.float64()),
    placeId: v.optional(v.string()),
    eventStartDate: v.number(),
    eventEndDate: v.number(),
    salesDeadline: v.optional(v.number()),
    showScarcityIndicator: v.optional(v.boolean()),
    /** Exibe avatares dos últimos compradores (foto Clerk) na página do evento */
    showConfirmedBuyersAvatars: v.optional(v.boolean()),
    userId: v.string(),
    organizationId: v.optional(v.id("organizations")),
    imageStorageId: v.optional(v.id("_storage")),
    is_cancelled: v.optional(v.boolean()),
    isPublicOnHomepage: v.optional(v.boolean()),
    isOnFire: v.optional(v.boolean()),
    allowTicketTransfers: v.optional(v.boolean()),
    allowTicketResale: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("pending_review"), v.literal("approved"), v.literal("rejected"))),
    organizerPhone: v.optional(v.string()),
    organizerEmail: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
    customScripts: v.optional(v.object({
      metaPixel: v.optional(v.string()),
      googleAnalytics: v.optional(v.string()),
      googleTagManager: v.optional(v.string()),
    })),
    customSections: v.optional(v.array(v.object({
      type: v.string(),
      title: v.optional(v.string()),
      content: v.any(),
      order: v.number(),
      isActive: v.boolean(),
    }))),
  })
    .index("by_slug", ["slug"])
    .index("by_organization", ["organizationId"])
    .index("by_public_homepage", ["isPublicOnHomepage"])
    .index("by_status", ["status"])
    .searchIndex("search_events", {
      searchField: "name",
      filterFields: ["description", "location"]
    }),

  /** Acessos à página pública de venda (/event/[slug]/tickets), um registro por carregamento (deduplicado no cliente por sessão). */
  eventSalesPageVisits: defineTable({
    eventId: v.id("events"),
    visitedAt: v.number(),
  })
    .index("by_event_visitedAt", ["eventId", "visitedAt"]),

  /**
   * Agregação por dia civil (fuso BR) + histograma 24h — usado pelas estatísticas do dashboard.
   * Evita `collect()` em dezenas de milhares de linhas em `eventSalesPageVisits`.
   */
  eventSalesPageVisitDayRollups: defineTable({
    eventId: v.id("events"),
    /** YYYY-MM-DD (America/Sao_Paulo), ordenável lexicograficamente */
    dateKey: v.string(),
    total: v.number(),
    /** Contagem por hora local (0–23) para pico / diurno vs noturno */
    hourCounts: v.array(v.number()),
  })
    .index("by_event_date", ["eventId", "dateKey"])
    .index("by_event", ["eventId"]),

  /** Heartbeat de abas na página /tickets (último ping recente = “ao vivo”). */
  eventSalesPagePresence: defineTable({
    eventId: v.id("events"),
    clientId: v.string(),
    lastPing: v.number(),
  })
    .index("by_event_client", ["eventId", "clientId"])
    .index("by_event_lastPing", ["eventId", "lastPing"]),

  /**
   * Política singleton: versão mínima do cliente (app.json version / nativeApplicationVersion).
   * Mantém no máximo um documento; use appVersionPolicy.setPolicy.
   */
  clientAppVersionPolicy: defineTable({
    minIosVersion: v.string(),
    minAndroidVersion: v.string(),
    minWebVersion: v.string(),
    storeUrlIos: v.string(),
    storeUrlAndroid: v.string(),
    message: v.optional(v.string()),
    updatedAt: v.number(),
  }),

  ticketTypes: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    totalQuantity: v.number(),
    availableQuantity: v.number(),
    currentPrice: v.number(),
    isActive: v.boolean(),
    sortOrder: v.number(),
    isCourtesy: v.boolean(),
    maxPerUser: v.optional(v.number()),
    dayId: v.optional(v.id("eventDays")),
    lotId: v.optional(v.id("ticketLots")),
    isPassport: v.optional(v.boolean()),
    /** true = não aparece no site/checkout online; venda só via promoter (offline) */
    offlineOnlySale: v.optional(v.boolean()),

    // Configurações de ativação automática
    activationSettings: v.optional(v.object({
      enabled: v.boolean(),
      activationType: v.union(
        v.literal("manual"),      // Ativação manual (padrão)
        v.literal("datetime"),    // Por data/hora específica
        v.literal("soldout"),     // Quando outro tipo esgotar
        v.literal("percentage")   // Por porcentagem de vendas de outro tipo
      ),

      // Para ativação por data/hora
      activateAt: v.optional(v.number()),

      // Para ativação por esgotamento ou porcentagem
      triggerTicketTypeId: v.optional(v.id("ticketTypes")),
      triggerPercentage: v.optional(v.number()), // Ex: 80 (para 80%)

      // Configurações de desativação
      deactivationType: v.optional(v.union(
        v.literal("never"),       // Nunca desativa (padrão)
        v.literal("datetime"),    // Desativa em data/hora específica
        v.literal("soldout")      // Desativa quando esgotar
      )),
      deactivateAt: v.optional(v.number()),
    })),

    // Promoção Compre X e Leve Y
    buyXGetY: v.optional(v.object({
      enabled: v.boolean(),
      buyQuantity: v.number(), // Quantidade X a comprar
      getQuantity: v.number(), // Quantidade Y a receber grátis
    })),
  })
    .index("by_event", ["eventId"])
    .index("by_event_active", ["eventId", "isActive"])
    .index("by_event_sort", ["eventId", "sortOrder"]),


  ticketLots: defineTable({
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
  })
    .index("by_event", ["eventId"])
    .index("by_event_day", ["eventId", "dayId"]),

  promoters: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    code: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    userId: v.optional(v.string()),
    commissionRate: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    totalSales: v.optional(v.number()),
    totalRevenue: v.optional(v.number()),
    hasCoupon: v.optional(v.boolean()),
    couponCode: v.optional(v.string()),
    teamId: v.optional(v.id("promoterTeams")),
    isCoordinator: v.optional(v.boolean()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_code", ["eventId", "code"])
    .index("by_team", ["teamId"])
    .index("by_user", ["userId"]),

  promoterPermissions: defineTable({
    promoterId: v.id("promoters"),
    ticketTypeId: v.id("ticketTypes"),
    allowed: v.boolean(),
    createdAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_promoter", ["promoterId"])
    .index("by_ticket", ["ticketTypeId"]),

    offlineSales: defineTable({
      eventId: v.id("events"),
      promoterId: v.id("promoters"),
      ticketTypeId: v.id("ticketTypes"),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
      commissionRate: v.number(),
      commissionAmount: v.number(),
      producerFeeRate: v.number(),
      producerFeeAmount: v.number(),
      amountOwedToProducer: v.number(),
      status: v.union(v.literal("recorded"), v.literal("settled"), v.literal("cancelled")),
      recordedBy: v.string(),
      createdAt: v.number(),
      notes: v.optional(v.string()),
    })
      .index("by_event", ["eventId"])
      .index("by_promoter", ["promoterId"])
      .index("by_status", ["status"])
      .index("by_createdAt", ["createdAt"])
      .index("by_ticket_type", ["ticketTypeId"])
      .index("by_status_createdAt", ["status", "createdAt"]),
  
    offlineSettlements: defineTable({
      eventId: v.id("events"),
      promoterId: v.id("promoters"),
      amount: v.number(),
      recordedAt: v.number(),
      recordedBy: v.string(),
      notes: v.optional(v.string()),
    })
      .index("by_event", ["eventId"])
      .index("by_promoter", ["promoterId"])
      .index("by_recordedAt", ["recordedAt"]),

  promoterTeams: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    coordinatorId: v.optional(v.id("promoters")),
    createdAt: v.number(),
    createdBy: v.string(),
    isActive: v.boolean(),
  })
    .index("by_event", ["eventId"])
    .index("by_coordinator", ["coordinatorId"]),

  coupons: defineTable({
    eventId: v.id("events"),
    code: v.string(),
    name: v.string(),
    discountType: v.union(v.literal("percentage"), v.literal("fixed"), v.literal("custom")),
    discountValue: v.number(),
    maxUses: v.optional(v.number()),
    currentUses: v.number(),
    validFrom: v.number(),
    validUntil: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    createdBy: v.string(),
    minPurchaseAmount: v.optional(v.number()),
    applicableTicketTypes: v.optional(v.array(v.id("ticketTypes"))),
    promotionType: v.optional(v.union(
      v.literal("standard"),
      v.literal("buyXgetY"),
      v.literal("minQuantity"),
      v.literal("bundle")
    )),
    promotionRules: v.optional(v.object({
      minQuantity: v.optional(v.number()),
      targetQuantity: v.optional(v.number()),
      sameTicketType: v.optional(v.boolean()),
      discountedItems: v.optional(v.number()),
      discountPercentage: v.optional(v.number())
    })),
  })
    .index("by_event", ["eventId"])
    .index("by_code", ["code"])
    .index("by_event_code", ["eventId", "code"]),

  tickets: defineTable({
    eventId: v.id("events"),
    ticketTypeId: v.id("ticketTypes"),
    userId: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    totalAmount: v.number(),
    purchasedAt: v.number(),
    status: v.union(v.literal("valid"), v.literal("used"), v.literal("refunded"), v.literal("cancelled"), v.literal("transfered")),
    transactionId: v.optional(v.string()),
    promoterCode: v.optional(v.string()),
    couponCode: v.optional(v.string()),
    discountAmount: v.optional(v.number()),
    originalAmount: v.optional(v.number()),
    paymentIntentId: v.optional(v.string()),
    validatedAt: v.optional(v.number()),
    validatedBy: v.optional(v.string()),
    passportUsesRemaining: v.optional(v.number()),
    validatedDayIds: v.optional(v.array(v.id("eventDays"))),
    passportEligibleDayIds: v.optional(v.array(v.id("eventDays"))),
    /** Quem enviou a cortesia (organizador / membro da org) */
    courtesySentByUserId: v.optional(v.string()),
    courtesySentByName: v.optional(v.string()),
    /** E-mail normalizado do destinatário enquanto não há conta (userId = pending) */
    pendingRecipientEmail: v.optional(v.string()),
    /** Marcado true enquanto há um listing de revenda ativo para este ingresso */
    isListedForResale: v.optional(v.boolean()),
    /** true se este ingresso foi adquirido via revenda */
    acquiredViaResale: v.optional(v.boolean()),
  })
    .index("by_event", ["eventId"])
    .index("by_user", ["userId"])
    .index("by_pending_recipient_email", ["pendingRecipientEmail"])
    .index("by_user_event", ["userId", "eventId"])
    .index("by_ticket_type", ["ticketTypeId"])
    .index("by_payment_intent", ["paymentIntentId"])
    .index("by_transaction", ["transactionId"])
    .index("by_coupon", ["couponCode"])
    .index("by_promoter", ["promoterCode"]),

  ticketRedemptions: defineTable({
    ticketId: v.id("tickets"),
    eventId: v.id("events"),
    ticketTypeId: v.id("ticketTypes"),
    validatorUserId: v.string(),
    redeemedAt: v.number(),
    quantity: v.number(),
    dayId: v.optional(v.id("eventDays")),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_event_redeemed_at", ["eventId", "redeemedAt"])
    .index("by_event_ticket_type_redeemed_at", ["eventId", "ticketTypeId", "redeemedAt"])
    .index("by_validator_redeemed_at", ["validatorUserId", "redeemedAt"]),

  transactions: defineTable({
    transactionId: v.string(),
    eventId: v.id("events"),
    userId: v.string(),
    customerId: v.string(),
    amount: v.number(),
    status: v.string(),
    paymentMethod: v.string(),
    metadata: v.any(),
    createdAt: v.number(),
    netReceivedAmount: v.optional(v.number()),
  })
    .index("by_transactionId", ["transactionId"])
    .index("by_event", ["eventId"])
    .index("by_payment_method", ["paymentMethod"])
    .index("by_created_at", ["createdAt"])
    .index("by_event_created_at", ["eventId", "createdAt"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_amount", ["amount"])
    .index("by_user_created_at", ["userId", "createdAt"]),


  users: defineTable({
    name: v.string(),
    email: v.string(),
    userId: v.string(),
    phone: v.optional(v.string()),
    cpf: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    gender: v.optional(v.string()),
    profileComplete: v.optional(v.boolean()),
    sellerOnboarded: v.optional(v.boolean()),
    oneSignalPlayerIds: v.optional(v.array(v.string())),
    /** Saldo disponível de revendas para saque */
    resaleBalance: v.optional(v.number()),
  })
    .index("by_user_id", ["userId"])
    .index("by_email", ["email"])
    .index("by_cpf", ["cpf"])
    .searchIndex("search_users", {
      searchField: "name",
      filterFields: ["email"]
    }),

  customers: defineTable({
    userId: v.string(),
    email: v.string(),
    provider: v.union(v.literal("pagarme"), v.literal("mercadopago")),
    customerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user_provider", ["userId", "provider"])
    .index("by_email_provider", ["email", "provider"])
    .index("by_customer_id", ["customerId"]),

  withdrawals: defineTable({
    userId: v.string(),
    amount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    bankInfo: v.object({
      bank: v.string(),
      agency: v.string(),
      account: v.string(),
      accountType: v.string(),
      accountHolder: v.string(),
      accountHolderCpfCnpj: v.string(),
    }),
    requestedAt: v.number(),
    processedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    transactionId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_requested_at", ["requestedAt"]),

  transferRequests: defineTable({
      ticketId: v.id("tickets"),
      /** Denormalizado para filtrar pendentes por evento sem varrer todos os tickets */
      eventId: v.optional(v.id("events")),
      fromUserId: v.string(),
      toUserEmail: v.string(),
      toUserId: v.optional(v.string()),
      // Para passaporte: dia específico transferido (quando aplicável)
      transferDayId: v.optional(v.id("eventDays")),
      status: v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("cancelled"),
        v.literal("expired")
      ),
      transferToken: v.string(),
      createdAt: v.number(),
      expiresAt: v.number(),
      acceptedAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
    })
    .index("by_ticket", ["ticketId"])
    .index("by_from_user", ["fromUserId"])
    .index("by_to_email", ["toUserEmail"])
    .index("by_token", ["transferToken"])
    .index("by_status", ["status"])
    .index("by_event_status", ["eventId", "status"]),

  transferHistory: defineTable({
    ticketId: v.id("tickets"),
    /** Denormalizado para estatísticas por evento sem `.collect()` global */
    eventId: v.optional(v.id("events")),
    fromUserId: v.string(),
    toUserId: v.string(),
    transferredAt: v.number(),
    transferRequestId: v.id("transferRequests"),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_from_user", ["fromUserId"])
    .index("by_to_user", ["toUserId"])
    .index("by_event_transferred_at", ["eventId", "transferredAt"]),

  pendingEmails: defineTable({
    transactionId: v.string(),
    customerEmail: v.string(),
    customerName: v.optional(v.string()),
    eventId: v.id("events"),
    ticketSelections: v.any(),
    qrCodeText: v.string(),
    pixExpiresAt: v.string(),
    scheduledFor: v.number(),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_transactionId", ["transactionId"])
    .index("by_scheduledFor", ["scheduledFor"])
    .index("by_status", ["status"]),

  ticketValidators: defineTable({
    eventId: v.id("events"),
    userId: v.optional(v.string()),
    email: v.string(),
    invitedBy: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected")
    ),
    inviteToken: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    allowedDayIds: v.optional(v.array(v.id("eventDays"))),
    allowedLotIds: v.optional(v.array(v.id("ticketLots"))),
    allowedTicketTypeIds: v.optional(v.array(v.id("ticketTypes"))),
  })
    .index("by_event", ["eventId"])
    .index("by_email", ["email"])
    .index("by_user", ["userId"])
    .index("by_event_user", ["eventId", "userId"])
    .index("by_token", ["inviteToken"]),


  eventDays: defineTable({
    eventId: v.id("events"),
    name: v.optional(v.string()),
    date: v.number(),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    order: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    showOnSalesPage: v.optional(v.boolean()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_order", ["eventId", "order"]),

  organizations: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    createdBy: v.string(),
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
    responsibleName: v.string(),
    responsibleDocument: v.string(),
    recipientId: v.optional(v.string()),
    recipientType: v.optional(v.union(v.literal("PF"), v.literal("PJ"))),
    recipientCode: v.optional(v.string()),
  })
    .index("by_created_by", ["createdBy"]),

  organizationMembers: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("staff")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("pending"),
      v.literal("removed")
    ),
    invitedBy: v.string(),
    invitedAt: v.number(),
    joinedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_email", ["email"])
    .index("by_organization_user", ["organizationId", "userId"])
    .index("by_organization_email", ["organizationId", "email"]),

  organizationInvites: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("staff")
    ),
    invitedBy: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("expired")
    ),
    inviteToken: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_email", ["email"])
    .index("by_token", ["inviteToken"]),

  organizationWithdrawals: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(),
    amount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    pixKey: v.optional(v.object({
      keyType: v.union(
        v.literal("cpf"),
        v.literal("cnpj"),
        v.literal("email"),
        v.literal("phone"),
        v.literal("random")
      ),
      key: v.string(),
      description: v.optional(v.string()),
    })),
    requestedAt: v.number(),
    processedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    transactionId: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    type: v.optional(v.union(v.literal("credit"), v.literal("debit"))),
    receiptStorageId: v.optional(v.id("_storage")),
    notes: v.optional(v.string())
  })
    .index("by_organization", ["organizationId"])
    .index("by_status", ["status"])
    .index("by_requested_at", ["requestedAt"])
    .index("by_event", ["eventId"]),

  platformAdmins: defineTable({
    userId: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("superadmin"),
      v.literal("admin"),
      v.literal("support"),
      v.literal("finance")
    ),
    permissions: v.array(v.string()),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
    lastLogin: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_user_id", ["userId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  adminActivityLogs: defineTable({
    adminId: v.string(),
    action: v.string(),
    targetType: v.string(),
    targetId: v.optional(v.string()),
    details: v.optional(v.any()),
    timestamp: v.number(),
    ipAddress: v.optional(v.string()),
  })
    .index("by_admin", ["adminId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_action", ["action"]),

  paymentCards: defineTable({
    userId: v.string(),
    provider: v.union(v.literal("pagarme"), v.literal("mercadopago")),
    customerId: v.string(),
    cardId: v.string(),
    brand: v.optional(v.string()),
    last4: v.optional(v.string()),
    expMonth: v.optional(v.string()),
    expYear: v.optional(v.string()),
    holderName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user_provider", ["userId", "provider"])
    .index("by_customer", ["customerId"])
    .index("by_card", ["cardId"]),

  eventLists: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    createdBy: v.string(),
    publicUrl: v.string(),
    maxSubscriptions: v.optional(v.number()),
    currentSubscriptions: v.number(),
    listType: v.string(),
    validationUrl: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_public_url", ["publicUrl"])
    .index("by_validation_url", ["validationUrl"]),

  listSubscriptions: defineTable({
    listId: v.id("eventLists"),
    userId: v.string(),
    eventId: v.id("events"),
    subscribedAt: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("cancelled")
    ),
    addedBy: v.optional(v.string()),
    checkedIn: v.boolean(),
    checkedInAt: v.optional(v.number()),
    checkedInBy: v.optional(v.string()),
  })
    .index("by_list", ["listId"])
    .index("by_user_list", ["userId", "listId"])
    .index("by_event_user", ["eventId", "userId"]),

  listValidators: defineTable({
    listId: v.id("eventLists"),
    userId: v.string(),
    email: v.string(),
    invitedBy: v.string(),
    invitedAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected")
    ),
  })
    .index("by_list", ["listId"])
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

  eventFeeSettings: defineTable({
    eventId: v.id("events"),
    pixFeePercentage: v.optional(v.number()),
    cardFeePercentage: v.optional(v.number()),
    offlineFee: v.optional(v.number()),
    absorbFees: v.optional(v.boolean()),
    useCustomFees: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_event", ["eventId"]),

  disputes: defineTable({
    transactionId: v.string(),
    provider: v.union(v.literal("pagarme"), v.literal("mercadopago")),
    status: v.union(
      v.literal("open"),
      v.literal("won"),
      v.literal("lost"),
      v.literal("canceled")
    ),
    eventId: v.id("events"),
    organizationId: v.optional(v.id("organizations")),
    userId: v.string(),
    customerId: v.string(),
    amount: v.number(),
    paymentMethod: v.string(),
    tickets: v.optional(v.array(v.object({
      ticketId: v.id("tickets"),
      ticketTypeId: v.id("ticketTypes"),
      quantity: v.number(),
      unitPrice: v.number(),
    }))),
    reason: v.optional(v.string()),
    providerEventType: v.optional(v.string()),
    providerChargebackId: v.optional(v.string()),
    providerData: v.optional(v.any()),
    openedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolutionNotes: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_event", ["eventId"])
    .index("by_organization", ["organizationId"])
    .index("by_transaction_provider", ["transactionId", "provider"])
    .index("by_openedAt", ["openedAt"]),


  representatives: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    userId: v.string(),
    defaultCommissionRate: v.optional(v.number()), // 0..1
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"]),

  eventRepresentatives: defineTable({
    eventId: v.id("events"),
    representativeId: v.id("representatives"),
    commissionRate: v.number(), // 0..1 específico do evento
    isActive: v.boolean(),
    assignedAt: v.number(),
    assignedBy: v.string(),
  })
    .index("by_event", ["eventId"])
    .index("by_rep", ["representativeId"]),

  representativePayouts: defineTable({
    eventId: v.id("events"),
    representativeId: v.id("representatives"),
    amount: v.number(),
    status: v.union(v.literal("pending"), v.literal("paid")),
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
    recordedBy: v.string(),
    notes: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_rep", ["representativeId"])
    .index("by_status", ["status"]),

  /** Banners da home: imagem fixa ou evento (configurável pelo admin) */
  homepageBanners: defineTable({
    type: v.union(v.literal("image"), v.literal("event")),
    imageStorageId: v.optional(v.id("_storage")),
    /** Opcional: arte vertical (ex. 9:16) em telas pequenas; em banner de evento substitui a capa só no mobile */
    mobileImageStorageId: v.optional(v.id("_storage")),
    externalImageUrl: v.optional(v.string()),
    title: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    badgeText: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active_sort", ["isActive", "sortOrder"]),

  abandonedCarts: defineTable({
    eventId: v.id("events"),
    userId: v.optional(v.string()), // Pode ser anônimo
    customerEmail: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerCpf: v.optional(v.string()),
    ticketSelections: v.any(), // JSON com os ingressos
    totalAmount: v.number(),
    step: v.string(), // "user" ou "payment"
    lastUpdatedAt: v.number(),
    status: v.union(v.literal("active"), v.literal("recovered"), v.literal("expired"), v.literal("converted")),
    recoveredTransactionId: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_email", ["customerEmail"])
    .index("by_updated_at", ["lastUpdatedAt"])
    .index("by_status", ["status"]),


  /** Listings de revenda de ingressos criados por usuários */
  ticketResaleListings: defineTable({
    ticketId: v.id("tickets"),
    eventId: v.id("events"),
    sellerId: v.string(),
    sellerName: v.string(),
    resalePrice: v.number(),
    platformFeePercentage: v.number(),
    platformFeeAmount: v.number(),
    sellerReceives: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("sold"),
      v.literal("expired"),
      v.literal("cancelled"),
      v.literal("refunded")
    ),
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    soldAt: v.optional(v.number()),
    buyerId: v.optional(v.string()),
    buyerEmail: v.optional(v.string()),
    buyerName: v.optional(v.string()),
    transactionId: v.optional(v.string()),
    /** Valor líquido reportado pelo Mercado Pago (`transaction_details.net_received_amount`) após a venda */
    netReceivedAmount: v.optional(v.number()),
    newTicketId: v.optional(v.id("tickets")),
    refundedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_ticket", ["ticketId"])
    .index("by_seller", ["sellerId"])
    .index("by_event", ["eventId"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"])
    .index("by_transaction", ["transactionId"]),

  /** Solicitações de saque do saldo de revenda */
  resaleWithdrawals: defineTable({
    userId: v.string(),
    amount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    pixKey: v.object({
      keyType: v.union(
        v.literal("cpf"),
        v.literal("cnpj"),
        v.literal("email"),
        v.literal("phone"),
        v.literal("random")
      ),
      key: v.string(),
    }),
    requestedAt: v.number(),
    processedAt: v.optional(v.number()),
    adminNotes: v.optional(v.string()),
    transactionId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_requested_at", ["requestedAt"]),

  /** Solicitações de push notification criadas por produtores vinculados a eventos. */
  pushNotificationRequests: defineTable({
    title: v.string(),
    message: v.string(),
    imageUrl: v.optional(v.string()),
    actionUrl: v.optional(v.string()),
    eventId: v.id("events"),
    createdByUserId: v.string(),
    createdByName: v.optional(v.string()),
    fee: v.number(),
    organizationWithdrawalId: v.optional(v.id("organizationWithdrawals")),
    targetType: v.union(
      v.literal("event_buyers"),
      v.literal("event_checkins"),
      v.literal("all_app"),
    ),
    scheduledFor: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    approvedByUserId: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    rejectedByUserId: v.optional(v.string()),
    rejectedReason: v.optional(v.string()),
    rejectedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    oneSignalNotificationId: v.optional(v.string()),
    recipientCount: v.optional(v.number()),
    targetedUserIds: v.optional(v.array(v.string())),
    targetedUserCount: v.optional(v.number()),
    deviceCount: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"])
    .index("by_created_by", ["createdByUserId"]),
});