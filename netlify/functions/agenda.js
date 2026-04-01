// netlify/functions/agenda.js
// POST /api/agenda — generate a meeting agenda (HR only)
// Returns the agenda as JSON and as plain text.

const { requireRole } = require("../../src/lib/auth");
const { readSheet } = require("../../src/lib/google-client");
const { rowToMeeting } = require("../../src/lib/schedule-engine");
const { generateAgenda, agendaToText } = require("../../src/lib/agenda-templates");

const SHEET_ID   = () => process.env.CONTRACTS_SHEET_ID;
const MEET_RANGE  = "Meetings!A2:O";
const CONTR_RANGE = "Contracts!A2:J";

exports.handler = async (event) => {
  const { error: authErr } = requireRole(event, "hr_admin");
  if (authErr) return authErr;

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { meetingId } = JSON.parse(event.body || "{}");
    if (!meetingId) {
      return { statusCode: 400, body: JSON.stringify({ error: "meetingId required" }) };
    }

    // Load the meeting record
    const meetRows = await readSheet(SHEET_ID(), MEET_RANGE);
    const meetRow  = meetRows.find((r) => r[0] === meetingId);
    if (!meetRow) return { statusCode: 404, body: JSON.stringify({ error: "Meeting not found" }) };

    const meeting = rowToMeeting(meetRow);

    // Load contract context for richer agenda (end date, department, etc.)
    let ctx = {};
    try {
      const contrRows = await readSheet(process.env.CONTRACTS_SHEET_ID, CONTR_RANGE);
      const contrRow  = contrRows.find((r) => r[0] === meeting.employeeId || (r[2] || "").toLowerCase() === meeting.employeeEmail);
      if (contrRow) {
        ctx = {
          contractStartDate: contrRow[4] || null,
          contractEndDate:   contrRow[5] || null,
          department:        contrRow[8] || null,
          employmentType:    contrRow[3] || null,
        };
      }
    } catch { /* context is optional */ }

    const agenda = generateAgenda(meeting, ctx);
    const text   = agendaToText(agenda);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agenda, text, meetingId }),
    };
  } catch (err) {
    console.error("Agenda generation error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
