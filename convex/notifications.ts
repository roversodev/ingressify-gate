import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const sendPush = internalAction({
  args: {
    playerIds: v.array(v.string()),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, { playerIds, title, message, data }) => {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!appId || !apiKey) {
      console.warn("OneSignal não configurado (ONESIGNAL_APP_ID/ONESIGNAL_REST_API_KEY ausentes).");
      return { ok: false, reason: "missing_env" };
    }

    if (!playerIds || playerIds.length === 0) {
      return { ok: false, reason: "no_players" };
    }

    try {
      const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          app_id: appId,
          include_player_ids: playerIds,
          headings: { pt: title, en: title },
          contents: { pt: message, en: message },
          data: data || {},
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Falha ao enviar notificação OneSignal:", { status: res.status, json });
        return { ok: false, status: res.status, json };
      }
      return { ok: true, json };
    } catch (error) {
      console.error("Erro ao chamar OneSignal:", error);
      return { ok: false, error: String(error) };
    }
  },
});