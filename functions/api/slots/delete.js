// functions/api/slots/delete.js
// POST /api/slots/delete — HR admin or owning team head deletes an available slot.

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../../_compat.js";
import _auth from "../../../src/lib/auth.js";
import _googleClient from "../../../src/lib/google-client.js";

const { requireAuth } = _auth;
const { readSheet, writeSheet } = _googleClient;

const SHEET_ID    = () => process.env.SCHEDULER_SHEET_ID;
const SLOTS_RANGE = "Slots!A2:J";

function rowToSlot(row) {
  if (!row || row.length < 6) return null;
  return { id: row[0], meetingId: row[1], teamHeadEmail: row[2], date: row[3],
           startTime: row[4], endTime: row[5], status: row[6] || "available",
           bookedBy: row[7] || null };
}

async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { error, session } = requireAuth(event);
  if (error) return error;

  try {
    const { slotId } = JSON.parse(event.body || "{}");
    if (!slotId) {
      return { statusCode: 400, body: JSON.stringify({ error: "slotId required" }) };
    }

    const rows = await readSheet(SHEET_ID(), SLOTS_RANGE);
    const idx  = rows.findIndex((r) => r[0] === slotId);
    if (idx === -1) {
      return { statusCode: 404, body: JSON.stringify({ error: "Slot not found" }) };
    }

    const slot = rowToSlot(rows[idx]);

    // Only HR admin or the owning team head can delete
    const userEmail = session.workEmail || session.email || "";
    if (session.role !== "hr_admin" && slot.teamHeadEmail !== userEmail) {
      return { statusCode: 403, body: JSON.stringify({ error: "Not authorised to delete this slot" }) };
    }

    if (slot.status === "booked") {
      return { statusCode: 409, body: JSON.stringify({ error: "Cannot delete a booked slot. Cancel the meeting first." }) };
    }

    // Soft-delete: blank the row so row count stays stable
    const rowNum = idx + 2;
    await writeSheet(SHEET_ID(), `Slots!A${rowNum}:J${rowNum}`,
      [["", "", "", "", "", "", "deleted", "", "", ""]]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("Slot delete error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
