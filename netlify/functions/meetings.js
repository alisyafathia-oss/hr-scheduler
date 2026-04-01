// netlify/functions/meetings.js
// GET  /api/meetings          — list meetings (HR sees all, others see own)
// GET  /api/meetings?id=X     — get single meeting
// POST /api/meetings/cancel   — cancel a meeting (HR only)
// POST /api/meetings/complete — mark complete (HR only)

const { requireAuth, requireRole } = require("../../src/lib/auth");
const { readSheet, writeSheet } = require("../../src/lib/google-client");
const { rowToMeeting, meetingToRow } = require("../../src/lib/schedule-engine");
const { sendEmail, cancellationEmail } = require("../../src/lib/mailer");

const SHEET_ID = () => process.env.CONTRACTS_SHEET_ID;
const RANGE    = "Meetings!A2:O";

async function getAllMeetings() {
  const rows = await readSheet(SHEET_ID(), RANGE);
  return rows.map(rowToMeeting).filter(Boolean);
}

async function updateMeetingRow(meetingId, updates) {
  const rows = await readSheet(SHEET_ID(), RANGE);
  const idx  = rows.findIndex((r) => r[0] === meetingId);
  if (idx === -1) throw new Error(`Meeting ${meetingId} not found`);

  const meeting = rowToMeeting(rows[idx]);
  const updated = { ...meeting, ...updates };
  const rowNum  = idx + 2; // +2 for 1-indexed + header row
  await writeSheet(SHEET_ID(), `Meetings!A${rowNum}:O${rowNum}`, [meetingToRow(updated)]);
  return updated;
}

exports.handler = async (event) => {
  const { error, session } = requireAuth(event);
  if (error) return error;

  const method = event.httpMethod;
  const path   = event.path.replace(/^\/api\/meetings\/?/, "");

  try {
    // ── GET /api/meetings ──────────────────────────────────────────────────
    if (method === "GET" && !path) {
      const meetings = await getAllMeetings();

      let filtered = meetings;
      if (session.role === "employee") {
        filtered = meetings.filter((m) => m.employeeEmail === session.email);
      } else if (session.role === "team_head") {
        filtered = meetings.filter(
          (m) => m.employeeEmail === session.email || m.managerEmail === session.email
        );
      }

      // Optional filters via query params
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
    }

    // ── GET /api/meetings?id=X ─────────────────────────────────────────────
    if (method === "GET" && event.queryStringParameters?.id) {
      const meetings = await getAllMeetings();
      const m = meetings.find((x) => x.id === event.queryStringParameters.id);
      if (!m) return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(m),
      };
    }

    // ── POST /api/meetings/cancel ──────────────────────────────────────────
    if (method === "POST" && path === "cancel") {
      const hrCheck = requireRole(event, "hr_admin");
      if (hrCheck.error) return hrCheck.error;

      const { meetingId } = JSON.parse(event.body || "{}");
      if (!meetingId) return { statusCode: 400, body: JSON.stringify({ error: "meetingId required" }) };

      const updated = await updateMeetingRow(meetingId, {
        status: "cancelled",
        slotId: null,
        calendarEventId: null,
      });

      // Send cancellation emails
      try {
        await sendEmail(
          cancellationEmail({
            employeeName: updated.employeeName,
            employeeEmail: updated.employeeEmail,
            managerEmail: updated.managerEmail,
            meetingLabel: updated.label,
            scheduledDate: updated.scheduledDate,
            rebookUrl: `${process.env.APP_URL}/dashboard/employee`,
          })
        );
      } catch (mailErr) {
        console.error("Cancellation email failed:", mailErr);
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, meeting: updated }),
      };
    }

    // ── POST /api/meetings/complete ────────────────────────────────────────
    if (method === "POST" && path === "complete") {
      const hrCheck = requireRole(event, "hr_admin");
      if (hrCheck.error) return hrCheck.error;

      const { meetingId } = JSON.parse(event.body || "{}");
      if (!meetingId) return { statusCode: 400, body: JSON.stringify({ error: "meetingId required" }) };

      const updated = await updateMeetingRow(meetingId, { status: "completed" });

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, meeting: updated }),
      };
    }

    return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
  } catch (err) {
    console.error("Meetings API error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
