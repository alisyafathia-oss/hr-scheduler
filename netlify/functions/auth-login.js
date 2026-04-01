// netlify/functions/auth-login.js  (v3)
// ─────────────────────────────────────────────────────────────────────────
// POST /api/auth-login
//
// Body A — HR Admin login:
//   { "loginType": "hr", "email": "hr@company.com", "password": "..." }
//
// Body B — Team Head / Employee login:
//   { "loginType": "id", "employeeId": "E034" }
//
// HR credentials are validated against env vars (no sheet lookup for password).
// Employee ID is looked up in the HR Roles tab — must exist and be active.
// ─────────────────────────────────────────────────────────────────────────

const {
  buildSessionCookie,
  isHRAdminEmail,
  verifyHRPassword,
} = require("../../src/lib/auth");

const { readSheet }        = require("../../src/lib/google-client");
const { buildPeopleIndex, detectRole } = require("../../src/lib/column-map");

const DB_ID = () => process.env.CONTRACTS_SHEET_ID;
const PM_ID = () => process.env.PEOPLE_MASTER_SHEET_ID;

exports.handler = async (event) => {
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

    // Build session for HR admin — no sheet lookup needed
    const session = {
      employeeId: "HR",
      name:       email.split("@")[0],
      workEmail:  email.trim().toLowerCase(),
      role:       "hr_admin",
      iat:        Date.now(),
    };

    return json({
      success:  true,
      role:     "hr_admin",
      redirect: "/dashboard/hr",
    }, 200, buildSessionCookie(session));
  }

  // ── Path B: Team Head / Employee — Employee ID only ───────────────────
  if (loginType === "id") {
    const { employeeId } = body;

    if (!employeeId || !employeeId.trim()) {
      return json({ error: "Employee ID is required" }, 400);
    }

    const empId = employeeId.trim().toUpperCase();

    try {
      // Load HR Roles tab (active check) + People Master (name, email, role)
      const [[hrHeader], hrRows, [pmHeader], pmRows] = await Promise.all([
        readSheet(DB_ID(), "HR Roles!A1:G1"),
        readSheet(DB_ID(), "HR Roles!A2:G"),
        readSheet(PM_ID(), "People!A1:H1"),
        readSheet(PM_ID(), "People!A2:H"),
      ]);

      // Find the person in HR Roles tab
      const hIdx     = headerIdx(hrHeader);
      const idCol    = hIdx["employee_id"] ?? 0;
      const activeCol = hIdx["is_active"]  ?? 4;

      const roleRow = hrRows.find(
        (r) => (r[idCol] || "").trim().toUpperCase() === empId
      );

      if (!roleRow) {
        return json({
          error: "Employee ID not found. Contact HR if you believe this is an error.",
        }, 401);
      }

      const isActive = (roleRow[activeCol] || "TRUE").toUpperCase() !== "FALSE";
      if (!isActive) {
        return json({ error: "Your account has been deactivated. Contact HR." }, 403);
      }

      // Build people index to resolve name, email, and role
      const peopleIndex = buildPeopleIndex(pmRows, pmHeader, hrRows, hrHeader);
      const person      = peopleIndex[empId];
      const role        = detectRole(empId, peopleIndex);

      // HR admins cannot use the ID-only login path — they must use email+password
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
};

// Helper — builds { column_name_lowercase: index } from a header row
function headerIdx(row) {
  const idx = {};
  (row || []).forEach((h, i) => {
    if (h) idx[String(h).trim().toLowerCase().replace(/[\s()]/g, "_")] = i;
  });
  return idx;
}
