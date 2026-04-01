// functions/api/internal/sync.js
// POST /api/internal/sync — scheduled sync endpoint called by GitHub Actions.
// Protected by CRON_SECRET header instead of a session cookie.
// Set CRON_SECRET in Cloudflare Pages environment variables and in GitHub Actions secrets.

import { injectEnv } from "../../_compat.js";
import _sync from "../../../src/lib/sync.js";
const { runSync } = _sync;

export async function onRequest({ request, env }) {
  injectEnv(env);

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const result = await runSync();
    console.log("[scheduled-sync] Done:", result);
    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[scheduled-sync] Error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
