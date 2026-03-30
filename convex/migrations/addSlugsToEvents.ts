import { mutation } from ".././_generated/server";
import { v } from "convex/values";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export const addSlugsToExistingEvents = mutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    
    for (const event of events) {
      if (!event.slug) {
        let slug = generateSlug(event.name);
        let counter = 1;
        
        // Verificar se slug já existe
        while (await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) {
          slug = `${generateSlug(event.name)}-${counter}`;
          counter++;
        }
        
        await ctx.db.patch(event._id, { slug });
      }
    }
    
    return { success: true, message: "Slugs adicionados com sucesso" };
  },
});