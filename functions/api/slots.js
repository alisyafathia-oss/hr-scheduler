// functions/api/slots.js
// GET  /api/slots                      — list slots
// GET  /api/slots?action=availability  — calendar free/busy windows
// POST /api/slots                      — team head creates a slot
// POST /api/slots?action=book          — employee books a slot

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../_compat.js";
import _auth from "../../src/lib/auth.js";
import _googleClient from "../../src/lib/google-client.js";
import _scheduleEngine from "../../src/lib/schedule-engine.js";
import _mailer from "../../src/lib/mailer.js";
import { addMinutes, format, parseISO, addDays } from "date-fns";

const { requireAuth, requireRole } = _auth;
const { readSheet, appendSheet, writeSheet, listFreeBusy, createCalendarEvent } = _googleClient;
const { rowToMeeting, meetingToRow } = _scheduleEngine;
const { sendEmail, bookingConfirmationEmail } = _mailer;

const SHEET_ID    = () => process.env.SCHEDULER_SHEET_ID;
const SLOTS_RANGE = "Slots!A2:J";
const MEET_RANGE  = "Meetings!A2:O";

function slotToRow(s) {
  return [s.id, s.meetingId || "", s.teamHeadEmail, s.date, s.startTime, s.endTime,
          s.status || "available", s.bookedBy || "", s.calendarEventId || "", s.createdAt];
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM    = /^\d{2}:\d{2}$/;

function rowToSlot(row) {
  if (!row || row.length < 6) return null;
  const id        = String(row[0] || "").trim();
  const date      = String(row[3] || "").trim();
  const startTime = String(row[4] || "").trim();
  const endTime   = String(row[5] || "").trim();
  // Reject header/template/deleted rows — must have real id, ISO date, HH:MM times
  if (!id || !ISO_DATE.test(date) || !HH_MM.test(startTime) || !HH_MM.test(endTime)) return null;
  const status = String(row[6] || "available").trim();
  if (status === "deleted") return null;
  return { id, meetingId: row[1] || "", teamHeadEmail: String(row[2] || "").trim(),
           date, startTime, endTime, status,
           bookedBy: row[7] || null, calendarEventId: row[8] || null, createdAt: row[9] || "" };
}

async function handler(event) {
  const { error, session } = requireAuth(event);
  if (error) return error;

  const method = event.httpMethod;
  const action = (event.queryStringParameters?.action) || "";

  const json = (data, code = 200) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  try {
    // GET /api/slots — list
    if (method === "GET" && !action) {
      const rows = await readSheet(SHEET_ID(), SLOTS_RANGE);
      let slots  = rows.map(rowToSlot).filter(Boolean); // rowToSlot already rejects junk/deleted rows

      const { status, teamHeadEmail, date } = event.queryStringParameters || {};
      if (status)        slots = slots.filter((s) => s.status === status);
      if (teamHeadEmail) slots = slots.filter((s) => s.teamHeadEmail === teamHeadEmail);
      if (date)          slots = slots.filter((s) => s.date === date);

      return json({ slots });
    }

    // GET /api/slots?action=availability — calendar free/busy
    if (method === "GET" && action === "availability") {
      const teamCheck = requireRole(event, "team_head", "hr_admin");
      if (teamCheck.error) return teamCheck.error;

      const calendarId = event.queryStringParameters?.calendarId || session.workEmail || session.email;
      const daysAhead  = parseInt(event.queryStringParameters?.days || "14");
      const now        = new Date();
      const until      = addDays(now, daysAhead);

      let busyBlocks = [];
      let calendarNote = null;
      try {
        busyBlocks = await listFreeBusy(calendarId, now.toISOString(), until.toISOString());
      } catch (calErr) {
        console.error("Calendar free/busy fetch failed:", calErr.message);
        calendarNote = "Calendar access unavailable — showing all business hours as free. Ask your Google Workspace admin to share calendar access with the service account.";
      }

      const suggestions = [];
      let cursor = new Date(now);
      cursor.setHours(9, 0, 0, 0);

      while (cursor < until && suggestions.length < 20) {
        const day = cursor.getDay();
        if (day === 0 || day === 6) { cursor = addDays(cursor, 1); cursor.setHours(9, 0, 0, 0); continue; }
        if (cursor.getHours() >= 17) { cursor = addDays(cursor, 1); cursor.setHours(9, 0, 0, 0); continue; }

        const slotEnd = addMinutes(cursor, 60);
        const isBusy  = busyBlocks.some((b) => {
          const bs = new Date(b.start), be = new Date(b.end);
          return cursor < be && slotEnd > bs;
        });

        if (!isBusy) {
          suggestions.push({
            date:      format(cursor, "yyyy-MM-dd"),
            startTime: format(cursor, "HH:mm"),
            endTime:   format(slotEnd, "HH:mm"),
            label:     format(cursor, "EEE d MMM, h:mm a"),
          });
        }
        cursor = addMinutes(cursor, 60);
      }

      return json({ suggestions, busyBlocks, calendarNote });
    }

    // POST /api/slots — team head creates a slot
    if (method === "POST" && !action) {
      const teamCheck = requireRole(event, "team_head", "hr_admin");
      if (teamCheck.error) return teamCheck.error;

      const { date, startTime, endTime, meetingId } = JSON.parse(event.body || "{}");
      if (!date || !startTime || !endTime) return json({ error: "date, startTime, endTime required" }, 400);

      const id   = `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const slot = { id, meetingId: meetingId || "", teamHeadEmail: session.email,
                     date, startTime, endTime, status: "available",
                     bookedBy: null, calendarEventId: null, createdAt: new Date().toISOString() };

      await appendSheet(SHEET_ID(), "Slots!A:J", [slotToRow(slot)]);
      return json({ success: true, slot });
    }

    // POST /api/slots?action=book — employee books a slot
    if (method === "POST" && action === "book") {
      const { slotId, meetingId } = JSON.parse(event.body || "{}");
      if (!slotId || !meetingId) return json({ error: "slotId and meetingId required" }, 400);

      const slotRows = await readSheet(SHEET_ID(), SLOTS_RANGE);
      const slotIdx  = slotRows.findIndex((r) => r[0] === slotId);
      if (slotIdx === -1) return json({ error: "Slot not found" }, 404);

      const slot = rowToSlot(slotRows[slotIdx]);
      if (slot.status !== "available") return json({ error: "Slot already booked" }, 409);

      const meetRows = await readSheet(SHEET_ID(), MEET_RANGE);
      const meetIdx  = meetRows.findIndex((r) => r[0] === meetingId);
      if (meetIdx === -1) return json({ error: "Meeting not found" }, 404);

      const mtg = rowToMeeting(meetRows[meetIdx]);

      let calEventId = null;
      try {
        const startDt = parseISO(`${slot.date}T${slot.startTime}:00`);
        const endDt   = parseISO(`${slot.date}T${slot.endTime}:00`);
        const calEvent = await createCalendarEvent(process.env.HR_CALENDAR_ID, {
          summary:     `${mtg.label} — ${mtg.employeeName}`,
          description: `HR Scheduling: ${mtg.label}\nEmployee: ${mtg.employeeName}\nManager: ${mtg.managerEmail}`,
          start:       { dateTime: startDt.toISOString(), timeZone: "UTC" },
          end:         { dateTime: endDt.toISOString(),   timeZone: "UTC" },
          attendees:   [
            { email: mtg.employeeEmail },
            { email: mtg.managerEmail },
          ].filter((a) => a.email),
        });
        calEventId = calEvent.id;
      } catch (calErr) {
        console.error("Calendar event creation failed:", calErr);
      }

      const slotRowNum  = slotIdx + 2;
      const updatedSlot = { ...slot, status: "booked", bookedBy: session.email, calendarEventId: calEventId };
      await writeSheet(SHEET_ID(), `Slots!A${slotRowNum}:J${slotRowNum}`, [slotToRow(updatedSlot)]);

      const meetRowNum = meetIdx + 2;
      const updatedMtg = { ...mtg, status: "booked", slotId, calendarEventId: calEventId };
      await writeSheet(SHEET_ID(), `Meetings!A${meetRowNum}:O${meetRowNum}`, [meetingToRow(updatedMtg)]);

      try {
        await sendEmail(bookingConfirmationEmail({
          employeeName:  mtg.employeeName,
          employeeEmail: mtg.employeeEmail,
          managerEmail:  mtg.managerEmail,
          meetingLabel:  mtg.label,
          scheduledDate: slot.date,
          startTime:     slot.startTime,
          durationMins:  mtg.durationMins,
        }));
      } catch (mailErr) {
        console.error("Booking email failed:", mailErr);
      }

      return json({ success: true, slot: updatedSlot, meeting: updatedMtg });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("Slots API error:", err);
    return json({ error: err.message }, 500);
  }
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
