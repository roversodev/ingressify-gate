import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Criar cupom
export const createCoupon = mutation({
  args: {
    eventId: v.id("events"),
    code: v.string(),
    name: v.string(),
    discountType: v.union(v.literal("percentage"), v.literal("fixed"), v.literal("custom")),
    discountValue: v.number(),
    maxUses: v.optional(v.number()),
    validFrom: v.number(),
    validUntil: v.number(),
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
  },
  handler: async (ctx, args) => {
    // Verificar se o código já existe para este evento
    const existingCoupon = await ctx.db
      .query("coupons")
      .withIndex("by_event_code", (q) => 
        q.eq("eventId", args.eventId).eq("code", args.code)
      )
      .first();

    if (existingCoupon) {
      throw new Error("Código do cupom já existe para este evento");
    }

    const couponId = await ctx.db.insert("coupons", {
      ...args,
      currentUses: 0,
      isActive: true,
      createdAt: Date.now(),
    });

    return couponId;
  },
});

// Validar cupom
export const validateCoupon = query({
  args: {
    eventId: v.id("events"),
    code: v.string(),
    purchaseAmount: v.number(),
    ticketSelections: v.array(v.object({
      ticketTypeId: v.id("ticketTypes"),
      quantity: v.number()
    })),
  },
  handler: async (ctx, { eventId, code, purchaseAmount, ticketSelections }) => {
    // Declarar a variável discountAmount no início da função
    let discountAmount = 0;
    
    const coupon = await ctx.db
      .query("coupons")
      .withIndex("by_event_code", (q) => 
        q.eq("eventId", eventId).eq("code", code)
      )
      .first();

    if (!coupon) {
      return { valid: false, error: "Cupom não encontrado" };
    }

    if (!coupon.isActive) {
      return { valid: false, error: "Cupom inativo" };
    }

    const now = Date.now();
    if (now < coupon.validFrom || now > coupon.validUntil) {
      return { valid: false, error: "Cupom fora do período de validade" };
    }

    if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
      return { valid: false, error: "Cupom esgotado" };
    }

    if (coupon.minPurchaseAmount && purchaseAmount < coupon.minPurchaseAmount) {
      return { 
        valid: false, 
        error: `Valor mínimo de compra: R$ ${coupon.minPurchaseAmount}` 
      };
    }

    // Verificar tipos de ingresso aplicáveis
    if (coupon.applicableTicketTypes && coupon.applicableTicketTypes.length > 0) {
      const hasApplicableTicket = ticketSelections.some(selection => 
        coupon.applicableTicketTypes!.includes(selection.ticketTypeId)
      );
      if (!hasApplicableTicket) {
        return { 
          valid: false, 
          error: "Cupom não aplicável aos ingressos selecionados" 
        };
      }
    }

    // Verificação para promoções personalizadas
    if (coupon.discountType === "custom" && coupon.promotionType && coupon.promotionRules) {
      // Promoção "Compre X Leve Y" (como o LEVE4)
      if (coupon.promotionType === "buyXgetY") {
        const { minQuantity, targetQuantity, sameTicketType } = coupon.promotionRules;
        
        // Verificar se minQuantity e targetQuantity estão definidos
        if (!minQuantity || !targetQuantity) {
          return { valid: false, error: "Configuração de promoção inválida" };
        }
        
        if (sameTicketType) {
          // Verificar se há pelo menos um tipo de ingresso com a quantidade exata
          const hasRequiredQuantity = ticketSelections.some(selection => 
            selection.quantity === targetQuantity
          );
          
          if (!hasRequiredQuantity) {
            return {
              valid: false,
              error: `É necessário selecionar exatamente ${targetQuantity} ingressos do mesmo tipo para esta promoção`
            };
          }
        } else {
          // Verificar se a quantidade total atinge o mínimo
          const totalQuantity = ticketSelections.reduce((sum, selection) => sum + selection.quantity, 0);
          
          if (totalQuantity < targetQuantity) {
            return {
              valid: false,
              error: `É necessário selecionar pelo menos ${targetQuantity} ingressos para esta promoção`
            };
          }
        }
        
        // Calcular o desconto (preço de minQuantity ingressos dividido por targetQuantity)
        // Exemplo: Compre 3, Leve 4 = desconto de 25%
        const discountPercentage = ((targetQuantity - minQuantity) / targetQuantity) * 100;
        discountAmount = (purchaseAmount * discountPercentage) / 100;
      }
      
      // Promoção "Desconto por Quantidade Mínima"
      else if (coupon.promotionType === "minQuantity") {
        const { minQuantity, discountPercentage } = coupon.promotionRules;
        
        // Verificar se minQuantity e discountPercentage estão definidos
        if (!minQuantity || !discountPercentage) {
          return { valid: false, error: "Configuração de promoção inválida" };
        }
        
        // Verificar se a quantidade total atinge o mínimo
        const totalQuantity = ticketSelections.reduce((sum, selection) => sum + selection.quantity, 0);
        
        if (totalQuantity < minQuantity) {
          return {
            valid: false,
            error: `É necessário selecionar pelo menos ${minQuantity} ingressos para esta promoção`
          };
        }
        
        // Aplicar o desconto percentual
        discountAmount = (purchaseAmount * discountPercentage) / 100;
      }
      
      // Outros tipos de promoção podem ser implementados aqui
    }
    // Verificação especial para promoção "LEVE4" (manter para compatibilidade)
    else if (code === "LEVE4") {
      // Verificar se há exatamente 4 ingressos do mesmo tipo
      const hasExactlyFour = ticketSelections.some(selection => selection.quantity === 4);
      
      if (!hasExactlyFour) {
        return {
          valid: false,
          error: "É necessário selecionar exatamente 4 ingressos do mesmo tipo para esta promoção"
        };
      }
      
      // Adicionar cálculo de desconto para LEVE4 (25% de desconto)
      discountAmount = (purchaseAmount * 25) / 100;
    }
    // Cálculo padrão para cupons normais
    else {
      if (coupon.discountType === "percentage") {
        discountAmount = (purchaseAmount * coupon.discountValue) / 100;
      } else {
        discountAmount = Math.min(coupon.discountValue, purchaseAmount);
      }
    }

    return {
      valid: true,
      coupon,
      discountAmount,
      finalAmount: purchaseAmount - discountAmount,
    };
  },
});

