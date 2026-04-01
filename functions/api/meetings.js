// functions/api/meetings.js
// GET /api/meetings        — list meetings (HR sees all, others see own)
// GET /api/meetings?id=X   — get single meeting

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../_compat.js";
import _auth from "../../src/lib/auth.js";
import _googleClient from "../../src/lib/google-client.js";
import _scheduleEngine from "../../src/lib/schedule-engine.js";

const { requireAuth } = _auth;
const { readSheet } = _googleClient;
const { rowToMeeting } = _scheduleEngine;

const SHEET_ID = () => process.env.CONTRACTS_SHEET_ID;
const RANGE    = "Meetings!A2:O";

async function getAllMeetings() {
  const rows = await readSheet(SHEET_ID(), RANGE);
  return rows.map(rowToMeeting).filter(Boolean);
}

async function handler(event) {
  const { error, session } = requireAuth(event);
  if (error) return error;

  const method = event.httpMethod;
  if (method !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    // GET /api/meetings?id=X — single meeting
    if (event.queryStringParameters?.id) {
      const meetings = await getAllMeetings();
      const m = meetings.find((x) => x.id === event.queryStringParameters.id);
      if (!m) return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(m),
      };
    }

    // GET /api/meetings — list
    const meetings = await getAllMeetings();
    let filtered = meetings;

    if (session.role === "employee") {
      filtered = meetings.filter((m) => m.employeeEmail === session.email);
    } else if (session.role === "team_head") {
      filtered = meetings.filter(
        (m) => m.employeeEmail === session.email || m.managerEmail === session.email
      );
    }

    const { status, type, employeeEmail } = event.queryStringParameters || {};
    if (status) filtered = filtered.filter((m) => m.status === status);
    if (type)   filtered = filtered.filter((m) => m.meetingType === type);
    if (employeeEmail && session.role === "hr_admin") {
      filtered = filtered.filter((m) => m.employeeEmail === employeeEmail);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetings: filtered, total: filtered.length }),
    };
  } catch (err) {
    console.error("Meetings API error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
