// functions/api/people.js
// GET /api/people — list all people from People Master + HR Roles (HR admin only).

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../_compat.js";
import _auth from "../../src/lib/auth.js";
import _googleClient from "../../src/lib/google-client.js";
import _columnMap from "../../src/lib/column-map.js";

const { requireRole } = _auth;
const { readSheet } = _googleClient;
const { buildPeopleIndex } = _columnMap;

const SCHED_ID = () => process.env.SCHEDULER_SHEET_ID;
const PM_ID    = () => process.env.PEOPLE_MASTER_SHEET_ID;

async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { error } = requireRole(event, "hr_admin");
  if (error) return error;

  try {
    const [[pmHeader], pmRows, [hrHeader], hrRows] = await Promise.all([
      readSheet(PM_ID(), "People!A1:M1"),
      readSheet(PM_ID(), "People!A2:M"),
      readSheet(SCHED_ID(), "HR Roles!A1:G1"),
      readSheet(SCHED_ID(), "HR Roles!A2:G"),
    ]);

    const index = buildPeopleIndex(pmRows, pmHeader, hrRows, hrHeader);
    const people = Object.values(index).map((p) => ({
      id:             p.id,
      name:           p.name,
      email:          p.workEmail || p.gmailEmail || "",
      designation:    p.designation || "",
      employmentType: p.employmentType || (p.isPermanent ? "permanent" : ""),
      isPermanent:    p.isPermanent || false,
      hrRole:         p.hrRole || "employee",
      isTeamHead:     p.isTeamHead || false,
      joinDate:       p.joinDate || "",
      initials:       p.initials || "",
    })).filter(p => p.id);

    // Sort: HR admins first, then team heads, then employees
    people.sort((a, b) => {
      const order = { hr_admin: 0, team_head: 1, employee: 2 };
      const ao = order[a.hrRole] ?? 2;
      const bo = order[b.hrRole] ?? 2;
      if (ao !== bo) return ao - bo;
      return (a.name || "").localeCompare(b.name || "");
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people, total: people.length }),
    };
  } catch (err) {
    console.error("People API error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
