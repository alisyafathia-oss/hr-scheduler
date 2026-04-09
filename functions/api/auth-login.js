// functions/api/auth-login.js
// POST /api/auth-login
//
// Body A — HR Admin login:
//   { "loginType": "hr", "email": "hr@company.com", "password": "..." }
//
// Body B — Team Head / Employee login:
//   { "loginType": "id", "employeeId": "E034" }

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../_compat.js";
import _auth from "../../src/lib/auth.js";
import _googleClient from "../../src/lib/google-client.js";
import _columnMap from "../../src/lib/column-map.js";

const { buildSessionCookie, isHRAdminEmail, verifyHRPassword } = _auth;
const { readSheet } = _googleClient;
const { buildPeopleIndex, detectRole } = _columnMap;

const DB_ID   = () => process.env.CONTRACTS_SHEET_ID;
const PM_ID   = () => process.env.PEOPLE_MASTER_SHEET_ID;
const SCHED_ID = () => process.env.SCHEDULER_SHEET_ID;

function headerIdx(row) {
  const idx = {};
  (row || []).forEach((h, i) => {
    if (h) idx[String(h).trim().toLowerCase().replace(/[\s()]/g, "_")] = i;
  });
  return idx;
}

async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const json = (data, code = 200) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json({ error: "Invalid request body" }, 400); }

  const { loginType } = body;

  // ── Path A: HR Admin — email + password ───────────────────────────────
  if (loginType === "hr") {
    const { email, password } = body;

    if (!email || !password) {
      return json({ error: "Email and password are required" }, 400);
    }

    if (!isHRAdminEmail(email)) {
      return json({ error: "This email is not registered as an HR admin account" }, 401);
    }

    if (!verifyHRPassword(password)) {
      return json({ error: "Incorrect password" }, 401);
    }

    const session = {
      employeeId: "HR",
      name:       email.split("@")[0],
      workEmail:  email.trim().toLowerCase(),
      role:       "hr_admin",
      iat:        Date.now(),
    };

    const cookie = buildSessionCookie(session);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie,
      },
      body: JSON.stringify({ success: true, role: "hr_admin", redirect: "/dashboard/hr" }),
    };
  }

  // ── Path B: Team Head / Employee — Employee ID only ───────────────────
  if (loginType === "id") {
    const { employeeId } = body;

    if (!employeeId || !employeeId.trim()) {
      return json({ error: "Employee ID is required" }, 400);
    }

    const empId = employeeId.trim().toUpperCase();

    try {
      const [[hrHeader], hrRows, [pmHeader], pmRows] = await Promise.all([
        readSheet(SCHED_ID(), "HR Roles!A1:G1"),
        readSheet(SCHED_ID(), "HR Roles!A2:G"),
        readSheet(PM_ID(), "People_Master!A1:M1"),
        readSheet(PM_ID(), "People_Master!A2:M"),
      ]);

      const hIdx      = headerIdx(hrHeader);
      const idCol     = hIdx["employee_id"] ?? 0;
      const activeCol = hIdx["is_active"]   ?? 4;

      // Merge HR Roles + People_Master so any listed employee can log in
      const peopleIndex = buildPeopleIndex(pmRows, pmHeader, hrRows, hrHeader);
      const person      = peopleIndex[empId];

      const roleRow = hrRows.find(
        (r) => (r[idCol] || "").trim().toUpperCase() === empId
      );

      // Must be found in at least one of HR Roles or People_Master
      if (!roleRow && !person) {
        return json({
          error: "Employee ID not found. Contact HR if you believe this is an error.",
        }, 401);
      }

      // Respect Is_Active flag when the employee is in the HR Roles tab
      if (roleRow) {
        const isActive = (roleRow[activeCol] || "TRUE").toUpperCase() !== "FALSE";
        if (!isActive) {
          return json({ error: "Your account has been deactivated. Contact HR." }, 403);
        }
      }

      const role = detectRole(empId, peopleIndex);

      if (role === "hr_admin") {
        return json({
          error: "HR admin accounts must sign in with email and password.",
        }, 403);
      }

      const session = {
        employeeId: empId,
        name:       person?.name      || empId,
        workEmail:  person?.workEmail || "",
        role,
        iat: Date.now(),
      };

      const cookie = buildSessionCookie(session);
      const dest   = role === "team_head" ? "/dashboard/team-head" : "/dashboard/employee";

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookie,
        },
        body: JSON.stringify({ success: true, role, redirect: dest }),
      };
    } catch (err) {
      console.error("ID login error:", err);
      return json({ error: "Login failed. Please try again." }, 500);
    }
  }

  return json({ error: "Invalid loginType. Use 'hr' or 'id'." }, 400);
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
