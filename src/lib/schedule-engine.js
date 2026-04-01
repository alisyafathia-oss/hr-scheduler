// src/lib/schedule-engine.js  (v2)
// ═══════════════════════════════════════════════════════════════════════════
// HR SCHEDULING ENGINE — adapted to real sheet column names
//
// Data sources:
//   Contracts sheet  → interns + contract employees  (Type: intern / employee)
//   People Master    → permanent employees + email lookup for everyone
//   HR Roles tab     → access level overrides (hr_admin / team_head / employee)
//
// "employee" in the Type column is treated as "contract" internally.
// ═══════════════════════════════════════════════════════════════════════════

const {
  addDays, subDays, differenceInCalendarMonths, addMonths,
  isAfter, isBefore, isWeekend, format, parseISO, startOfDay,
} = require("date-fns");

const { mapContractRow, buildPeopleIndex } = require("./column-map");

// ── Meeting type catalogue ─────────────────────────────────────────────────

const MEETING_TYPES = {
  HR_ONBOARDING:      { label: "HR Onboarding",           durationMins: 60,  group: false },
  PRODUCT_ONBOARDING: { label: "Product Onboarding",      durationMins: 90,  group: false },
  INTERIM_FEEDBACK:   { label: "Interim Feedback Review", durationMins: 45,  group: false },
  FINAL_FEEDBACK:     { label: "Final Feedback Review",   durationMins: 60,  group: false },
  FINAL_CHECKIN:      { label: "Final Check-in",          durationMins: 30,  group: false },
  OFFBOARDING:        { label: "Offboarding",             durationMins: 60,  group: false },
  ONE_ON_ONE_Q2:      { label: "1:1 Q2 Review",           durationMins: 45,  group: false },
  ONE_ON_ONE_Q3:      { label: "1:1 Q3 Review",           durationMins: 45,  group: false },
  MONTHLY_PD_TRACKER: { label: "Monthly P&D Tracker",     durationMins: 30,  group: false },
  INTERIM_PD_TRACKER: { label: "Interim P&D Tracker",     durationMins: 45,  group: false },
  FINAL_PD_TRACKER:   { label: "Final P&D Tracker",       durationMins: 60,  group: false },
  DEV_PLAN_360:       { label: "360° Dev Plan Review",    durationMins: 60,  group: true  },
  MIDYEAR_REVIEW:     { label: "Midyear Review",          durationMins: 60,  group: true  },
  ANNUAL_REVIEW:      { label: "Annual Review",           durationMins: 60,  group: false },
};

// ── Date helpers ───────────────────────────────────────────────────────────

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return startOfDay(value);
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return startOfDay(parseISO(s));
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return startOfDay(new Date(+y, +m - 1, +d));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : startOfDay(d);
}

