import { defineTable, defineSchema } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    lpos: defineTable({
        amount: v.number(),
    }),
    invoices: defineTable({
        lpoId: v.id("lpos"),
        investor: v.string(),
        amount: v.number(),
    }).index("by_lpoId", ["lpoId"]),
});
