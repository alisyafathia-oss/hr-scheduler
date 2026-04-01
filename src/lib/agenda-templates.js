// src/lib/agenda-templates.js
// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE AGENDA SYSTEM
// Generates structured, pre-filled meeting agendas for every meeting type
// without requiring the Anthropic API. Each template pulls from the
// meeting record (employee name, type, dates, manager) to produce a
// personalised, ready-to-use agenda.
//
// HR can click "Generate Agenda", copy the output, and share it directly.
// Templates are designed to feel hand-crafted, not generic.
// ═══════════════════════════════════════════════════════════════════════════

const { format, parseISO, differenceInWeeks, differenceInCalendarMonths } = require("date-fns");

function fmt(dateStr) {
  if (!dateStr) return "TBD";
  try { return format(parseISO(dateStr), "d MMMM yyyy"); }
  catch { return dateStr; }
}

function fmtShort(dateStr) {
  if (!dateStr) return "TBD";
  try { return format(parseISO(dateStr), "d MMM yyyy"); }
  catch { return dateStr; }
}

// ── Individual template functions ──────────────────────────────────────────

function hrOnboarding({ employeeName, scheduledDate, managerEmail, department, contractEndDate }) {
  return {
    title: `HR Onboarding — ${employeeName}`,
    date: fmt(scheduledDate),
    duration: "60 minutes",
    attendees: [`${employeeName}`, "HR Representative"],
    sections: [
      {
        heading: "Welcome & introductions",
        duration: "10 min",
        items: [
          `Welcome ${employeeName} to the team`,
          "Brief introductions and roles overview",
          "Overview of today's agenda",
        ],
      },
      {
        heading: "Contract & employment terms",
        duration: "15 min",
        items: [
          `Contract period: ${fmtShort(scheduledDate)} – ${fmt(contractEndDate)}`,
          "Working hours, leave policy, and public holidays",
          "Probation period expectations (if applicable)",
          "Signing of any outstanding documents",
        ],
      },
      {
        heading: "Workplace policies",
        duration: "15 min",
        items: [
          "Code of conduct and professional standards",
          "Confidentiality and data privacy obligations",
          "Communication channels (Slack, email, calendar)",
          "Remote work and attendance policies",
        ],
      },
      {
        heading: "Benefits & tools setup",
        duration: "10 min",
        items: [
          "Benefits overview (medical, annual leave, etc.)",
          "IT access: email, systems, and tools",
          "Building access and practical logistics",
        ],
      },
      {
        heading: "Team introduction & first week plan",
        duration: "10 min",
        items: [
          `Reporting to: ${managerEmail}`,
          `Department: ${department || "your team"}`,
          "Upcoming team meetings to join",
          "First-week priorities and expectations",
        ],
      },
    ],
    closingNote: `Next step: Product Onboarding on day 5. Please reach out to HR or your manager with any questions in the meantime.`,
  };
}

function productOnboarding({ employeeName, scheduledDate, managerEmail, department }) {
  return {
    title: `Product Onboarding — ${employeeName}`,
    date: fmt(scheduledDate),
    duration: "90 minutes",
    attendees: [`${employeeName}`, "Manager / Team Lead", "Product Team"],
    sections: [
      {
        heading: "Product & company context",
        duration: "20 min",
        items: [
          "Company mission, vision, and current priorities",
          "Product overview: what we build and why",
          "Current roadmap and key milestones",
        ],
      },
      {
        heading: "Team structure & ways of working",
        duration: "20 min",
        items: [
          `Team: ${department || "Product"}`,
          `Direct manager: ${managerEmail}`,
          "Sprint/project cadence, standups, and rituals",
          "Decision-making process and escalation path",
        ],
      },
      {
        heading: "Tools & workflows walkthrough",
        duration: "25 min",
        items: [
          "Project management tools (Jira, Asana, Notion, etc.)",
          "Version control and deployment pipeline",
          "Documentation standards and where things live",
          "Reporting and communication norms",
        ],
      },
      {
        heading: "First project & goals",
        duration: "20 min",
        items: [
          `First assignment / project to pick up`,
          "Short-term goals for the first 30 days",
          "Definition of done for your role",
          "Who to contact for what",
        ],
      },
      {
        heading: "Q&A",
        duration: "5 min",
        items: ["Open floor for questions"],
      },
    ],
    closingNote: `${employeeName}'s manager will follow up with specific first-task assignments after this session.`,
  };
}

