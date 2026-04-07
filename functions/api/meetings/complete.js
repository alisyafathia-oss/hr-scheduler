// functions/api/meetings/complete.js
// POST /api/meetings/complete — HR admin marks a meeting as completed.

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../../_compat.js";
import _auth from "../../../src/lib/auth.js";
import _googleClient from "../../../src/lib/google-client.js";
import _scheduleEngine from "../../../src/lib/schedule-engine.js";

const { requireRole } = _auth;
const { readSheet, writeSheet } = _googleClient;
const { rowToMeeting, meetingToRow } = _scheduleEngine;

const SHEET_ID = () => process.env.SCHEDULER_SHEET_ID;
const RANGE    = "Meetings!A2:O";

async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { error } = requireRole(event, "hr_admin");
  if (error) return error;

  try {
    const { meetingId } = JSON.parse(event.body || "{}");
    if (!meetingId) {
      return { statusCode: 400, body: JSON.stringify({ error: "meetingId required" }) };
    }

    const rows = await readSheet(SHEET_ID(), RANGE);
    const idx  = rows.findIndex((r) => r[0] === meetingId);
    if (idx === -1) {
      return { statusCode: 404, body: JSON.stringify({ error: `Meeting ${meetingId} not found` }) };
    }

    const meeting = rowToMeeting(rows[idx]);
    const updated = { ...meeting, status: "completed" };
    const rowNum  = idx + 2;
    await writeSheet(SHEET_ID(), `Meetings!A${rowNum}:O${rowNum}`, [meetingToRow(updated)]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, meeting: updated }),
    };
  } catch (err) {
    console.error("Complete meeting error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
