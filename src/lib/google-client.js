// src/lib/google-client.js
// Google API client using Web Crypto (built into Cloudflare Workers) for JWT auth
// and native fetch() for all API calls. No googleapis package required.

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar",
];

function b64url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64urlBytes(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken() {
  const now     = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss:   process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: SCOPES.join(" "),
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  }));

  const message = `${header}.${payload}`;

  // Import the service account private key (PEM → PKCS8 → CryptoKey)
  const pem      = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n|\r/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(message)
  );

  const jwt = `${message}.${b64urlBytes(sig)}`;

  // Exchange the signed JWT for an OAuth2 access token
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(`Failed to get Google access token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// ── Sheets helpers ─────────────────────────────────────────────────────────

async function sheetsReq(method, spreadsheetId, path, body) {
  const token = await getAccessToken();
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`;
  const res   = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Sheets ${method} ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function readSheet(spreadsheetId, range) {
  const data = await sheetsReq("GET", spreadsheetId, `/values/${encodeURIComponent(range)}`);
  return data.values || [];
}

async function writeSheet(spreadsheetId, range, values) {
  await sheetsReq(
    "PUT", spreadsheetId,
    `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { values }
  );
}

async function appendSheet(spreadsheetId, range, values) {
  await sheetsReq(
    "POST", spreadsheetId,
    `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values }
  );
}

// ── Calendar helpers ───────────────────────────────────────────────────────

async function calReq(method, path, body) {
  const token = await getAccessToken();
  const url   = `https://www.googleapis.com/calendar/v3${path}`;
  const res   = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Calendar ${method} ${path}: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function createCalendarEvent(calendarId, event) {
  return calReq(
    "POST",
    `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    event
  );
}

async function deleteCalendarEvent(calendarId, eventId) {
  await calReq(
    "DELETE",
    `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=all`
  );
}

async function getCalendarEvents(calendarId, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin, timeMax, singleEvents: "true", orderBy: "startTime",
  });
  const data = await calReq("GET", `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  return data.items || [];
}

async function listFreeBusy(calendarId, timeMin, timeMax) {
  const data = await calReq("POST", "/freeBusy", {
    timeMin, timeMax,
    items: [{ id: calendarId }],
  });
  return data.calendars?.[calendarId]?.busy || [];
}

module.exports = {
  readSheet,
  writeSheet,
  appendSheet,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  listFreeBusy,
};