function interimFeedback({ employeeName, scheduledDate, managerEmail, contractStartDate, contractEndDate }) {
  const weeks = contractStartDate
    ? differenceInWeeks(parseISO(scheduledDate), parseISO(contractStartDate))
    : null;
  return {
    title: `Interim Feedback Review — ${employeeName}`,
    date: fmt(scheduledDate),
    duration: "45 minutes",
    attendees: [`${employeeName}`, "Manager", "HR Representative"],
    sections: [
      {
        heading: "Check-in",
        duration: "5 min",
        items: [
          `${weeks ? `Week ${weeks} of internship` : "Midpoint review"}`,
          "How are you settling in overall?",
        ],
      },
      {
        heading: "Performance against goals",
        duration: "15 min",
        items: [
          "Review of goals set at onboarding",
          "What has gone well so far?",
          "Where have challenges come up?",
          "Manager's observations and feedback",
        ],
      },
      {
        heading: "Development areas",
        duration: "10 min",
        items: [
          "Key skills being developed",
          "Learning opportunities taken or missed",
          "Support needed from the team or manager",
        ],
      },
      {
        heading: "Goals for the second half",
        duration: "10 min",
        items: [
          "Adjusted or new goals for the remaining period",
          `Target completion date: ${fmt(contractEndDate)}`,
          "Any deliverables or projects to wrap up",
        ],
      },
      {
        heading: "Well-being check",
        duration: "5 min",
        items: [
          "Workload and energy levels",
          "Team dynamics and culture fit",
          "Any concerns to address",
        ],
      },
    ],
    closingNote: `HR will document the outcomes of this review. A Final Feedback Review will be scheduled one week before ${fmtShort(contractEndDate)}.`,
  };
}

function finalFeedback({ employeeName, scheduledDate, managerEmail, contractEndDate }) {
  return {
    title: `Final Feedback Review — ${employeeName}`,
    date: fmt(scheduledDate),
    duration: "60 minutes",
    attendees: [`${employeeName}`, "Manager", "HR Representative"],
    sections: [
      {
        heading: "Opening",
        duration: "5 min",
        items: [`Contract ends: ${fmt(contractEndDate)}`, "Purpose of today's session"],
      },
      {
        heading: "Overall performance summary",
        duration: "20 min",
        items: [
          "Review of goals set at the start and midpoint",
          "Key achievements and contributions",
          "Areas where growth was strongest",
          "Challenges and lessons learned",
        ],
      },
      {
        heading: "Formal feedback exchange",
        duration: "15 min",
        items: [
          "Manager provides structured written feedback",
          `${employeeName} shares feedback on the experience`,
          "Team and culture reflections",
        ],
      },
      {
        heading: "Career & development conversation",
        duration: "10 min",
        items: [
          "Skills acquired during the internship",
          "Areas to focus on going forward",
          "Professional references and recommendations",
          "Potential future opportunities (if applicable)",
        ],
      },
      {
        heading: "Offboarding logistics preview",
        duration: "10 min",
        items: [
          "System access deactivation timeline",
          "Return of company equipment",
          "Final payroll and documentation",
          "Exit documentation requirements",
        ],
      },
    ],
    closingNote: `Thank ${employeeName} for their contributions. Final check-in scheduled for ${fmtShort(contractEndDate)}.`,
  };
}

function offboarding({ employeeName, scheduledDate, contractEndDate, employmentType }) {
  return {
    title: `Offboarding — ${employeeName}`,
    date: fmt(scheduledDate),
    duration: "60 minutes",
    attendees: [`${employeeName}`, "HR Representative", "IT (if required)"],
    sections: [
      {
        heading: "Last day / departure logistics",
        duration: "10 min",
        items: [
          `Final working day: ${fmt(contractEndDate)}`,
          "Access revocation timeline (email, systems, tools)",
          "Return of equipment checklist",
        ],
      },
      {
        heading: "Knowledge transfer",
        duration: "20 min",
        items: [
          "Outstanding work and handover plan",
          "Documentation to complete before departure",
          "Handover to: [team member to be confirmed]",
          "Any in-flight projects or deadlines to note",
        ],
      },
      {
        heading: "Administrative wrap-up",
        duration: "15 min",
        items: [
          "Final payroll and expense claims",
          "Leave balance payout (if applicable)",
          "Superannuation / pension / benefits finalisation",
          "Certificate of employment request",
        ],
      },
      {
        heading: "Exit interview",
        duration: "10 min",
        items: [
          "Overall experience at the company",
          "What worked well?",
          "What could be improved?",
          "Would you recommend us as an employer?",
        ],
      },
      {
        heading: "Farewell",
        duration: "5 min",
        items: [
          "Thank you and farewell message",
          "LinkedIn connection and reference process",
          "Stay-in-touch / alumni community information",
        ],
      },
    ],
    closingNote: `HR will send a formal offboarding confirmation email after this session with all administrative details.`,
  };
}

