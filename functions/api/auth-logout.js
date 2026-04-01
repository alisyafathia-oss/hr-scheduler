// functions/api/auth-logout.js
// GET /api/auth-logout — clears the session cookie and redirects to home.

import { injectEnv } from "../_compat.js";
import _auth from "../../src/lib/auth.js";
const { clearSessionCookie } = _auth;

export async function onRequest({ env }) {
  injectEnv(env);
  return new Response(null, {
    status: 302,
    headers: {
      Location: process.env.APP_URL || "/",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}
