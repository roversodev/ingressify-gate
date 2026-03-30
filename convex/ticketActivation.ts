import { v } from "convex/values"
import { mutation, query, internalMutation } from "./_generated/server"

// Função interna para processar ativações de todos os eventos
export const processAllEventActivations = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Buscar todos os eventos ativos
    const events = await ctx.db.query("events").collect()
    
    for (const event of events) {
      if (event.is_cancelled) continue
      
      // Processar ativações para cada evento
      await processAutomaticActivations(ctx, { eventId: event._id })
    }
  }
})

// Função para verificar e processar ativações automáticas
export const processAutomaticActivations = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()

    const lots = await ctx.db
      .query("ticketLots")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()

    const now = Date.now()
    const updates = []

    for (const ticketType of ticketTypes) {
      if (!ticketType.activationSettings?.enabled) continue

      const settings = ticketType.activationSettings
      let shouldActivate = false
      let shouldDeactivate = false

      // Verificar ativação
      if (!ticketType.isActive) {
        switch (settings.activationType) {
          case "datetime":
            if (settings.activateAt && now >= settings.activateAt) {
              shouldActivate = true
            }
            break

          case "soldout":
            if (settings.triggerTicketTypeId) {
              const triggerType = ticketTypes.find(t => t._id === settings.triggerTicketTypeId)
              if (triggerType && triggerType.availableQuantity === 0) {
                shouldActivate = true
              }
            }
            break

          case "percentage":
            if (settings.triggerTicketTypeId && settings.triggerPercentage) {
              const triggerType = ticketTypes.find(t => t._id === settings.triggerTicketTypeId)
              if (triggerType) {
                const soldPercentage = ((triggerType.totalQuantity - triggerType.availableQuantity) / triggerType.totalQuantity) * 100
                if (soldPercentage >= settings.triggerPercentage) {
                  shouldActivate = true
                }
              }
            }
            break
        }
      }

      // Verificar desativação
      if (ticketType.isActive) {
        switch (settings.deactivationType) {
          case "datetime":
            if (settings.deactivateAt && now >= settings.deactivateAt) {
              shouldDeactivate = true
            }
            break

          case "soldout":
            if (ticketType.availableQuantity === 0) {
              shouldDeactivate = true
            }
            break
        }
      }

      // Aplicar mudanças
      if (shouldActivate && !ticketType.isActive) {
        await ctx.db.patch(ticketType._id, { isActive: true })
        updates.push({ ticketTypeId: ticketType._id, action: "activated" })
      }

      if (shouldDeactivate && ticketType.isActive) {
        await ctx.db.patch(ticketType._id, { isActive: false })
        updates.push({ ticketTypeId: ticketType._id, action: "deactivated" })
      }
    }

    for (const lot of lots) {
      if (!(lot as any).activationSettings?.enabled) continue

      const settings = (lot as any).activationSettings
      const lotIsActive = (lot as any).isActive !== false
      let shouldActivate = false
      let shouldDeactivate = false

      if (!lotIsActive) {
        switch (settings.activationType) {
          case "datetime":
            if (settings.activateAt && now >= settings.activateAt) shouldActivate = true
            break
          case "soldout": {
            if (settings.triggerTicketTypeId) {
              const triggerType = ticketTypes.find((t) => t._id === settings.triggerTicketTypeId)
              if (triggerType && triggerType.availableQuantity === 0) shouldActivate = true
            }
            break
          }
          case "percentage": {
            if (settings.triggerTicketTypeId && settings.triggerPercentage) {
              const triggerType = ticketTypes.find((t) => t._id === settings.triggerTicketTypeId)
              if (triggerType && triggerType.totalQuantity > 0) {
                const soldPercentage =
                  ((triggerType.totalQuantity - triggerType.availableQuantity) / triggerType.totalQuantity) * 100
                if (soldPercentage >= settings.triggerPercentage) shouldActivate = true
              }
            }
            break
          }
        }
      }

      if (lotIsActive) {
        switch (settings.deactivationType) {
          case "datetime":
            if (settings.deactivateAt && now >= settings.deactivateAt) shouldDeactivate = true
            break
          case "soldout": {
            const lotAvailable = ticketTypes
              .filter((t: any) => t.lotId === lot._id)
              .reduce((sum: number, t: any) => sum + (t.availableQuantity || 0), 0)
            if (lotAvailable === 0) shouldDeactivate = true
            break
          }
        }
      }

      if (shouldActivate && !lotIsActive) {
        await ctx.db.patch(lot._id, { isActive: true })
        const lotTicketTypes = ticketTypes.filter((t: any) => t.lotId === lot._id)
        for (const tt of lotTicketTypes) {
          await ctx.db.patch(tt._id, { isActive: true })
        }
        updates.push({ lotId: lot._id, action: "activated" })
      }

      if (shouldDeactivate && lotIsActive) {
        await ctx.db.patch(lot._id, { isActive: false })
        const lotTicketTypes = ticketTypes.filter((t: any) => t.lotId === lot._id)
        for (const tt of lotTicketTypes) {
          await ctx.db.patch(tt._id, { isActive: false })
        }
        updates.push({ lotId: lot._id, action: "deactivated" })
      }
    }

    console.log("updates: ", updates)

    return updates
  },
})