function oneOnOne({ employeeName, scheduledDate, managerEmail, quarter }) {
  const q = quarter || (scheduledDate < "2025-07-01" ? "Q2" : "Q3");
  return {
    title: `${q} 1:1 Review — ${employeeName}`,
    date: fmt(scheduledDate),
    duration: "45 minutes",
    attendees: [`${employeeName}`, `Manager (${managerEmail})`],
    sections: [
      {
        heading: "Personal check-in",
        duration: "5 min",
        items: ["How are you doing? Energy and motivation levels?"],
      },
      {
        heading: `${q} performance review`,
        duration: "15 min",
        items: [
          "Key deliverables and outcomes this quarter",
          "What are you most proud of?",
          "Where did things get harder than expected?",
        ],
      },
      {
        heading: "Goals alignment",
        duration: "10 min",
        items: [
          "Review of goals set last quarter",
          "What's on track, what needs adjustment?",
          "Next quarter priorities and focus areas",
        ],
      },
      {
        heading: "Development & growth",
        duration: "10 min",
        items: [
          "Skills you want to build next quarter",
          "Training or learning opportunities to explore",
          "What support do you need from your manager?",
        ],
      },
      {
        heading: "Open floor",
        duration: "5 min",
        items: ["Anything else on your mind?", "Blockers or concerns?"],
      },
    ],
    closingNote: `Summary notes will be shared after this session. Next formal review: ${q === "Q2" ? "Q3" : "year-end"}.`,
  };
}

function monthlyPdTracker({ employeeName, scheduledDate, managerEmail, notes }) {
  const monthLabel = scheduledDate
    ? format(parseISO(scheduledDate), "MMMM yyyy")
    : "this month";
  return {
    title: `Monthly P&D Tracker — ${employeeName} — ${monthLabel}`,
    date: fmt(scheduledDate),
    duration: "30 minutes",
    attendees: [`${employeeName}`, `Manager (${managerEmail})`],
    sections: [
      {
        heading: "Progress on current goals",
        duration: "10 min",
        items: [
          "What was completed this month?",
          "What is still in progress?",
          "Any blockers or risks?",
        ],
      },
      {
        heading: "Performance & delivery",
        duration: "10 min",
        items: [
          "Quality and timeliness of deliverables",
          "Collaboration and communication",
          "Any notable wins or concerns",
        ],
      },
      {
        heading: "Next month plan",
        duration: "10 min",
        items: [
          "Priorities for the coming month",
          "Adjustments to goals or timelines",
          "Support or resources needed",
        ],
      },
    ],
    closingNote: notes || `Progress logged for ${monthLabel}. Next tracker: first week of next month.`,
  };
}

function interimPdTracker({ employeeName, scheduledDate, managerEmail, contractStartDate, contractEndDate }) {
  return {
    title: `Interim P&D Tracker — ${employeeName}`,
    date: fmt(scheduledDate),
    duration: "45 minutes",
    attendees: [`${employeeName}`, `Manager (${managerEmail})`, "HR Representative"],
    sections: [
      {
        heading: "Contract progress overview",
        duration: "5 min",
        items: [
          `Contract period: ${fmtShort(contractStartDate)} – ${fmt(contractEndDate)}`,
          "Overall progress against original scope",
        ],
      },
      {
        heading: "Performance deep-dive",
        duration: "15 min",
        items: [
          "Review all goals set at contract start",
          "Achievements and delivered value",
          "Gaps and areas requiring attention",
          "Manager assessment: meeting expectations?",
        ],
      },
      {
        heading: "Development & feedback",
        duration: "15 min",
        items: [
          "Skills developed or strengthened",
          "Feedback from cross-functional stakeholders",
          "360 input (if available at this stage)",
        ],
      },
      {
        heading: "Second-half plan",
        duration: "10 min",
        items: [
          "Revised priorities for the remainder of the contract",
          "Key deliverables to target before end date",
          "Any contract extension discussions (if relevant)",
        ],
      },
    ],
    closingNote: `Interim P&D on record. Final P&D Tracker scheduled 2 weeks before ${fmtShort(contractEndDate)}.`,
  };
}

