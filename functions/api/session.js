// functions/api/session.js
// GET /api/session — returns the current session (authenticated: true/false).

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../_compat.js";
import _auth from "../../src/lib/auth.js";
const { getSession } = _auth;

async function handler(event) {
  const session = getSession(event);
  if (!session) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authenticated: false }),
    };
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authenticated: true,
      email: session.workEmail || session.email || "",
      name: session.name,
      picture: session.picture,
      role: session.role,
      employeeId: session.employeeId,
    }),
  };
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
