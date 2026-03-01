import { type FunctionReference, anyApi } from "convex/server";
import { type GenericId as Id } from "convex/values";

export const api: PublicApiType = anyApi as unknown as PublicApiType;
export const internal: InternalApiType = anyApi as unknown as InternalApiType;

export type PublicApiType = {
  coupons: {
    createCoupon: FunctionReference<
      "mutation",
      "public",
      {
        applicableTicketTypes?: Array<Id<"ticketTypes">>;
        code: string;
        createdBy: string;
        discountType: "percentage" | "fixed" | "custom";
        discountValue: number;
        eventId: Id<"events">;
        maxUses?: number;
        minPurchaseAmount?: number;
        name: string;
        promotionRules?: {
          discountPercentage?: number;
          discountedItems?: number;
          minQuantity?: number;
          sameTicketType?: boolean;
          targetQuantity?: number;
        };
        promotionType?: "standard" | "buyXgetY" | "minQuantity" | "bundle";
        validFrom: number;
        validUntil: number;
      },
      any
    >;
    validateCoupon: FunctionReference<
      "query",
      "public",
      {
        code: string;
        eventId: Id<"events">;
        purchaseAmount: number;
        ticketSelections: Array<{
          quantity: number;
          ticketTypeId: Id<"ticketTypes">;
        }>;
      },
      any
    >;
    useCoupon: FunctionReference<
      "mutation",
      "public",
      { couponId: Id<"coupons"> },
      any
    >;
    incrementCouponUsage: FunctionReference<
      "mutation",
      "public",
      { couponCode: string; eventId: Id<"events"> },
      any
    >;
    getEventCoupons: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    updateCoupon: FunctionReference<
      "mutation",
      "public",
      {
        applicableTicketTypes?: Array<Id<"ticketTypes">>;
        couponId: Id<"coupons">;
        discountType?: "percentage" | "fixed" | "custom";
        discountValue?: number;
        isActive?: boolean;
        maxUses?: number;
        minPurchaseAmount?: number;
        name?: string;
        promotionRules?: {
          discountPercentage?: number;
          discountedItems?: number;
          minQuantity?: number;
          sameTicketType?: boolean;
          targetQuantity?: number;
        };
        promotionType?: "standard" | "buyXgetY" | "minQuantity" | "bundle";
        validUntil?: number;
      },
      any
    >;
    deleteCoupon: FunctionReference<
      "mutation",
      "public",
      { couponId: Id<"coupons"> },
      any
    >;
  };
  events: {
    get: FunctionReference<"query", "public", Record<string, never>, any>;
    getById: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventBasicInfo: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getBySlug: FunctionReference<"query", "public", { slug: string }, any>;
    getEventMetrics: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getUserTickets: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    purchaseTicketsDirect: FunctionReference<
      "mutation",
      "public",
      {
        eventId: Id<"events">;
        paymentInfo: { paymentIntentId: string; totalAmount: number };
        quantity: number;
        ticketTypeId: Id<"ticketTypes">;
        userId: string;
      },
      any
    >;
    getEventAvailability: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventAvailabilityValidar: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventAvailabilityEventPage: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventAvailabilityTotalAvailable: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    search: FunctionReference<"query", "public", { searchTerm: string }, any>;
    getSellerEvents: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    create: FunctionReference<
      "mutation",
      "public",
      {
        customSections?: Array<{
          content: any;
          isActive: boolean;
          order: number;
          title?: string;
          type: string;
        }>;
        description: string;
        eventEndDate: number;
        eventStartDate: number;
        hasMultipleDays?: boolean;
        latitude?: number;
        location?: string;
        longitude?: number;
        name: string;
        organizationId: Id<"organizations">;
        placeId?: string;
        userId: string;
      },
      any
    >;
    updateEvent: FunctionReference<
      "mutation",
      "public",
      {
        customSections?: Array<{
          content: any;
          isActive: boolean;
          order: number;
          title?: string;
          type: string;
        }>;
        description: string;
        eventEndDate: number;
        eventId: Id<"events">;
        eventStartDate: number;
        hasMultipleDays?: boolean;
        latitude?: number;
        location: string;
        longitude?: number;
        name: string;
        placeId?: string;
        slug?: string;
      },
      any
    >;
    cancelEvent: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    purchaseTickets: FunctionReference<
      "mutation",
      "public",
      {
        couponCode?: string;
        discountAmount?: number;
        eventId: Id<"events">;
        paymentIntentId: string;
        promoterCode?: string;
        ticketSelections: Array<{
          quantity: number;
          ticketTypeId: Id<"ticketTypes">;
        }>;
        userId: string;
      },
      any
    >;
    getOrCreateCourtesyTicketType: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events">; organizerId: string },
      any
    >;
    generateCourtesyTickets: FunctionReference<
      "mutation",
      "public",
      {
        customMessage?: string;
        eventId: Id<"events">;
        generatedBy: string;
        quantity: number;
        recipientName?: string;
        ticketTypeId?: Id<"ticketTypes">;
        userEmail: string;
      },
      any
    >;
    getEventBuyers: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventFinancialMetrics: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventTicketHoldersOptimized: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events">; limit?: number },
      any
    >;
    purchaseTicketsWithFreePay: FunctionReference<
      "mutation",
      "public",
      {
        couponCode?: string;
        customerCpf: string;
        customerEmail: string;
        customerName: string;
        discountAmount?: number;
        eventId: Id<"events">;
        promoterCode?: string;
        ticketSelections: Array<{
          quantity: number;
          ticketTypeId: Id<"ticketTypes">;
        }>;
        transactionId: string;
        userId: string;
      },
      any
    >;
    saveTransactionReference: FunctionReference<
      "mutation",
      "public",
      {
        amount: number;
        customerId: string;
        eventId: Id<"events">;
        status: string;
        transactionId: string;
        userId: string;
      },
      any
    >;
    getOrganizationEvents: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations"> },
      any
    >;
    getOrganizationEventsBasic: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations"> },
      any
    >;
    getPublishedEvents: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      any
    >;
    getEventDemographicStats: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getUserTicketsGroupedByEvent: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    updateEventSettings: FunctionReference<
      "mutation",
      "public",
      {
        allowTicketTransfers?: boolean;
        customScripts?: {
          googleAnalytics?: string;
          googleTagManager?: string;
          metaPixel?: string;
        };
        eventId: Id<"events">;
        isPublicOnHomepage?: boolean;
        userId: string;
      },
      any
    >;
    getEventCourtesyStats: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventCourtesyDetails: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventPageData: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventCheckoutData: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventBasicData: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventConfigData: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventEditData: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventEmailData: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventName: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventStartLocName: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventTicketShow: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getOnFireEvents: FunctionReference<"query", "public", any, any>;
    getPastEventsWithPagination: FunctionReference<
      "query",
      "public",
      { limit: number; page: number },
      any
    >;
    getUpcomingEventsAll: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      any
    >;
  };
  migrations: {
    addSlugsToEvents: {
      addSlugsToExistingEvents: FunctionReference<
        "mutation",
        "public",
        Record<string, never>,
        any
      >;
    };
  };
  organizations: {
    createOrganization: FunctionReference<
      "mutation",
      "public",
      {
        description?: string;
        imageStorageId?: Id<"_storage">;
        name: string;
        pixKeys?: Array<{
          description?: string;
          isDefault: boolean;
          key: string;
          keyType: "cpf" | "cnpj" | "email" | "phone" | "random";
        }>;
        recipientCode?: string;
        recipientId?: string;
        recipientType?: "PF" | "PJ";
        responsibleDocument?: string;
        responsibleName: string;
        userId: string;
      },
      any
    >;
    getUserOrganizations: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    inviteMember: FunctionReference<
      "mutation",
      "public",
      {
        email: string;
        organizationId: Id<"organizations">;
        role: "admin" | "staff";
        userId: string;
      },
      any
    >;
    acceptInvite: FunctionReference<
      "mutation",
      "public",
      { inviteToken: string; userId: string },
      any
    >;
    checkInviteStatus: FunctionReference<
      "query",
      "public",
      { inviteToken: string },
      any
    >;
    checkUserHasOrganization: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getOrganizationMembers: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations"> },
      any
    >;
    getOrganizationPendingInvites: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations"> },
      any
    >;
    removeMember: FunctionReference<
      "mutation",
      "public",
      {
        memberId: Id<"organizationMembers">;
        organizationId: Id<"organizations">;
        userId: string;
      },
      any
    >;
    updateMemberRole: FunctionReference<
      "mutation",
      "public",
      {
        memberId: Id<"organizationMembers">;
        newRole: "admin" | "staff";
        organizationId: Id<"organizations">;
        userId: string;
      },
      any
    >;
    cancelInvite: FunctionReference<
      "mutation",
      "public",
      { inviteId: Id<"organizationInvites">; userId: string },
      any
    >;
    getOrganizationTransactions: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations">; userId: string },
      any
    >;
    getOrganizationFinancialStats: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations">; userId: string },
      any
    >;
    getOrganizationById: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations"> },
      any
    >;
    updateOrganization: FunctionReference<
      "mutation",
      "public",
      {
        description?: string;
        imageStorageId?: Id<"_storage">;
        name: string;
        organizationId: Id<"organizations">;
        pixKeys?: Array<{
          description?: string;
          isDefault: boolean;
          key: string;
          keyType: "cpf" | "cnpj" | "email" | "phone" | "random";
        }>;
        recipientCode?: string;
        recipientId?: string;
        recipientType?: "PF" | "PJ";
        responsibleDocument: string;
        responsibleName: string;
        userId: string;
      },
      any
    >;
    requestWithdrawal: FunctionReference<
      "mutation",
      "public",
      {
        amount: number;
        eventId?: Id<"events">;
        organizationId: Id<"organizations">;
        pixKeyIndex: number;
        userId: string;
      },
      any
    >;
    getOrganizationWithdrawals: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        organizationId: Id<"organizations">;
        userId: string;
      },
      any
    >;
    getOrganizationDemographicStats: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations">; userId: string },
      any
    >;
    getOrganizationBuyersData: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations">; userId: string },
      any
    >;
    getOrganizationTransactionsPaginated: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        limit: number;
        organizationId: Id<"organizations">;
        page: number;
        paymentMethod?: string;
        status?: string;
        userId: string;
      },
      any
    >;
    getOrganizationFinancialSummary: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        organizationId: Id<"organizations">;
        userId: string;
      },
      any
    >;
    getOrganizationWithdrawalsPaginated: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        limit: number;
        organizationId: Id<"organizations">;
        page: number;
        userId: string;
      },
      any
    >;
    getOrganizationAbandonedCarts: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        organizationId: Id<"organizations">;
        userId: string;
      },
      any
    >;
    getOrganizationCardTransactionsForReleasesPaginated: FunctionReference<
      "query",
      "public",
      {
        limit: number;
        organizationId: Id<"organizations">;
        page: number;
        status?: string;
        userId: string;
      },
      any
    >;
    getEventTransactionsPaginated: FunctionReference<
      "query",
      "public",
      {
        eventId: Id<"events">;
        limit?: number;
        offset?: number;
        userId: string;
      },
      any
    >;
  };
  pendingEmails: {
    create: FunctionReference<
      "mutation",
      "public",
      {
        customerEmail: string;
        customerName?: string;
        eventId: Id<"events">;
        pixExpiresAt: string;
        qrCodeText: string;
        scheduledFor: number;
        ticketSelections: any;
        transactionId: string;
      },
      any
    >;
    getPendingEmails: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      any
    >;
    markAsSent: FunctionReference<
      "mutation",
      "public",
      { id: Id<"pendingEmails"> },
      any
    >;
    markAsCancelled: FunctionReference<
      "mutation",
      "public",
      { transactionId: string },
      any
    >;
  };
  promoters: {
    createPromoter: FunctionReference<
      "mutation",
      "public",
      {
        code: string;
        couponName?: string;
        couponValidUntil?: number;
        createCoupon?: boolean;
        createdBy: string;
        discountType?: "percentage" | "fixed";
        discountValue?: number;
        email?: string;
        eventId: Id<"events">;
        name: string;
        phone?: string;
      },
      any
    >;
    getEventPromoters: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getPromoterByCode: FunctionReference<
      "query",
      "public",
      { code: string; eventId: Id<"events"> },
      any
    >;
    getPromoterSalesReport: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events">; promoterCode?: string },
      any
    >;
    updatePromoter: FunctionReference<
      "mutation",
      "public",
      {
        email?: string;
        isActive?: boolean;
        name?: string;
        phone?: string;
        promoterId: Id<"promoters">;
      },
      any
    >;
    deletePromoter: FunctionReference<
      "mutation",
      "public",
      { promoterId: Id<"promoters"> },
      any
    >;
    getPromoterSales: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    createPromoterTeam: FunctionReference<
      "mutation",
      "public",
      {
        coordinatorId?: Id<"promoters">;
        createdBy: string;
        description?: string;
        eventId: Id<"events">;
        name: string;
      },
      any
    >;
    setTeamCoordinator: FunctionReference<
      "mutation",
      "public",
      { promoterId: Id<"promoters">; teamId: Id<"promoterTeams"> },
      any
    >;
    addPromoterToTeam: FunctionReference<
      "mutation",
      "public",
      { promoterId: Id<"promoters">; teamId: Id<"promoterTeams"> },
      any
    >;
    removePromoterFromTeam: FunctionReference<
      "mutation",
      "public",
      { promoterId: Id<"promoters"> },
      any
    >;
    getEventTeams: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getTeamWithMembers: FunctionReference<
      "query",
      "public",
      { teamId: Id<"promoterTeams"> },
      any
    >;
    getCoordinatorTeams: FunctionReference<
      "query",
      "public",
      { promoterId: Id<"promoters"> },
      any
    >;
    updatePromoterTeam: FunctionReference<
      "mutation",
      "public",
      {
        description?: string;
        isActive?: boolean;
        name?: string;
        teamId: Id<"promoterTeams">;
      },
      any
    >;
    deletePromoterTeam: FunctionReference<
      "mutation",
      "public",
      { teamId: Id<"promoterTeams"> },
      any
    >;
  };
  storage: {
    generateUploadUrl: FunctionReference<"mutation", "public", any, any>;
    updateEventImage: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events">; storageId: Id<"_storage"> | null },
      any
    >;
    getUrl: FunctionReference<
      "query",
      "public",
      { storageId: Id<"_storage"> },
      any
    >;
    getUrlOnce: FunctionReference<
      "action",
      "public",
      { storageId: Id<"_storage"> },
      any
    >;
    deleteImage: FunctionReference<
      "mutation",
      "public",
      { storageId: Id<"_storage"> },
      any
    >;
  };
  ticketTypes: {
    getEventTicketTypes: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getAllEventTicketTypes: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    createTicketType: FunctionReference<
      "mutation",
      "public",
      {
        activationSettings?: {
          activateAt?: number;
          activationType: "manual" | "datetime" | "soldout" | "percentage";
          deactivateAt?: number;
          deactivationType?: "never" | "datetime" | "soldout";
          enabled: boolean;
          triggerPercentage?: number;
          triggerTicketTypeId?: Id<"ticketTypes">;
        };
        description?: string;
        eventId: Id<"events">;
        isActive?: boolean;
        isCourtesy?: boolean;
        maxPerUser?: number;
        name: string;
        price: number;
        sortOrder: number;
        totalQuantity: number;
      },
      any
    >;
    checkAvailability: FunctionReference<
      "query",
      "public",
      { requestedQuantity: number; ticketTypeId: Id<"ticketTypes"> },
      any
    >;
    updateTicketType: FunctionReference<
      "mutation",
      "public",
      {
        activationSettings?: {
          activateAt?: number;
          activationType: "manual" | "datetime" | "soldout" | "percentage";
          deactivateAt?: number;
          deactivationType?: "never" | "datetime" | "soldout";
          enabled: boolean;
          triggerPercentage?: number;
          triggerTicketTypeId?: Id<"ticketTypes">;
        };
        description?: string;
        isActive?: boolean;
        isCourtesy?: boolean;
        maxPerUser?: number;
        name: string;
        price: number;
        sortOrder: number;
        ticketTypeId: Id<"ticketTypes">;
        totalQuantity: number;
      },
      any
    >;
    deleteTicketType: FunctionReference<
      "mutation",
      "public",
      { ticketTypeId: Id<"ticketTypes"> },
      any
    >;
    getAllEventTicketTypesIncludingCourtesy: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventCourtesyTicketTypes: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getById: FunctionReference<
      "query",
      "public",
      { ticketTypeId: Id<"ticketTypes"> },
      any
    >;
    checkUserPurchaseLimit: FunctionReference<
      "query",
      "public",
      {
        requestedQuantity: number;
        ticketTypeId: Id<"ticketTypes">;
        userId: string;
      },
      any
    >;
    getTicketTypesForManagement: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    upsertTicketType: FunctionReference<
      "mutation",
      "public",
      {
        activationSettings?: {
          activateAt?: number;
          activationType: "manual" | "datetime" | "soldout" | "percentage";
          deactivateAt?: number;
          deactivationType?: "never" | "datetime" | "soldout";
          enabled: boolean;
          triggerPercentage?: number;
          triggerTicketTypeId?: Id<"ticketTypes">;
        };
        buyXGetY?: {
          buyQuantity: number;
          enabled: boolean;
          getQuantity: number;
        };
        dayId?: Id<"eventDays">;
        description?: string;
        eventId: Id<"events">;
        isActive?: boolean;
        isCourtesy?: boolean;
        isPassport?: boolean;
        lotId?: Id<"ticketLots">;
        maxPerUser?: number;
        name: string;
        price: number;
        sortOrder?: number;
        ticketTypeId?: Id<"ticketTypes">;
        totalQuantity: number;
      },
      any
    >;
    validateTicketsForCheckout: FunctionReference<
      "query",
      "public",
      {
        eventId: Id<"events">;
        ticketSelections: Array<{
          quantity: number;
          ticketTypeId: Id<"ticketTypes">;
        }>;
        userId?: string;
      },
      any
    >;
    getEventDaysAndLots: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    createEventDay: FunctionReference<
      "mutation",
      "public",
      {
        date: number;
        endTime?: number;
        eventId: Id<"events">;
        isActive?: boolean;
        name?: string;
        order?: number;
        showOnSalesPage?: boolean;
        startTime?: number;
      },
      any
    >;
    updateEventDay: FunctionReference<
      "mutation",
      "public",
      {
        date?: number;
        dayId: Id<"eventDays">;
        endTime?: number;
        isActive?: boolean;
        name?: string;
        order?: number;
        showOnSalesPage?: boolean;
        startTime?: number;
      },
      any
    >;
    deleteEventDay: FunctionReference<
      "mutation",
      "public",
      { dayId: Id<"eventDays"> },
      any
    >;
    createTicketLot: FunctionReference<
      "mutation",
      "public",
      {
        closeAt?: number;
        dayId?: Id<"eventDays">;
        description?: string;
        eventId: Id<"events">;
        isActive?: boolean;
        maxPerCpf?: number;
        name: string;
        openAt?: number;
        order?: number;
        showOnSalesPage?: boolean;
      },
      any
    >;
    updateTicketLot: FunctionReference<
      "mutation",
      "public",
      {
        closeAt?: number;
        dayId?: Id<"eventDays">;
        description?: string;
        isActive?: boolean;
        lotId: Id<"ticketLots">;
        maxPerCpf?: number;
        name?: string;
        openAt?: number;
        order?: number;
        showOnSalesPage?: boolean;
      },
      any
    >;
    deleteTicketLot: FunctionReference<
      "mutation",
      "public",
      { lotId: Id<"ticketLots"> },
      any
    >;
  };
  tickets: {
    getUserTicketForEvent: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events">; userId: string },
      any
    >;
    getTicketWithDetails: FunctionReference<
      "query",
      "public",
      { ticketId: Id<"tickets"> },
      any
    >;
    getValidPaidTicketsForEvent: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getValidTicketsForEvent: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    updateTicketStatus: FunctionReference<
      "mutation",
      "public",
      {
        status: "valid" | "used" | "refunded" | "cancelled";
        ticketId: Id<"tickets">;
      },
      any
    >;
    validateTicket: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events">; ticketId: Id<"tickets">; userId: string },
      any
    >;
    getTicketsByIds: FunctionReference<
      "query",
      "public",
      { ticketIds: Array<Id<"tickets">> },
      any
    >;
    cancelTicket: FunctionReference<
      "mutation",
      "public",
      { reason: string; ticketId: Id<"tickets"> },
      any
    >;
    getTicketsByTransactionId: FunctionReference<
      "query",
      "public",
      { transactionId: string },
      any
    >;
    getByTransactionId: FunctionReference<
      "query",
      "public",
      { transactionId: string },
      any
    >;
    createTicketsFromTransaction: FunctionReference<
      "mutation",
      "public",
      {
        customerCpf?: string;
        customerEmail?: string;
        customerName?: string;
        transactionId: string;
      },
      any
    >;
    getTicketsByEmail: FunctionReference<
      "query",
      "public",
      { email: string; eventId?: Id<"events"> },
      any
    >;
    getTicketsByCpf: FunctionReference<
      "query",
      "public",
      { cpf: string; eventId?: Id<"events"> },
      any
    >;
    getTicketsWithDetailsByEmailOrCpf: FunctionReference<
      "query",
      "public",
      { cpf?: string; email?: string; eventId?: Id<"events"> },
      any
    >;
    getUserTickets: FunctionReference<
      "query",
      "public",
      { userEmail: string },
      any
    >;
    getUserTicketsByEvent: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events">; userEmail: string },
      any
    >;
  };
  transactions: {
    create: FunctionReference<
      "mutation",
      "public",
      {
        amount: number;
        customerId: string;
        eventId: Id<"events">;
        metadata: any;
        paymentMethod: string;
        status: string;
        transactionId: string;
        userId: string;
      },
      any
    >;
    getByTransactionId: FunctionReference<
      "query",
      "public",
      { transactionId: string },
      any
    >;
    updateStatus: FunctionReference<
      "mutation",
      "public",
      { status: string; transactionId: string },
      any
    >;
    updateMetadata: FunctionReference<
      "mutation",
      "public",
      { metadata: any; transactionId: string },
      any
    >;
    updateNetAmounts: FunctionReference<
      "mutation",
      "public",
      { netReceivedAmount: number; transactionId: string },
      any
    >;
    upsertAbandonedCart: FunctionReference<
      "mutation",
      "public",
      {
        customerCpf?: string;
        customerEmail?: string;
        customerName?: string;
        customerPhone?: string;
        eventId: Id<"events">;
        step: string;
        ticketSelections: any;
        totalAmount: number;
        userId?: string;
      },
      any
    >;
    markCartAsRecovered: FunctionReference<
      "mutation",
      "public",
      { customerEmail: string; eventId: Id<"events">; transactionId: string },
      any
    >;
  };
  transfers: {
    createTransferRequest: FunctionReference<
      "mutation",
      "public",
      { fromUserId: string; ticketId: Id<"tickets">; toUserEmail: string },
      any
    >;
    acceptTransfer: FunctionReference<
      "mutation",
      "public",
      { transferToken: string },
      any
    >;
    cancelTransfer: FunctionReference<
      "mutation",
      "public",
      { transferRequestId: Id<"transferRequests">; userId: string },
      any
    >;
    acceptTransferSimple: FunctionReference<
      "mutation",
      "public",
      { toUserId: string; transferRequestId: Id<"transferRequests"> },
      any
    >;
    rejectTransfer: FunctionReference<
      "mutation",
      "public",
      { transferRequestId: Id<"transferRequests"> },
      any
    >;
    getUserTransfers: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getTransferByToken: FunctionReference<
      "query",
      "public",
      { transferToken: string },
      any
    >;
    getPendingReceivedTransfers: FunctionReference<
      "query",
      "public",
      { userEmail: string },
      any
    >;
    getPendingTransferForTicket: FunctionReference<
      "query",
      "public",
      { ticketId: Id<"tickets"> },
      any
    >;
    getAcceptedTransferForTicket: FunctionReference<
      "query",
      "public",
      { ticketId: Id<"tickets"> },
      any
    >;
    getTransferHistoryForTicket: FunctionReference<
      "query",
      "public",
      { ticketId: Id<"tickets"> },
      any
    >;
    getEventTransferStats: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventTransferDetails: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
  };
  users: {
    updateUser: FunctionReference<
      "mutation",
      "public",
      { email: string; name: string; userId: string },
      any
    >;
    getUserById: FunctionReference<"query", "public", { userId: string }, any>;
    checkUserExistsByEmail: FunctionReference<
      "query",
      "public",
      { email: string },
      any
    >;
    getUserInfoByEmail: FunctionReference<
      "query",
      "public",
      { email: string },
      any
    >;
    updateUserPhone: FunctionReference<
      "mutation",
      "public",
      { phone: string; userId: string },
      any
    >;
    getUserPhone: FunctionReference<"query", "public", { userId: string }, any>;
    updateCustomerData: FunctionReference<
      "mutation",
      "public",
      {
        cpf?: string;
        email?: string;
        name?: string;
        phone?: string;
        userId: string;
      },
      any
    >;
    updateUserCpf: FunctionReference<
      "mutation",
      "public",
      { cpf: string; userId: string },
      any
    >;
    checkProfileComplete: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    updateUserProfile: FunctionReference<
      "mutation",
      "public",
      {
        birthDate?: string;
        cpf?: string;
        email?: string;
        gender?: string;
        name?: string;
        phone?: string;
        userId: string;
      },
      any
    >;
    validateCpf: FunctionReference<"query", "public", { cpf: string }, any>;
    checkCpfExists: FunctionReference<
      "query",
      "public",
      { cpf: string; userId?: string },
      any
    >;
    getUserStats: FunctionReference<"query", "public", { userId: string }, any>;
    excludeUser: FunctionReference<
      "mutation",
      "public",
      { userId: string },
      any
    >;
    getUsersInfoByEmails: FunctionReference<
      "query",
      "public",
      { emails: Array<string> },
      any
    >;
    addOneSignalPlayerId: FunctionReference<
      "mutation",
      "public",
      { playerId: string; userId: string },
      any
    >;
    removeOneSignalPlayerId: FunctionReference<
      "mutation",
      "public",
      { playerId: string; userId: string },
      any
    >;
    getUserOneSignalPlayerIds: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
  };
  validators: {
    inviteValidator: FunctionReference<
      "mutation",
      "public",
      { email: string; eventId: Id<"events">; userId: string },
      any
    >;
    acceptInvitation: FunctionReference<
      "mutation",
      "public",
      { token: string; userEmail: string; userId: string },
      any
    >;
    getEventValidators: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events">; userId: string },
      any
    >;
    removeValidator: FunctionReference<
      "mutation",
      "public",
      { userId: string; validatorId: Id<"ticketValidators"> },
      any
    >;
    canValidateTickets: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events">; userId: string },
      any
    >;
    getEventsUserCanValidate: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getValidatorInvitationsByEmail: FunctionReference<
      "query",
      "public",
      { email: string },
      any
    >;
    updateValidatorPermissions: FunctionReference<
      "mutation",
      "public",
      {
        dayIds?: Array<Id<"eventDays">>;
        eventId: Id<"events">;
        lotIds?: Array<Id<"ticketLots">>;
        ticketTypeIds?: Array<Id<"ticketTypes">>;
        userId: string;
        validatorId: Id<"ticketValidators">;
      },
      any
    >;
  };
  admin: {
    checkAdminStatus: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    createFirstSuperAdmin: FunctionReference<
      "mutation",
      "public",
      { email: string; userId: string },
      any
    >;
    addAdmin: FunctionReference<
      "mutation",
      "public",
      {
        currentUserId: string;
        email: string;
        newAdminUserId: string;
        permissions: Array<string>;
        role: "admin" | "support" | "finance";
      },
      any
    >;
    removeAdmin: FunctionReference<
      "mutation",
      "public",
      { adminUserId: string; currentUserId: string },
      any
    >;
    updateAdminPermissions: FunctionReference<
      "mutation",
      "public",
      {
        adminUserId: string;
        currentUserId: string;
        permissions: Array<string>;
        role: "admin" | "support" | "finance";
      },
      any
    >;
    listAllAdmins: FunctionReference<
      "query",
      "public",
      { currentUserId: string },
      any
    >;
    getPlatformStats: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    listAllUsers: FunctionReference<
      "query",
      "public",
      { limit?: number; searchTerm?: string; skip?: number; userId: string },
      any
    >;
    listAllEvents: FunctionReference<
      "query",
      "public",
      { limit?: number; searchTerm?: string; skip?: number; userId: string },
      any
    >;
    getEventDetails: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events">; userId: string },
      any
    >;
    logAdminActivity: FunctionReference<
      "mutation",
      "public",
      {
        action: string;
        adminId: string;
        details?: any;
        ipAddress?: string;
        targetId?: string;
        targetType: string;
      },
      any
    >;
    getAdminActivityLogs: FunctionReference<
      "query",
      "public",
      {
        filterAction?: string;
        filterAdmin?: string;
        limit?: number;
        skip?: number;
        userId: string;
      },
      any
    >;
    getSalesOverTime: FunctionReference<
      "query",
      "public",
      { period?: string; userId: string },
      any
    >;
    getRevenueData: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getTicketSalesData: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getRevenueChurnData: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getRefundsData: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getEventLocationStats: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getUserGrowthData: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getByTransactionIdMutation: FunctionReference<
      "mutation",
      "public",
      { transactionId: string },
      any
    >;
    getTicketsByTransactionIdMutation: FunctionReference<
      "mutation",
      "public",
      { transactionId: string },
      any
    >;
    getTicketsByEmailMutation: FunctionReference<
      "mutation",
      "public",
      { email: string; eventId?: Id<"events"> },
      any
    >;
    getTicketsByCpfMutation: FunctionReference<
      "mutation",
      "public",
      { cpf: string; eventId?: Id<"events"> },
      any
    >;
    getOrganizationTransactionsMutation: FunctionReference<
      "mutation",
      "public",
      { organizationId: Id<"organizations">; userId: string },
      any
    >;
    getOrganizationTransactions: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        organizationId: Id<"organizations">;
        userId: string;
      },
      any
    >;
    getPlatformFinancialMetrics: FunctionReference<
      "query",
      "public",
      { endDate?: number; startDate?: number; userId: string },
      any
    >;
    listAllOrganizationWithdrawals: FunctionReference<
      "query",
      "public",
      {
        limit?: number;
        skip?: number;
        status?:
          | "pending"
          | "processing"
          | "completed"
          | "failed"
          | "cancelled";
        userId: string;
      },
      any
    >;
    processWithdrawal: FunctionReference<
      "mutation",
      "public",
      {
        action: "approve" | "complete" | "reject" | "cancel";
        adminUserId: string;
        notes?: string;
        receiptStorageId?: Id<"_storage">;
        withdrawalId: Id<"organizationWithdrawals">;
      },
      any
    >;
    getWithdrawalDetails: FunctionReference<
      "query",
      "public",
      { userId: string; withdrawalId: Id<"organizationWithdrawals"> },
      any
    >;
    listAllTickets: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getTicketsForEvent: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events">; userId: string },
      any
    >;
    getAllPlatformTickets: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        limit?: number;
        status?: "valid" | "used" | "refunded" | "cancelled" | "transfered";
        userId: string;
      },
      any
    >;
    updateTicketStatusAdmin: FunctionReference<
      "mutation",
      "public",
      {
        newStatus: "valid" | "used" | "refunded" | "cancelled" | "transfered";
        reason?: string;
        ticketId: Id<"tickets">;
        userId: string;
      },
      any
    >;
    getTicketDetails: FunctionReference<
      "query",
      "public",
      { ticketId: Id<"tickets">; userId: string },
      any
    >;
    getTicketsByEmailAdmin: FunctionReference<
      "query",
      "public",
      { email: string; eventId?: Id<"events">; userId: string },
      any
    >;
    getTicketsByCpfAdmin: FunctionReference<
      "query",
      "public",
      { cpf: string; eventId?: Id<"events">; userId: string },
      any
    >;
    listAllEventsWithOrganization: FunctionReference<
      "query",
      "public",
      { limit?: number; searchTerm?: string; skip?: number; userId: string },
      any
    >;
    getOrganizationCompletedWithdrawals: FunctionReference<
      "mutation",
      "public",
      { eventId?: Id<"events">; organizationId: Id<"organizations"> },
      any
    >;
    getOrganizationTransactionsPaginated: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        limit?: number;
        organizationId: Id<"organizations">;
        page?: number;
        userId: string;
      },
      any
    >;
    getAllTransactionsPaginated: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        limit?: number;
        page?: number;
        paginationOpts?: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        userId: string;
      },
      any
    >;
    getCreditCardInstallmentStats: FunctionReference<
      "query",
      "public",
      { endDate?: number; startDate?: number; userId: string },
      any
    >;
    getInstallmentDistributionStats: FunctionReference<
      "query",
      "public",
      { endDate?: number; startDate?: number; userId: string },
      any
    >;
    getEventTransactionsMutation: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events">; userId: string },
      any
    >;
    adminCreateRepresentative: FunctionReference<
      "mutation",
      "public",
      {
        adminUserId: string;
        defaultCommissionRate?: number;
        email?: string;
        name: string;
        phone?: string;
        userId: string;
      },
      any
    >;
    adminAssignRepresentativeToEvent: FunctionReference<
      "mutation",
      "public",
      {
        adminUserId: string;
        commissionRate: number;
        eventId: Id<"events">;
        representativeId: Id<"representatives">;
      },
      any
    >;
    adminRecordRepresentativePayout: FunctionReference<
      "mutation",
      "public",
      {
        adminUserId: string;
        amount: number;
        eventId: Id<"events">;
        markPaid?: boolean;
        notes?: string;
        representativeId: Id<"representatives">;
      },
      any
    >;
    adminGetEventCommissionSummary: FunctionReference<
      "query",
      "public",
      { adminUserId: string; eventId: Id<"events"> },
      any
    >;
    adminUpdateRepresentative: FunctionReference<
      "mutation",
      "public",
      {
        adminUserId: string;
        defaultCommissionRate?: number;
        email?: string;
        isActive?: boolean;
        name?: string;
        phone?: string;
        representativeId: Id<"representatives">;
      },
      any
    >;
    adminRemoveRepresentativeFromEvent: FunctionReference<
      "mutation",
      "public",
      {
        adminUserId: string;
        eventId: Id<"events">;
        representativeId: Id<"representatives">;
      },
      any
    >;
    adminUpdateRepresentativePayoutStatus: FunctionReference<
      "mutation",
      "public",
      {
        adminUserId: string;
        payoutId: Id<"representativePayouts">;
        status: "pending" | "paid";
      },
      any
    >;
    adminGetEventRepresentatives: FunctionReference<
      "query",
      "public",
      { adminUserId: string; eventId: Id<"events"> },
      any
    >;
    adminGetRepresentativePayoutsByEvent: FunctionReference<
      "query",
      "public",
      {
        adminUserId: string;
        eventId: Id<"events">;
        representativeId?: Id<"representatives">;
      },
      any
    >;
    getAdminOneSignalPlayerIds: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      any
    >;
    listAllOrganizations: FunctionReference<
      "query",
      "public",
      { limit?: number; searchTerm?: string; skip?: number; userId: string },
      any
    >;
    addSelfToOrganization: FunctionReference<
      "mutation",
      "public",
      { adminId: string; organizationId: Id<"organizations"> },
      any
    >;
    removeOrganizationMember: FunctionReference<
      "mutation",
      "public",
      { adminId: string; organizationId: Id<"organizations">; userId: string },
      any
    >;
    updateOrganizationMemberRole: FunctionReference<
      "mutation",
      "public",
      {
        adminId: string;
        newRole: "owner" | "admin" | "staff";
        organizationId: Id<"organizations">;
        userId: string;
      },
      any
    >;
    deleteOrganization: FunctionReference<
      "mutation",
      "public",
      { adminId: string; organizationId: Id<"organizations"> },
      any
    >;
    getEventsPageData: FunctionReference<
      "query",
      "public",
      { limit?: number; searchTerm?: string; skip?: number; userId: string },
      any
    >;
    getGlobalEventStats: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
  };
  customers: {
    create: FunctionReference<
      "mutation",
      "public",
      {
        customerId: string;
        email: string;
        provider: "pagarme" | "mercadopago";
        userId: string;
      },
      any
    >;
    getByUserIdAndProvider: FunctionReference<
      "query",
      "public",
      { provider: "pagarme" | "mercadopago"; userId: string },
      any
    >;
    getByUserId: FunctionReference<"query", "public", { userId: string }, any>;
  };
  eventLists: {
    getEventLists: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getEventListByPublicUrl: FunctionReference<
      "query",
      "public",
      { publicUrl: string },
      any
    >;
    getUserSubscription: FunctionReference<
      "query",
      "public",
      { listId: Id<"eventLists">; userId: string },
      any
    >;
    createEventList: FunctionReference<
      "mutation",
      "public",
      {
        description?: string;
        eventId: Id<"events">;
        isActive: boolean;
        listType: string;
        maxSubscriptions?: number;
        name: string;
        publicUrl: string;
        userId: string;
        validationUrl?: string;
      },
      any
    >;
    updateEventList: FunctionReference<
      "mutation",
      "public",
      {
        description?: string;
        isActive: boolean;
        listId: Id<"eventLists">;
        listType: string;
        maxSubscriptions?: number;
        name: string;
        publicUrl: string;
        validationUrl?: string;
      },
      any
    >;
    generateValidationUrl: FunctionReference<
      "mutation",
      "public",
      Record<string, never>,
      any
    >;
    addPersonToList: FunctionReference<
      "mutation",
      "public",
      {
        adminId: string;
        listId: Id<"eventLists">;
        personEmail?: string;
        personName: string;
        personPhone?: string;
      },
      any
    >;
    inviteValidator: FunctionReference<
      "mutation",
      "public",
      { inviterId: string; listId: Id<"eventLists">; validatorEmail: string },
      any
    >;
    checkInParticipant: FunctionReference<
      "mutation",
      "public",
      { listId: Id<"eventLists">; participantId: string; validatorId: string },
      any
    >;
    getEventListByValidationUrl: FunctionReference<
      "query",
      "public",
      { validationUrl: string },
      any
    >;
    checkValidatorPermission: FunctionReference<
      "query",
      "public",
      { userId: string; validationUrl: string },
      any
    >;
    deleteEventList: FunctionReference<
      "mutation",
      "public",
      { listId: Id<"eventLists"> },
      any
    >;
    subscribeToList: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events">; listId: Id<"eventLists">; userId: string },
      any
    >;
    getListSubscriptions: FunctionReference<
      "query",
      "public",
      { listId: Id<"eventLists"> },
      any
    >;
    getEventListById: FunctionReference<
      "query",
      "public",
      { listId: Id<"eventLists"> },
      any
    >;
    getListValidators: FunctionReference<
      "query",
      "public",
      { listId: Id<"eventLists"> },
      any
    >;
    removeValidator: FunctionReference<
      "mutation",
      "public",
      { adminId: string; validatorId: Id<"listValidators"> },
      any
    >;
    updateValidatorUserId: FunctionReference<
      "mutation",
      "public",
      { email: string; userId: string; validationUrl: string },
      any
    >;
  };
  paymentCards: {
    save: FunctionReference<
      "mutation",
      "public",
      {
        brand?: string;
        cardId: string;
        customerId: string;
        expMonth?: string;
        expYear?: string;
        holderName?: string;
        last4?: string;
        provider: "pagarme" | "mercadopago";
        userId: string;
      },
      any
    >;
    listByUserProvider: FunctionReference<
      "query",
      "public",
      { provider: "pagarme" | "mercadopago"; userId: string },
      any
    >;
    deleteByCardId: FunctionReference<
      "mutation",
      "public",
      { cardId: string },
      any
    >;
  };
  eventFeeSettings: {
    getEventFeeSettings: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getAllEventFeeSettingsByOrganization: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations"> },
      any
    >;
    upsertEventFeeSettings: FunctionReference<
      "mutation",
      "public",
      {
        cardFeePercentage?: number;
        eventId: Id<"events">;
        pixFeePercentage?: number;
        useCustomFees: boolean;
        userId: string;
      },
      any
    >;
    removeEventFeeSettings: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events"> },
      any
    >;
  };
  ticketActivation: {
    processAutomaticActivations: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    updateActivationSettings: FunctionReference<
      "mutation",
      "public",
      {
        settings?: {
          activateAt?: number;
          activationType: "manual" | "datetime" | "soldout" | "percentage";
          deactivateAt?: number;
          deactivationType?: "never" | "datetime" | "soldout";
          enabled: boolean;
          triggerPercentage?: number;
          triggerTicketTypeId?: Id<"ticketTypes">;
        };
        ticketTypeId: Id<"ticketTypes">;
      },
      any
    >;
    processEventActivationsAfterPurchase: FunctionReference<
      "mutation",
      "public",
      { eventId: Id<"events"> },
      any
    >;
  };
  disputes: {
    createOrUpdateFromWebhook: FunctionReference<
      "mutation",
      "public",
      {
        provider: "pagarme" | "mercadopago";
        providerEventType?: string;
        providerPayload?: any;
        transactionId: string;
      },
      any
    >;
    listDisputes: FunctionReference<
      "query",
      "public",
      {
        eventId?: Id<"events">;
        limit?: number;
        organizationId?: Id<"organizations">;
        status?: "open" | "won" | "lost" | "canceled";
        userId: string;
      },
      any
    >;
    getDisputeById: FunctionReference<
      "query",
      "public",
      { disputeId: Id<"disputes">; userId: string },
      any
    >;
    resolveDispute: FunctionReference<
      "mutation",
      "public",
      {
        disputeId: Id<"disputes">;
        outcome: "won" | "lost" | "canceled";
        resolutionNotes?: string;
        userId: string;
      },
      any
    >;
  };
  representatives: {
    createRepresentative: FunctionReference<
      "mutation",
      "public",
      {
        createdBy: string;
        defaultCommissionRate?: number;
        email?: string;
        name: string;
        phone?: string;
        userId: string;
      },
      any
    >;
    updateRepresentative: FunctionReference<
      "mutation",
      "public",
      {
        defaultCommissionRate?: number;
        email?: string;
        isActive?: boolean;
        name?: string;
        phone?: string;
        representativeId: Id<"representatives">;
      },
      any
    >;
    assignRepresentativeToEvent: FunctionReference<
      "mutation",
      "public",
      {
        assignedBy: string;
        commissionRate: number;
        eventId: Id<"events">;
        representativeId: Id<"representatives">;
      },
      any
    >;
    removeRepresentativeFromEvent: FunctionReference<
      "mutation",
      "public",
      {
        eventId: Id<"events">;
        removedBy: string;
        representativeId: Id<"representatives">;
      },
      any
    >;
    recordRepresentativePayout: FunctionReference<
      "mutation",
      "public",
      {
        amount: number;
        eventId: Id<"events">;
        markPaid?: boolean;
        notes?: string;
        recordedBy: string;
        representativeId: Id<"representatives">;
      },
      any
    >;
    updateRepresentativePayoutStatus: FunctionReference<
      "mutation",
      "public",
      { payoutId: Id<"representativePayouts">; status: "pending" | "paid" },
      any
    >;
    getEventCommissionSummary: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
      any
    >;
    getRepresentativeDashboardByUser: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
    getRepresentativeByUser: FunctionReference<
      "query",
      "public",
      { userId: string },
      any
    >;
  };
};
export type InternalApiType = {};