function finalPdTracker({ employeeName, scheduledDate, managerEmail, contractEndDate }) {
  return {
    title: `Final P&D Tracker — ${employeeName}`,
    date: fmt(scheduledDate),
    duration: "60 minutes",
    attendees: [`${employeeName}`, `Manager (${managerEmail})`, "HR Representative"],
    sections: [
      {
        heading: "Contract wrap-up overview",
        duration: "10 min",
        items: [
          `Contract end: ${fmt(contractEndDate)}`,
          "Summary of the full contract period",
        ],
      },
      {
        heading: "Final performance assessment",
        duration: "20 min",
        items: [
          "All goals: achieved / partially achieved / not achieved",
          "Quality and impact of work delivered",
          "Stakeholder and peer feedback",
          "Overall rating and written assessment",
        ],
      },
      {
        heading: "Development summary",
        duration: "15 min",
        items: [
          "Key competencies demonstrated",
          "Growth areas throughout the contract",
          "Recommendations for career development",
        ],
      },
      {
        heading: "Transition & handover",
        duration: "15 min",
        items: [
          "Outstanding work and handover requirements",
          "Documentation to complete before last day",
          "Contract renewal or future opportunities discussion",
        ],
      },
    ],
    closingNote: `Final P&D formally closed. Offboarding session to follow.`,
  };
}

function devPlan360({ employeeName, scheduledDate, managerEmail, department }) {
  return {
    title: `360° Development Plan Review — ${employeeName}`,
    date: fmt(scheduledDate),
    duration: "60 minutes",
    attendees: [`${employeeName}`, `Manager (${managerEmail})`, "HR Representative", "Peers (optional)"],
    sections: [
      {
        heading: "360° feedback summary",
        duration: "15 min",
        items: [
          "Overview of feedback collected from manager, peers, and self",
          "Key themes: strengths identified",
          "Key themes: development areas identified",
          "Any surprises or notable patterns",
        ],
      },
      {
        heading: "Self-assessment reflection",
        duration: "10 min",
        items: [
          `${employeeName}'s own perspective on performance`,
          "Alignment or divergence from peer/manager feedback",
          "Personal growth priorities",
        ],
      },
      {
        heading: "Development plan construction",
        duration: "20 min",
        items: [
          "Top 2–3 focus areas for the next 12 months",
          "Specific actions and milestones for each area",
          "Learning resources, mentors, or programmes to engage",
          "Manager's commitment and support plan",
        ],
      },
      {
        heading: "Career trajectory discussion",
        duration: "10 min",
        items: [
          "Short-term career goals (next 12 months)",
          "Medium-term aspirations (2–3 years)",
          "Role progression opportunities within the company",
        ],
      },
      {
        heading: "Agreement & sign-off",
        duration: "5 min",
        items: [
          "Development plan signed off by employee and manager",
          "Check-in cadence agreed",
          "HR copies filed",
        ],
      },
    ],
    closingNote: `Development plan document to be shared within 48 hours. Midyear Review will assess progress against these goals.`,
  };
}

function midyearReview({ employeeName, scheduledDate, managerEmail }) {
  return {
    title: `Midyear Review — ${employeeName}`,
    date: fmt(scheduledDate),
    duration: "60 minutes",
    attendees: [`${employeeName}`, `Manager (${managerEmail})`, "HR Representative"],
    sections: [
      {
        heading: "First half performance recap",
        duration: "15 min",
        items: [
          "Progress against annual goals and KPIs",
          "Key contributions and achievements (H1)",
          "Challenges faced and how they were handled",
        ],
      },
      {
        heading: "360° development plan check-in",
        duration: "15 min",
        items: [
          "Progress on development areas agreed in June",
          "Evidence of growth or change",
          "Adjustments needed to the plan",
        ],
      },
      {
        heading: "Second half goal-setting",
        duration: "20 min",
        items: [
          "H2 priorities aligned to company direction",
          "Updated or new KPIs for the second half",
          "Key projects and milestones to target",
          "Resources or support required",
        ],
      },
      {
        heading: "Well-being and engagement",
        duration: "5 min",
        items: [
          "Energy and motivation levels",
          "Team dynamics and collaboration",
          "Any concerns to flag",
        ],
      },
      {
        heading: "Summary & next steps",
        duration: "5 min",
        items: [
          "Agreed actions and owners",
          "Next formal touchpoint: Year-end review",
        ],
      },
    ],
    closingNote: `Midyear review documented. Year-end review to be scheduled in November.`,
  };
}

