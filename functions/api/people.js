// functions/api/people.js
// GET /api/people — HR admin only. Returns full employee list from People_Master.

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../_compat.js";
import _auth from "../../src/lib/auth.js";
import _googleClient from "../../src/lib/google-client.js";
import _columnMap from "../../src/lib/column-map.js";

const { requireRole } = _auth;
const { readSheet } = _googleClient;
const { mapPeopleRow, mapHRRoleRow } = _columnMap;

async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { error } = requireRole(event, "hr_admin");
  if (error) return error;

  try {
    const [[pmHeader], pmRows, [hrHeader], hrRows] = await Promise.all([
      readSheet(process.env.PEOPLE_MASTER_SHEET_ID, "People_Master!A1:AE1"),
      readSheet(process.env.PEOPLE_MASTER_SHEET_ID, "People_Master!A2:AE"),
      readSheet(process.env.SCHEDULER_SHEET_ID, "HR Roles!A1:G1"),
      readSheet(process.env.SCHEDULER_SHEET_ID, "HR Roles!A2:G"),
    ]);

    // Build HR Role index
    const hrRoleIndex = {};
    for (const row of (hrRows || [])) {
      const r = mapHRRoleRow(row, hrHeader || []);
      if (r.id) hrRoleIndex[r.id.toUpperCase()] = r;
    }

    const people = (pmRows || [])
      .map(row => mapPeopleRow(row, pmHeader || []))
      .filter(p => p.id)
      .map(p => {
        const roleInfo = hrRoleIndex[p.id.toUpperCase()];
        return {
          id:             p.id,
          name:           p.name,
          employmentType: p.employmentType,
          designation:    p.designation,
          joinDate:       p.joinDate,
          workEmail:      p.workEmail,
          role:           roleInfo?.hrRole || "employee",
          isActive:       roleInfo ? roleInfo.isActive : true,
        };
      });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people }),
    };
  } catch (err) {
    console.error("People list error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
