/**
 * Webhook Clerk → Convex: upsert `users` + vincular tickets `__pending_courtesy__` por e-mail.
 *
 * Dashboard Clerk → Webhooks → URL: https://<seu_deployment>.convex.site/clerk-webhook
 * Eventos: user.created, user.updated, session.created
 *
 * Variáveis no projeto Convex (npx convex env set …):
 * - CLERK_WEBHOOK_SIGNING_SECRET  (Signing secret whsec_… do endpoint)
 * - CLERK_SECRET_KEY              (sk_… / Secret key — necessária para session.created,
 *   pois a sessão não traz e-mail; chama a API users para obter o e-mail a cada login)
 */
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

type ClerkUserLike = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{ id: string; email_address: string }>;
};

function extractName(data: ClerkUserLike): string {
  const n = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
  return n || "Usuário";
}

function extractPrimaryEmail(data: ClerkUserLike): string {
  const addresses = data.email_addresses;
  if (!addresses?.length) return "";

  const primaryId = data.primary_email_address_id;
  if (primaryId) {
    const primary = addresses.find((e) => e.id === primaryId);
    if (primary?.email_address) return primary.email_address;
  }
  return addresses[0].email_address ?? "";
}

async function fetchClerkUserById(
  userId: string
): Promise<ClerkUserLike | null> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    return null;
  }
  const res = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) {
    const text = await res.text();
    console.error("Clerk API GET /users error:", res.status, text);
    return null;
  }
  return (await res.json()) as ClerkUserLike;
}

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!secret) {
      console.error("CLERK_WEBHOOK_SIGNING_SECRET não definido no ambiente Convex");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const body = await request.text();
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing svix headers", { status: 400 });
    }

    let event: { type: string; data: any };
    try {
      const wh = new Webhook(secret);
      event = wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as { type: string; data: any };
    } catch (err) {
      console.error("Falha na verificação do webhook Clerk (svix):", err);
      return new Response("Invalid signature", { status: 400 });
    }

    // user.* — payload completo com e-mail
    if (event.type === "user.created" || event.type === "user.updated") {
      const data = event.data as ClerkUserLike;
      const userId = data.id;
      const email = extractPrimaryEmail(data);
      if (userId && email) {
        await ctx.runMutation(internal.users.syncFromClerkWebhook, {
          userId,
          name: extractName(data),
          email,
        });
      }
      return new Response(null, { status: 200 });
    }

    // Cada login — usuário pode já existir; cortesia pode ter chegado depois do cadastro
    if (event.type === "session.created") {
      const d = event.data;
      const userId =
        typeof d?.user_id === "string"
          ? d.user_id
          : typeof d?.userId === "string"
            ? d.userId
            : null;

      if (!userId) {
        return new Response(null, { status: 200 });
      }

      if (!process.env.CLERK_SECRET_KEY) {
        console.warn(
          "session.created: defina CLERK_SECRET_KEY no Convex para vincular cortesias a cada login sem atualizar o app"
        );
        return new Response(null, { status: 200 });
      }

      const user = await fetchClerkUserById(userId);
      if (!user) {
        return new Response(null, { status: 200 });
      }

      const email = extractPrimaryEmail(user);
      if (email) {
        await ctx.runMutation(internal.users.syncFromClerkWebhook, {
          userId: user.id,
          name: extractName(user),
          email,
        });
      }
      return new Response(null, { status: 200 });
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
