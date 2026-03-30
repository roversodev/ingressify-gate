import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const create = mutation({
  args: {
    transactionId: v.string(),
    eventId: v.id("events"),
    userId: v.string(),
    customerId: v.string(),
    amount: v.number(),
    status: v.string(),
    paymentMethod: v.string(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("transactions", {
      ...args,
      createdAt: Date.now(), // Adicionar o timestamp atual
    });
  },
});

export const getByTransactionId = query({
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
      
    return transaction;
  },
});

export const updateStatus = mutation({
  args: {
    transactionId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", args.transactionId))
      .first();
    if (!tx) throw new Error("Transação não encontrada");
    await ctx.db.patch(tx._id, { status: args.status });
  },
});



// export const deleteTransactionsByEvent = mutation({
//   args: {
//     eventId: v.id("events"),
//   },
//   handler: async (ctx, { eventId }) => {
//     // Buscar todas as transações do evento
//     const transactions = await ctx.db
//       .query("transactions")
//       .withIndex("by_event", (q) => q.eq("eventId", eventId))
//       .collect();
    
//     console.log(`Encontradas ${transactions.length} transações para deletar`);
    
//     // Deletar cada transação
//     for (const transaction of transactions) {
//       await ctx.db.delete(transaction._id);
//       console.log(`Transação deletada: ${transaction._id} - ${transaction.transactionId}`);
//     }
    
//     console.log(`Todas as ${transactions.length} transações do evento ${eventId} foram deletadas`);
    
//     return {
//       deletedCount: transactions.length,
//       eventId: eventId,
//       deletedTransactions: transactions.map(t => ({
//         id: t._id,
//         transactionId: t.transactionId,
//         amount: t.amount,
//         status: t.status
//       }))
//     };
//   },
// });


export const updateMetadata = mutation({
  args: {
    transactionId: v.string(),
    metadata: v.any(),
  },
  handler: async (ctx, { transactionId, metadata }) => {
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", transactionId))
      .first();
    if (!tx) throw new Error("Transação não encontrada");

    await ctx.db.patch(tx._id, {
      metadata: {
        ...(tx.metadata ?? {}),
        ...(metadata ?? {}),
      },
    });
  },
});



export const updateNetAmounts = mutation({
  args: {
    transactionId: v.string(),
    netReceivedAmount: v.number(),
  },
  handler: async (ctx, { transactionId, netReceivedAmount }) => {
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", transactionId))
      .first();
    if (!tx) throw new Error("Transação não encontrada");
    await ctx.db.patch(tx._id, { netReceivedAmount });
  },
});

export const upsertAbandonedCart = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerCpf: v.optional(v.string()),
    ticketSelections: v.any(),
    totalAmount: v.number(),
    step: v.string(),
  },
  handler: async (ctx, args) => {
    // Tenta encontrar um carrinho existente para este usuário/email neste evento que esteja "active"
    let existingCart = null;
    
    // Preparar dados do cliente, buscando do cadastro se necessário
    let { customerName, customerPhone, customerCpf } = args;

    if (args.customerEmail && (!customerPhone || !customerCpf)) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.customerEmail!))
        .first();

      if (user) {
        if (!customerPhone && user.phone) customerPhone = user.phone;
        if (!customerCpf && user.cpf) customerCpf = user.cpf;
        if (!customerName && user.name) customerName = user.name;
      }
    }
    
    if (args.customerEmail) {
      existingCart = await ctx.db
        .query("abandonedCarts")
        .withIndex("by_email", (q) => q.eq("customerEmail", args.customerEmail))
        .filter((q) => 
          q.and(
            q.eq(q.field("eventId"), args.eventId),
            q.eq(q.field("status"), "active")
          )
        )
        .first();
    }

    const now = Date.now();

    if (existingCart) {
      await ctx.db.patch(existingCart._id, {
        ticketSelections: args.ticketSelections,
        totalAmount: args.totalAmount,
        step: args.step,
        lastUpdatedAt: now,
        // Atualiza dados de contato se fornecidos ou enriquecidos
        customerName: customerName ?? existingCart.customerName,
        customerPhone: customerPhone ?? existingCart.customerPhone,
        customerCpf: customerCpf ?? existingCart.customerCpf,
        userId: args.userId ?? existingCart.userId,
      });
      return existingCart._id;
    } else {
      return await ctx.db.insert("abandonedCarts", {
        eventId: args.eventId,
        userId: args.userId,
        customerEmail: args.customerEmail,
        customerName: customerName,
        customerPhone: customerPhone,
        customerCpf: customerCpf,
        ticketSelections: args.ticketSelections,
        totalAmount: args.totalAmount,
        step: args.step,
        lastUpdatedAt: now,
        status: "active",
      });
    }
  },
});

export const markCartAsRecovered = mutation({
  args: {
    customerEmail: v.string(),
    eventId: v.id("events"),
    transactionId: v.string(),
  },
  handler: async (ctx, args) => {
    // Busca carrinhos ativos deste email para este evento
    const activeCarts = await ctx.db
      .query("abandonedCarts")
      .withIndex("by_email", (q) => q.eq("customerEmail", args.customerEmail))
      .filter((q) => 
        q.and(
          q.eq(q.field("eventId"), args.eventId),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();

    // Define um tempo mínimo para considerar como abandono real (ex: 5 minutos)
    // Se a compra ocorrer muito rápido após a última atualização do carrinho,
    // provavelmente foi uma compra direta, não uma recuperação.
    // Mas se o carrinho foi criado há mais tempo, é uma recuperação.
    const ABANDONMENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutos
    const now = Date.now();

    for (const cart of activeCarts) {
      // Se o carrinho foi atualizado há mais de X minutos, consideramos recuperado
      // Se foi atualizado agora pouco, consideramos que foi a sessão de compra atual que teve sucesso
      // e portanto não deve contar como "abandonado e depois recuperado", mas sim "convertido".
      // Para fins de limpeza, podemos marcar como "converted" ou deletar.
      // Vamos assumir que se passou do threshold é recuperação, senão é conversão direta.
      
      const timeDiff = now - cart.lastUpdatedAt;
      
      if (timeDiff > ABANDONMENT_THRESHOLD_MS) {
        await ctx.db.patch(cart._id, {
          status: "recovered",
          recoveredTransactionId: args.transactionId,
          lastUpdatedAt: now,
        });
      } else {
        // Conversão direta (não foi abandono real), apenas finalizamos para não ficar pendente
        // Poderíamos usar um status "converted" se quiséssemos distinguir nos relatórios
        // Por enquanto vamos deletar ou marcar como recovered mas sabendo que foi imediato?
        // O cliente pediu para não marcar como recuperado se for compra direta.
        // Então vamos mudar o status para "converted" (precisa atualizar schema) ou deletar.
        // Vamos optar por deletar para limpar, ou criar status novo.
        // Melhor: vamos atualizar o status para 'converted' (precisa ajustar schema)
        // Como o schema tem union literal, vamos usar 'recovered' mas adicionar flag ou apenas deletar.
        // Se deletarmos, perdemos a métrica de funil.
        // Vamos marcar como 'recovered' mas adicionar um campo metadata ou simplesmente aceitar que recuperado = vendido.
        // O receio do usuário é inflar "carrinhos abandonados recuperados".
        // Se o cara entrou, preencheu e pagou em 2 min, NÃO é abandono recuperado.
        // Então nesse caso, vamos DELETAR o registro de abandono, pois ele não abandonou.
        await ctx.db.delete(cart._id);
      }
    }
  },
});