// Usar cupom (incrementar contador)
export const useCoupon = mutation({
  args: { couponId: v.id("coupons") },
  handler: async (ctx, { couponId }) => {
    const coupon = await ctx.db.get(couponId);
    if (!coupon) throw new Error("Cupom não encontrado");

    await ctx.db.patch(couponId, {
      currentUses: coupon.currentUses + 1,
    });
  },
});

// Incrementar uso do cupom por código (usado pelos webhooks)
export const incrementCouponUsage = mutation({
  args: { 
    eventId: v.id("events"),
    couponCode: v.string() 
  },
  handler: async (ctx, { eventId, couponCode }) => {
    const coupon = await ctx.db
      .query("coupons")
      .withIndex("by_event_code", (q) => 
        q.eq("eventId", eventId).eq("code", couponCode)
      )
      .first();

    if (!coupon) {
      console.log(`Cupom não encontrado: ${couponCode} para evento ${eventId}`);
      return;
    }

    await ctx.db.patch(coupon._id, {
      currentUses: coupon.currentUses + 1,
    });

    console.log(`✅ Uso do cupom ${couponCode} incrementado. Usos atuais: ${coupon.currentUses + 1}`);
  },
});

// Listar cupons de um evento
export const getEventCoupons = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return await ctx.db
      .query("coupons")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
  },
});

// Atualizar cupom
export const updateCoupon = mutation({
  args: {
    couponId: v.id("coupons"),
    name: v.optional(v.string()),
    discountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"), v.literal("custom"))),
    discountValue: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
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
  },
  handler: async (ctx, { couponId, ...updates }) => {
    const coupon = await ctx.db.get(couponId);
    if (!coupon) {
      throw new Error("Cupom não encontrado");
    }

    await ctx.db.patch(couponId, updates);
    return { success: true };
  },
});

// Deletar cupom
export const deleteCoupon = mutation({
  args: { couponId: v.id("coupons") },
  handler: async (ctx, { couponId }) => {
    const coupon = await ctx.db.get(couponId);
    if (!coupon) {
      throw new Error("Cupom não encontrado");
    }

    // Verificar se o cupom está sendo usado por algum promoter
    const promoters = await ctx.db
      .query("promoters")
      .withIndex("by_event", (q) => q.eq("eventId", coupon.eventId))
      .filter((q) => q.eq(q.field("couponCode"), coupon.code))
      .collect();

    // Se estiver sendo usado, atualizar os promoters
    for (const promoter of promoters) {
      await ctx.db.patch(promoter._id, {
        hasCoupon: false,
        couponCode: undefined,
      });
    }

    // Deletar o cupom
    await ctx.db.delete(couponId);

    return { 
      success: true, 
      affectedPromoters: promoters.length,
    };
  },
});