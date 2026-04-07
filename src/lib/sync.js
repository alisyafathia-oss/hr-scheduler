// src/lib/sync.js
// Shared sync logic — called by both the daily cron and the manual HR button.
// Reads all source sheets, runs the schedule engine, writes new meetings.

const { readSheet, appendSheet } = require("./google-client");
const { generateSchedule, meetingToRow, rowToMeeting } = require("./schedule-engine");

const DB_ID    = () => process.env.CONTRACTS_SHEET_ID;
const PM_ID    = () => process.env.PEOPLE_MASTER_SHEET_ID;
const SCHED_ID = () => process.env.SCHEDULER_SHEET_ID;

async function runSync() {
  // ── Read all source sheets in parallel ──────────────────────────────────
  const [
    [contractHeader], contractRows,
    [peopleHeader],   peopleRows,
    [hrRoleHeader],   hrRoleRows,
    existingRows,
  ] = await Promise.all([
    readSheet(process.env.CONTRACTS_SHEET_ID_SOURCE || DB_ID(), "Contracts!A1:J1"),
    readSheet(process.env.CONTRACTS_SHEET_ID_SOURCE || DB_ID(), "Contracts!A2:J"),
    readSheet(PM_ID(), "People_Master!A1:M1"),
    readSheet(PM_ID(), "People_Master!A2:M"),
    readSheet(SCHED_ID(), "HR Roles!A1:G1"),
    readSheet(SCHED_ID(), "HR Roles!A2:G"),
    readSheet(SCHED_ID(), "Meetings!A2:O"),
  ]);

  const existingIds = new Set(existingRows.map((r) => r[0]).filter(Boolean));

  const { meetings, errors } = generateSchedule({
    contractRows,
    contractHeader,
    peopleRows,
    peopleHeader,
    hrRoleRows,
    hrRoleHeader,
    existingIds,
  });

  if (meetings.length > 0) {
    await appendSheet(SCHED_ID(), "Meetings!A:O", meetings.map(meetingToRow));
  }

  return { newMeetings: meetings.length, errors, timestamp: new Date().toISOString() };
}

module.exports = { runSync };
