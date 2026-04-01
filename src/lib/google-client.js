// src/lib/google-client.js
// Shared Google API authentication using a Service Account.
// All Netlify functions import from here — one place to update credentials.

const { google } = require("googleapis");

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
];

function getServiceAccountAuth() {
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: SCOPES,
  });
  return auth;
}

function getSheetsClient() {
  const auth = getServiceAccountAuth();
  return google.sheets({ version: "v4", auth });
}

function getCalendarClient() {
  const auth = getServiceAccountAuth();
  return google.calendar({ version: "v3", auth });
}

// ── Sheets helpers ─────────────────────────────────────────────────────────

async function readSheet(spreadsheetId, range) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

async function writeSheet(spreadsheetId, range, values) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

async function appendSheet(spreadsheetId, range, values) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

// ── Calendar helpers ───────────────────────────────────────────────────────

async function createCalendarEvent(calendarId, event) {
  const calendar = getCalendarClient();
  const res = await calendar.events.insert({
    calendarId,
    sendUpdates: "all",
    requestBody: event,
  });
  return res.data;
}

async function deleteCalendarEvent(calendarId, eventId) {
  const calendar = getCalendarClient();
  await calendar.events.delete({
    calendarId,
    eventId,
    sendUpdates: "all",
  });
}

async function getCalendarEvents(calendarId, timeMin, timeMax) {
  const calendar = getCalendarClient();
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });
  return res.data.items || [];
}

async function listFreeBusy(calendarId, timeMin, timeMax) {
  const calendar = getCalendarClient();
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    },
  });
  return res.data.calendars[calendarId]?.busy || [];
}

module.exports = {
  getServiceAccountAuth,
  getSheetsClient,
  getCalendarClient,
  readSheet,
  writeSheet,
  appendSheet,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  listFreeBusy,
};
