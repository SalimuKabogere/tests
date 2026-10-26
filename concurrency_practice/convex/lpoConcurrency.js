import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

export const seed = mutation({
  args: { amount: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("lpos", { amount: args.amount });
  },
});

export const summary = query({
  args: { lpoId: v.id("lpos") },
  handler: async (ctx, args) => {
    const lpo = await ctx.db.get(args.lpoId);
    if (!lpo) {
      throw new Error(`LPO with id ${args.lpoId} not found`);
    }
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_lpoId", (q) => q.eq("lpoId", args.lpoId))
      .take(1000);

    return {
      amount: lpo.amount,
      invoiceCount: invoices.length,
      committed: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    };
  },
});

export const investNoCheck = mutation({
  args: { lpoId: v.id("lpos"), investor: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    const lpo = await ctx.db.get(args.lpoId);
    if (!lpo) throw new ConvexError(`LPO with id ${args.lpoId} not found`);

    return await ctx.db.insert("invoices", {
      lpoId: args.lpoId,
      investor: args.investor,
      amount: args.amount,
    });
  },
});

export const investWithCheck = mutation({
  args: { lpoId: v.id("lpos"), investor: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    // get the LPO
    const lpo = await ctx.db.get(args.lpoId);
    if (!lpo) throw new ConvexError(`LPO with id ${args.lpoId} not found`);

    // get the invoices for this LPO
    // this is the key line for the parallel test, if any other caller inserts into this range
    // before this one commits, this call conflicts and it is retried
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_lpoId", (q) => q.eq("lpoId", args.lpoId))
      .take(1000);
    
    // add up what is already claimed
    const committed = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);

    // workout whats left and enforce the rule
    const available = lpo.amount - committed;
    if (args.amount > available) {
      throw new ConvexError(
        `LPO with id ${args.lpoId} only has ${available} available, but ${args.amount} was requested`
      );
    }

    // insert the invoice
    return await ctx.db.insert("invoices", {
      lpoId: args.lpoId,
      investor: args.investor,
      amount: args.amount,
    });
  },
});