// Função para atualizar configurações de ativação
export const updateActivationSettings = mutation({
  args: {
    ticketTypeId: v.id("ticketTypes"),
    settings: v.optional(v.object({
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
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ticketTypeId, {
      activationSettings: args.settings,
    })
  },
})


// Função específica para processar ativações de um evento após compra bem-sucedida
export const processEventActivationsAfterPurchase = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    console.log(`🎫 Processando ativações automáticas para evento ${args.eventId} após compra`);
    
    const ticketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()

    const lots = await ctx.db
      .query("ticketLots")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect()

    const now = Date.now()
    const updates = []

    for (const ticketType of ticketTypes) {
      if (!ticketType.activationSettings?.enabled) continue

      const settings = ticketType.activationSettings
      let shouldActivate = false
      let shouldDeactivate = false

      // Verificar ativação
      if (!ticketType.isActive) {
        switch (settings.activationType) {
          case "datetime":
            if (settings.activateAt && now >= settings.activateAt) {
              shouldActivate = true
            }
            break

          case "soldout":
            if (settings.triggerTicketTypeId) {
              const triggerType = ticketTypes.find(t => t._id === settings.triggerTicketTypeId)
              if (triggerType && triggerType.availableQuantity === 0) {
                shouldActivate = true
              }
            }
            break

          case "percentage":
            if (settings.triggerTicketTypeId && settings.triggerPercentage) {
              const triggerType = ticketTypes.find(t => t._id === settings.triggerTicketTypeId)
              if (triggerType) {
                const soldPercentage = ((triggerType.totalQuantity - triggerType.availableQuantity) / triggerType.totalQuantity) * 100
                if (soldPercentage >= settings.triggerPercentage) {
                  shouldActivate = true
                }
              }
            }
            break
        }
      }

      // Verificar desativação
      if (ticketType.isActive && settings.deactivationType) {
        switch (settings.deactivationType) {
          case "datetime":
            if (settings.deactivateAt && now >= settings.deactivateAt) {
              shouldDeactivate = true
            }
            break

          case "soldout":
            if (ticketType.availableQuantity === 0) {
              shouldDeactivate = true
            }
            break
        }
      }

      // Aplicar mudanças
      if (shouldActivate && !shouldDeactivate) {
        await ctx.db.patch(ticketType._id, { isActive: true })
        updates.push({ ticketTypeId: ticketType._id, action: "activated", name: ticketType.name })
        console.log(`✅ Tipo de ingresso ativado: ${ticketType.name}`)
      } else if (shouldDeactivate) {
        await ctx.db.patch(ticketType._id, { isActive: false })
        updates.push({ ticketTypeId: ticketType._id, action: "deactivated", name: ticketType.name })
        console.log(`❌ Tipo de ingresso desativado: ${ticketType.name}`)
      }
    }

    for (const lot of lots) {
      if (!(lot as any).activationSettings?.enabled) continue

      const settings = (lot as any).activationSettings
      const lotIsActive = (lot as any).isActive !== false
      let shouldActivate = false
      let shouldDeactivate = false

      if (!lotIsActive) {
        switch (settings.activationType) {
          case "datetime":
            if (settings.activateAt && now >= settings.activateAt) shouldActivate = true
            break
          case "soldout": {
            if (settings.triggerTicketTypeId) {
              const triggerType = ticketTypes.find((t) => t._id === settings.triggerTicketTypeId)
              if (triggerType && triggerType.availableQuantity === 0) shouldActivate = true
            }
            break
          }
          case "percentage": {
            if (settings.triggerTicketTypeId && settings.triggerPercentage) {
              const triggerType = ticketTypes.find((t) => t._id === settings.triggerTicketTypeId)
              if (triggerType && triggerType.totalQuantity > 0) {
                const soldPercentage =
                  ((triggerType.totalQuantity - triggerType.availableQuantity) / triggerType.totalQuantity) * 100
                if (soldPercentage >= settings.triggerPercentage) shouldActivate = true
              }
            }
            break
          }
        }
      }

      if (lotIsActive && settings.deactivationType) {
        switch (settings.deactivationType) {
          case "datetime":
            if (settings.deactivateAt && now >= settings.deactivateAt) shouldDeactivate = true
            break
          case "soldout": {
            const lotAvailable = ticketTypes
              .filter((t: any) => t.lotId === lot._id)
              .reduce((sum: number, t: any) => sum + (t.availableQuantity || 0), 0)
            if (lotAvailable === 0) shouldDeactivate = true
            break
          }
        }
      }

      if (shouldActivate && !shouldDeactivate && !lotIsActive) {
        await ctx.db.patch(lot._id, { isActive: true })
        const lotTicketTypes = ticketTypes.filter((t: any) => t.lotId === lot._id)
        for (const tt of lotTicketTypes) {
          await ctx.db.patch(tt._id, { isActive: true })
        }
        updates.push({ lotId: lot._id, action: "activated", name: lot.name })
        console.log(`✅ Setor ativado: ${lot.name}`)
      } else if (shouldDeactivate && lotIsActive) {
        await ctx.db.patch(lot._id, { isActive: false })
        const lotTicketTypes = ticketTypes.filter((t: any) => t.lotId === lot._id)
        for (const tt of lotTicketTypes) {
          await ctx.db.patch(tt._id, { isActive: false })
        }
        updates.push({ lotId: lot._id, action: "deactivated", name: lot.name })
        console.log(`❌ Setor desativado: ${lot.name}`)
      }
    }

    console.log(`🎫 Processamento de ativações concluído para evento ${args.eventId}. ${updates.length} alterações realizadas.`)
    return { success: true, updates }
  }
})