// ── Master dispatch ────────────────────────────────────────────────────────

/**
 * generateAgenda(meeting, employeeContext)
 * @param {Object} meeting — ScheduledMeeting record
 * @param {Object} ctx     — extra context: { contractStartDate, contractEndDate, department }
 * @returns {Object} agenda object with title, date, sections[], closingNote
 */
function generateAgenda(meeting, ctx = {}) {
  const params = {
    employeeName: meeting.employeeName,
    scheduledDate: meeting.scheduledDate,
    managerEmail: meeting.managerEmail,
    contractStartDate: ctx.contractStartDate,
    contractEndDate: ctx.contractEndDate,
    department: ctx.department,
    employmentType: ctx.employmentType,
    notes: meeting.notes,
  };

  switch (meeting.meetingType) {
    case "HR_ONBOARDING":      return hrOnboarding(params);
    case "PRODUCT_ONBOARDING": return productOnboarding(params);
    case "INTERIM_FEEDBACK":   return interimFeedback(params);
    case "FINAL_FEEDBACK":     return finalFeedback(params);
    case "OFFBOARDING":        return offboarding(params);
    case "ONE_ON_ONE_Q2":      return oneOnOne({ ...params, quarter: "Q2" });
    case "ONE_ON_ONE_Q3":      return oneOnOne({ ...params, quarter: "Q3" });
    case "MONTHLY_PD_TRACKER": return monthlyPdTracker(params);
    case "INTERIM_PD_TRACKER": return interimPdTracker(params);
    case "FINAL_PD_TRACKER":   return finalPdTracker(params);
    case "DEV_PLAN_360":       return devPlan360(params);
    case "MIDYEAR_REVIEW":     return midyearReview(params);
    case "FINAL_CHECKIN":
      return {
        title: `Final Check-in — ${meeting.employeeName}`,
        date: fmt(meeting.scheduledDate),
        duration: "30 minutes",
        attendees: [meeting.employeeName, `Manager (${meeting.managerEmail})`],
        sections: [
          { heading: "Last reflections", duration: "10 min", items: ["How did the internship go overall?", "Biggest takeaway or learning"] },
          { heading: "Practical wrap-up", duration: "10 min", items: ["Any unfinished tasks?", "Access and equipment return confirmed?"] },
          { heading: "Farewell", duration: "10 min", items: ["Thank you and best wishes", "Stay connected — LinkedIn, alumni network"] },
        ],
        closingNote: `Thank you, ${meeting.employeeName}. Wishing you all the best in your next steps.`,
      };
    default:
      return {
        title: `${meeting.label} — ${meeting.employeeName}`,
        date: fmt(meeting.scheduledDate),
        duration: `${meeting.durationMins} minutes`,
        attendees: [meeting.employeeName, `Manager (${meeting.managerEmail})`],
        sections: [
          { heading: "Review & discussion", duration: `${meeting.durationMins} min`, items: ["Review progress and updates", "Address any concerns", "Set next steps"] },
        ],
        closingNote: "Follow-up actions to be documented and shared.",
      };
  }
}

/**
 * agendaToText(agenda)
 * Formats an agenda object as plain text suitable for copy-paste into email.
 */
function agendaToText(agenda) {
  const lines = [
    `MEETING AGENDA`,
    `══════════════════════════════════════════`,
    `${agenda.title}`,
    `Date: ${agenda.date}`,
    `Duration: ${agenda.duration}`,
    `Attendees: ${agenda.attendees.join(", ")}`,
    `══════════════════════════════════════════`,
    "",
  ];

  agenda.sections.forEach((section, i) => {
    lines.push(`${i + 1}. ${section.heading.toUpperCase()} (${section.duration})`);
    section.items.forEach((item) => lines.push(`   • ${item}`));
    lines.push("");
  });

  if (agenda.closingNote) {
    lines.push(`NOTE: ${agenda.closingNote}`);
  }

  return lines.join("\n");
}

module.exports = { generateAgenda, agendaToText };
