// src/lib/column-map.js
// ═══════════════════════════════════════════════════════════════════════════
// COLUMN MAPPER
// Translates your real Google Sheet column names to the internal field names
// the engine uses. Update this file if your sheet columns ever change —
// nothing else in the codebase needs to touch raw column names.
//
// How it works:
//   Each mapper receives a raw row (array of cell values) and the header row
//   (array of column names). It finds each field by header name (case-
//   insensitive, trims whitespace) rather than by position, so reordering
//   columns in the sheet never breaks anything.
// ═══════════════════════════════════════════════════════════════════════════

// ── Generic header-to-index resolver ──────────────────────────────────────

function buildIndex(headerRow) {
  const index = {};
  (headerRow || []).forEach((h, i) => {
    if (h) index[String(h).trim().toLowerCase()] = i;
  });
  return index;
}

function get(row, index, ...candidateNames) {
  for (const name of candidateNames) {
    const i = index[name.toLowerCase()];
    if (i !== undefined && row[i] !== undefined && row[i] !== "") {
      return String(row[i]).trim();
    }
  }
  return "";
}

// ── Contracts sheet mapper ─────────────────────────────────────────────────
// Your columns: Employee_ID | Employee Name | Role | Type | Business Unit |
//               Start Date  | End Date      | Status | Manager
//
// "Type" values in your sheet: "intern" | "employee"
// We map "employee" → "contract" internally so the right rule set fires.
// Permanent employees live only in People Master, not here.

function mapContractRow(row, headerRow) {
  const idx = buildIndex(headerRow);

  const rawType = get(row, idx, "type", "employment type", "contract type").toLowerCase();

  // Normalise type: intern stays intern, employee → contract
  let type = "contract";
  if (rawType === "intern") type = "intern";
  else if (rawType === "permanent") type = "permanent";
  // "employee" falls through to default "contract" ✓

  const status = get(row, idx, "status").toLowerCase();

  return {
    id:           get(row, idx, "employee_id", "employee id", "id"),
    name:         get(row, idx, "employee name", "employee_name", "name", "full name"),
    // Contracts sheet has no email column — email is looked up from People Master by ID
    email:        "",
    workEmail:    "",
    type,
    start:        get(row, idx, "start date", "start_date", "startdate", "commencement date"),
    end:          get(row, idx, "end date", "end_date", "enddate", "expiry date"),
    status:       status || "active",
    managerName:  get(row, idx, "manager", "manager name", "manager_name", "reporting to"),
    department:   get(row, idx, "business unit", "business_unit", "department", "division", "team"),
    jobTitle:     get(row, idx, "role", "job title", "designation", "position"),
    // Raw row kept for debugging
    _raw: row,
  };
}

// ── People Master sheet mapper ─────────────────────────────────────────────
// Your columns: Employee_ID | Employee_Name | Initials | Employment_Type |
//               Designation | Join Date | Email (Gmail) | Work Email
//
// Permanent employees are those whose Employment_Type is NOT intern/employee/contract.
// Work Email is used for notifications. Employee_ID is used for login.

function mapPeopleRow(row, headerRow) {
  const idx = buildIndex(headerRow);

  const empType = get(row, idx, "employment_type", "employment type", "type").toLowerCase();

  // Detect permanent: anything that isn't intern/employee/contract
  const nonPermanent = ["intern", "employee", "contract"];
  const isPermanent  = !nonPermanent.includes(empType) && empType !== "";

  return {
    id:            get(row, idx, "employee_id", "employee id", "id"),
    name:          get(row, idx, "employee_name", "employee name", "name", "full name"),
    initials:      get(row, idx, "initials"),
    employmentType: empType,
    isPermanent,
    designation:   get(row, idx, "designation", "job title", "position", "role"),
    joinDate:      get(row, idx, "join date", "join_date", "joindate", "start date"),
    gmailEmail:    get(row, idx, "email (gmail)", "gmail", "personal email", "email"),
    workEmail:     get(row, idx, "work email", "work_email", "email address", "company email"),
    // HR_Role tab fields (merged in later)
    hrRole:        null,   // "hr_admin" | "team_head" | "employee"
    isTeamHead:    false,
    _raw: row,
  };
}

// ── HR Roles tab mapper ────────────────────────────────────────────────────
// New tab in the scheduler workbook.
// Columns: Employee_ID | Name | Work_Email | HR_Role | Is_Active
// HR_Role values: hr_admin | team_head | employee

function mapHRRoleRow(row, headerRow) {
  const idx = buildIndex(headerRow);
  return {
    id:        get(row, idx, "employee_id", "employee id", "id"),
    name:      get(row, idx, "name", "employee_name", "employee name"),
    workEmail: get(row, idx, "work_email", "work email", "email"),
    hrRole:    get(row, idx, "hr_role", "hr role", "role").toLowerCase() || "employee",
    isActive:  get(row, idx, "is_active", "active", "status").toLowerCase() !== "false",
  };
}

// ── People index builder ───────────────────────────────────────────────────
// Merges People Master + HR Roles tab into a single lookup map keyed by
// Employee_ID. Used by the engine and auth to resolve emails and roles.

function buildPeopleIndex(peopleRows, peopleHeader, hrRoleRows, hrRoleHeader) {
  const index = {};

  // 1. Load People Master
  for (const row of peopleRows) {
    const p = mapPeopleRow(row, peopleHeader);
    if (!p.id) continue;
    index[p.id.toUpperCase()] = p;
  }

  // 2. Overlay HR Roles tab (adds/overrides hrRole and isTeamHead)
  for (const row of (hrRoleRows || [])) {
    const r = mapHRRoleRow(row, hrRoleHeader || []);
    if (!r.id) continue;
    const key = r.id.toUpperCase();
    if (!index[key]) {
      // Person exists in HR Roles but not People Master — create stub
      index[key] = {
        id: r.id, name: r.name, workEmail: r.workEmail,
        gmailEmail: "", employmentType: "", isPermanent: false,
        designation: "", joinDate: "", initials: "",
        hrRole: r.hrRole, isTeamHead: r.hrRole === "team_head",
      };
    } else {
      index[key].hrRole    = r.hrRole;
      index[key].isTeamHead = r.hrRole === "team_head";
      // Use work email from HR Roles tab if People Master had none
      if (!index[key].workEmail && r.workEmail) index[key].workEmail = r.workEmail;
    }
  }

  return index;
}

// ── Role detection (used by auth) ──────────────────────────────────────────
// Returns "hr_admin" | "team_head" | "employee"
// Priority: HR Roles tab > Designation keyword match > default employee

function detectRole(employeeId, peopleIndex) {
  if (!employeeId) return "employee";
  const person = peopleIndex[employeeId.toUpperCase()];
  if (!person) return "employee";

  // Explicit HR_Role column wins
  if (person.hrRole === "hr_admin")  return "hr_admin";
  if (person.hrRole === "team_head") return "team_head";

  // Fallback: designation keyword matching for team heads
  const designation = (person.designation || "").toLowerCase();
  const teamHeadKeywords = [
    "head of", "director", "ceo", "chief", "vp ", "vice president",
    "managing director", "md", "coo", "cto", "cfo",
  ];
  if (teamHeadKeywords.some((kw) => designation.includes(kw))) return "team_head";

  // Permanent employees without a team head designation
  return "employee";
}

module.exports = {
  buildIndex,
  get,
  mapContractRow,
  mapPeopleRow,
  mapHRRoleRow,
  buildPeopleIndex,
  detectRole,
};