function nextWorkday(date) {
  if (!date) return null;
  let d = date;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

function formatDate(date) { return format(date, "yyyy-MM-dd"); }

function getQ2Date(year) { return nextWorkday(new Date(year, 3, 1)); }
function getQ3Date(year) { return nextWorkday(new Date(year, 6, 1)); }

function monthlyDates(start, end) {
  const dates = [];
  let cursor = startOfDay(new Date(start.getFullYear(), start.getMonth(), 1));
  while (isBefore(cursor, end) || cursor.getTime() === end.getTime()) {
    const wd = nextWorkday(cursor);
    if (isAfter(wd, start) && isBefore(wd, end)) dates.push(wd);
    cursor = addMonths(cursor, 1);
  }
  return dates;
}

// ── Meeting factory ────────────────────────────────────────────────────────

function meeting(type, date, employee, options = {}) {
  if (!date) return null;
  const meta = MEETING_TYPES[type];
  if (!meta) throw new Error(`Unknown meeting type: ${type}`);
  return {
    id:              `${employee.id}_${type}_${formatDate(date)}`,
    employeeId:      employee.id,
    employeeName:    employee.name,
    employeeEmail:   employee.workEmail || employee.email || "",
    managerId:       employee.managerId  || "",
    managerName:     employee.managerName || "",
    managerEmail:    employee.managerEmail || "",
    meetingType:     type,
    label:           meta.label,
    durationMins:    meta.durationMins,
    isGroupSession:  meta.group,
    scheduledDate:   formatDate(date),
    status:          "pending",
    calendarEventId: null,
    slotId:          null,
    department:      employee.department || "",
    jobTitle:        employee.jobTitle   || "",
    notes:           options.notes || "",
    createdAt:       new Date().toISOString(),
    ...options,
  };
}

// ── Rule sets ──────────────────────────────────────────────────────────────

function calculateInternMeetings(employee, start, end) {
  const meetings = [];
  const totalDays = Math.floor((end - start) / 86400000);
  const midpoint  = addDays(start, Math.floor(totalDays / 2));
  const year      = start.getFullYear();

  meetings.push(meeting("HR_ONBOARDING",      nextWorkday(start),              employee));
  meetings.push(meeting("PRODUCT_ONBOARDING",  nextWorkday(addDays(start, 4)), employee));
  meetings.push(meeting("INTERIM_FEEDBACK",    nextWorkday(midpoint),           employee));

  const offboarding = nextWorkday(subDays(end, 14));
  if (isAfter(offboarding, addDays(start, 7))) {
    meetings.push(meeting("OFFBOARDING", offboarding, employee));
  }
  const finalFeedback = nextWorkday(subDays(end, 7));
  if (isAfter(finalFeedback, midpoint)) {
    meetings.push(meeting("FINAL_FEEDBACK", finalFeedback, employee));
  }
  meetings.push(meeting("FINAL_CHECKIN", nextWorkday(subDays(end, 1)), employee));

  const q2 = getQ2Date(year);
  const q3 = getQ3Date(year);
  if (isAfter(q2, start) && isBefore(q2, end)) meetings.push(meeting("ONE_ON_ONE_Q2", q2, employee));
  if (isAfter(q3, start) && isBefore(q3, end)) meetings.push(meeting("ONE_ON_ONE_Q3", q3, employee));

  return meetings.filter(Boolean);
}

function calculateContractMeetings(employee, start, end) {
  const meetings = [];
  const totalMonths  = differenceInCalendarMonths(end, start);
  const midMonthDate = addMonths(start, Math.floor(totalMonths / 2));
  const year         = start.getFullYear();

  monthlyDates(start, end).forEach((d, i, arr) => {
    meetings.push(meeting("MONTHLY_PD_TRACKER", d, employee, { notes: `Month ${i + 1} of ${arr.length}` }));
  });

  meetings.push(meeting("INTERIM_PD_TRACKER", nextWorkday(midMonthDate), employee));

  const finalDate = nextWorkday(subDays(end, 14));
  if (isAfter(finalDate, nextWorkday(midMonthDate))) {
    meetings.push(meeting("FINAL_PD_TRACKER", finalDate, employee));
  }

  meetings.push(meeting("OFFBOARDING", nextWorkday(subDays(end, 7)), employee));

  const q2 = getQ2Date(year);
  const q3 = getQ3Date(year);
  if (isAfter(q2, start) && isBefore(q2, end)) meetings.push(meeting("ONE_ON_ONE_Q2", q2, employee));
  if (isAfter(q3, start) && isBefore(q3, end)) meetings.push(meeting("ONE_ON_ONE_Q3", q3, employee));

  const devPlan = nextWorkday(new Date(year, 5, 15));
  if (isAfter(devPlan, start) && isBefore(devPlan, end)) meetings.push(meeting("DEV_PLAN_360", devPlan, employee));

  const midyear = nextWorkday(new Date(year, 6, 1));
  if (isAfter(midyear, start) && isBefore(midyear, end)) meetings.push(meeting("MIDYEAR_REVIEW", midyear, employee));

  return meetings.filter(Boolean);
}

function calculatePermanentMeetings(employee, start) {
  const meetings = [];
  const year = new Date().getFullYear();

  const q2 = getQ2Date(year);
  const q3 = getQ3Date(year);
  if (isAfter(q2, start)) meetings.push(meeting("ONE_ON_ONE_Q2", q2, employee));
  if (isAfter(q3, start)) meetings.push(meeting("ONE_ON_ONE_Q3", q3, employee));

  const devPlan = nextWorkday(new Date(year, 5, 15));
  if (isAfter(devPlan, start)) meetings.push(meeting("DEV_PLAN_360", devPlan, employee));

  const midyear = nextWorkday(new Date(year, 6, 1));
  if (isAfter(midyear, start)) meetings.push(meeting("MIDYEAR_REVIEW", midyear, employee));

  const annual = nextWorkday(new Date(year, 11, 1));
  if (isAfter(annual, start)) meetings.push(meeting("ANNUAL_REVIEW", annual, employee));

  return meetings.filter(Boolean);
}

// ── Manager name → email resolver ─────────────────────────────────────────
// Contracts stores the manager as a text name. We fuzzy-match against
// People Master to get their work email for calendar invites.

function resolveManagerEmail(managerName, peopleIndex) {
  if (!managerName) return "";
  const needle = managerName.trim().toLowerCase();
  for (const person of Object.values(peopleIndex)) {
    const hay = (person.name || "").toLowerCase();
    if (hay === needle || hay.includes(needle) || needle.includes(hay)) {
      return person.workEmail || "";
    }
  }
  return "";
}

// ── Main entry point ───────────────────────────────────────────────────────
//
// Parameters (all raw sheet data with header rows):
//   contractRows    — data rows from Contracts sheet (no header)
//   contractHeader  — header row from Contracts sheet
//   peopleRows      — data rows from People Master (no header)
//   peopleHeader    — header row from People Master
//   hrRoleRows      — data rows from HR Roles tab  (no header)
//   hrRoleHeader    — header row from HR Roles tab
//   existingIds     — Set of meeting IDs already in the Meetings sheet

function generateSchedule({
  contractRows   = [],
  contractHeader = [],
  peopleRows     = [],
  peopleHeader   = [],
  hrRoleRows     = [],
  hrRoleHeader   = [],
  existingIds    = new Set(),
}) {
  const errors = [];
  const allNew = [];

  // Build unified people lookup keyed by UPPER-CASE Employee_ID
  const peopleIndex = buildPeopleIndex(peopleRows, peopleHeader, hrRoleRows, hrRoleHeader);

  // ── Pass 1: Contracts sheet — interns + contract employees ─────────────
  const activeStatuses = ["active", "current", "ongoing", ""];

  for (const row of contractRows) {
    const emp = mapContractRow(row, contractHeader);
    if (!emp.id) continue;
    if (!activeStatuses.includes(emp.status.toLowerCase())) continue;

    // Enrich with People Master
    const person = peopleIndex[emp.id.toUpperCase()];
    if (person) {
      emp.workEmail  = person.workEmail;
      emp.email      = person.workEmail || person.gmailEmail;
      emp.jobTitle   = emp.jobTitle || person.designation;
    }
    emp.managerEmail = resolveManagerEmail(emp.managerName, peopleIndex);

    const start = parseDate(emp.start);
    const end   = parseDate(emp.end);

    if (!start) {
      errors.push(`${emp.name} (${emp.id}): invalid start date "${emp.start}"`);
      continue;
    }

    try {
      let newMeetings = [];
      if (emp.type === "intern") {
        if (!end) { errors.push(`${emp.name}: intern has no end date`); continue; }
        newMeetings = calculateInternMeetings(emp, start, end);
      } else {
        // "employee" in sheet → contract rules
        if (!end) { errors.push(`${emp.name}: contract employee has no end date`); continue; }
        newMeetings = calculateContractMeetings(emp, start, end);
      }
      allNew.push(...newMeetings.filter((m) => !existingIds.has(m.id)));
    } catch (err) {
      errors.push(`${emp.name} (${emp.id}): ${err.message}`);
    }
  }

  // ── Pass 2: Permanent employees from People Master only ────────────────
  for (const person of Object.values(peopleIndex)) {
    if (!person.isPermanent) continue;

    const start = parseDate(person.joinDate);
    if (!start) continue;

    const emp = {
      id:          person.id,
      name:        person.name,
      workEmail:   person.workEmail,
      email:       person.workEmail || person.gmailEmail,
      managerEmail: "",
      managerName:  "",
      department:  "",
      jobTitle:    person.designation,
    };

    try {
      const newMeetings = calculatePermanentMeetings(emp, start);
      allNew.push(...newMeetings.filter((m) => !existingIds.has(m.id)));
    } catch (err) {
      errors.push(`${person.name} (${person.id}): ${err.message}`);
    }
  }

  allNew.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return { meetings: allNew, errors };
}

// ── Sheet row serialisation ────────────────────────────────────────────────

function meetingToRow(m) {
  return [
    m.id, m.employeeId, m.employeeName, m.employeeEmail, m.managerEmail,
    m.meetingType, m.label, m.scheduledDate, m.durationMins,
    m.isGroupSession ? "true" : "false",
    m.status, m.calendarEventId || "", m.slotId || "",
    m.notes || "", m.createdAt,
  ];
}

function rowToMeeting(row) {
  if (!row || row.length < 12) return null;
  return {
    id:              row[0],
    employeeId:      row[1],
    employeeName:    row[2],
    employeeEmail:   row[3],
    managerEmail:    row[4],
    meetingType:     row[5],
    label:           row[6],
    scheduledDate:   row[7],
    durationMins:    parseInt(row[8]) || 30,
    isGroupSession:  row[9] === "true",
    status:          row[10] || "pending",
    calendarEventId: row[11] || null,
    slotId:          row[12] || null,
    notes:           row[13] || "",
    createdAt:       row[14] || "",
  };
}

module.exports = {
  generateSchedule,
  calculateInternMeetings,
  calculateContractMeetings,
  calculatePermanentMeetings,
  meetingToRow,
  rowToMeeting,
  parseDate,
  formatDate,
  resolveManagerEmail,
  MEETING_TYPES,
};
