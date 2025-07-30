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
        discountType: "percentage" | "fixed";
        discountValue: number;
        eventId: Id<"events">;
        maxUses?: number;
        minPurchaseAmount?: number;
        name: string;
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
        ticketTypeIds: Array<Id<"ticketTypes">>;
      },
      any
    >;
    useCoupon: FunctionReference<
      "mutation",
      "public",
      { couponId: Id<"coupons"> },
      any
    >;
    getEventCoupons: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
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
    getBySlug: FunctionReference<"query", "public", { slug: string }, any>;
    purchaseMultipleTickets: FunctionReference<
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
        latitude?: number;
        location: string;
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
        stripeSessionId: string;
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
    getEventTicketHolders: FunctionReference<
      "query",
      "public",
      { eventId: Id<"events"> },
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
        responsibleDocument: string;
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
        organizationId: Id<"organizations">;
        pixKeyIndex: number;
        userId: string;
      },
      any
    >;
    getOrganizationWithdrawals: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations">; userId: string },
      any
    >;
    getOrganizationDemographicStats: FunctionReference<
      "query",
      "public",
      { organizationId: Id<"organizations">; userId: string },
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
    createTicketType: FunctionReference<
      "mutation",
      "public",
      {
        description?: string;
        eventId: Id<"events">;
        isCourtesy?: boolean;
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
        description?: string;
        isCourtesy?: boolean;
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
    getById: FunctionReference<
      "query",
      "public",
      { ticketTypeId: Id<"ticketTypes"> },
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
    getTicketsByStripeSession: FunctionReference<
      "query",
      "public",
      { stripeSessionId: string },
      any
    >;
    getTicketsByStripeSessionWithDetails: FunctionReference<
      "query",
      "public",
      { stripeSessionId: string },
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
    getPendingTransferForTicket: FunctionReference<
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
  };
};
export type InternalApiType = {};
