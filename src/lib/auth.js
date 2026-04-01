// src/lib/auth.js  (v3)
// ─────────────────────────────────────────────────────────────────────────
// Two login paths:
//
//   HR Admin    → email + password  (email defined in HR_ADMIN_EMAILS env var)
//   Team Head   → Employee_ID only  (no password)
//   Employee    → Employee_ID only  (no password)
//
// HR admin password is stored as a SHA-256 hash+salt in environment variables
// (HR_ADMIN_PASSWORD_HASH and HR_ADMIN_PASSWORD_SALT), set once via a setup
// script or the Netlify env var panel. No sheet column needed for passwords.
// ─────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");

const SESSION_COOKIE  = "hr_session";
const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours

// ── Password hashing (HR admin only) ─────────────────────────────────────

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const h = crypto.createHmac("sha256", s).update(password).digest("hex");
  return { hash: h, salt: s };
}

function verifyPassword(password, storedHash, storedSalt) {
  if (!storedHash || !storedSalt) return false;
  const { hash } = hashPassword(password, storedSalt);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
  } catch { return false; }
}

// ── HR admin credential check ─────────────────────────────────────────────
// HR admin emails are defined in HR_ADMIN_EMAILS (comma-separated).
// Their password hash/salt are in HR_ADMIN_PASSWORD_HASH / HR_ADMIN_PASSWORD_SALT.

function isHRAdminEmail(email) {
  const admins = (process.env.HR_ADMIN_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase());
  return admins.includes((email || "").trim().toLowerCase());
}

function verifyHRPassword(password) {
  return verifyPassword(
    password,
    process.env.HR_ADMIN_PASSWORD_HASH || "",
    process.env.HR_ADMIN_PASSWORD_SALT || ""
  );
}

// ── Session token (signed) ────────────────────────────────────────────────

function sign(payload) {
  const data = JSON.stringify(payload);
  const b64  = Buffer.from(data).toString("base64url");
  const sig  = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verify(token) {
  if (!token) return null;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const expected = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(b64).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return JSON.parse(Buffer.from(b64, "base64url").toString());
  } catch { return null; }
}

// ── Cookie helpers ────────────────────────────────────────────────────────

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), decodeURIComponent(v.join("="))];
    })
  );
}

function buildSessionCookie(sessionData) {
  const token = sign(sessionData);
  return [
    `${SESSION_COOKIE}=${token}`,
    `Max-Age=${SESSION_MAX_AGE}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV !== "development" ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

// ── Session helpers ───────────────────────────────────────────────────────

function getSession(event) {
  const cookies = parseCookies(event.headers?.cookie);
  return verify(cookies[SESSION_COOKIE]);
}

function requireAuth(event) {
  const session = getSession(event);
  if (!session) {
    return {
      error: { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) },
      session: null,
    };
  }
  return { error: null, session };
}

function requireRole(event, ...allowedRoles) {
  const { error, session } = requireAuth(event);
  if (error) return { error, session: null };
  if (!allowedRoles.includes(session.role)) {
    return {
      error: { statusCode: 403, body: JSON.stringify({ error: "Insufficient permissions" }) },
      session: null,
    };
  }
  return { error: null, session };
}

module.exports = {
  hashPassword,
  verifyPassword,
  isHRAdminEmail,
  verifyHRPassword,
  sign,
  verify,
  parseCookies,
  buildSessionCookie,
  clearSessionCookie,
  getSession,
  requireAuth,
  requireRole,
};
