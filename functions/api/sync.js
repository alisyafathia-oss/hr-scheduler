// functions/api/sync.js
// POST /api/sync — manual schedule sync, HR admin only.

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../_compat.js";
import _auth from "../../src/lib/auth.js";
import _sync from "../../src/lib/sync.js";

const { requireRole } = _auth;
const { runSync } = _sync;

async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { error } = requireRole(event, "hr_admin");
  if (error) return error;

  try {
    const result = await runSync();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (err) {
    console.error("Manual sync error:", err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
