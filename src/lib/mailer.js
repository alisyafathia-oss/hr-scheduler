// src/lib/mailer.js
// ─────────────────────────────────────────────────────────────────────────
// Sends notification emails via Microsoft 365 SMTP.
// Emails appear to come from your HR work address (e.g. hr@yourcompany.com).
//
// Required env vars:
//   M365_USER          — the sending email address (e.g. hr@yourcompany.com)
//   M365_PASSWORD      — the Microsoft 365 account password (or App Password
//                        if MFA is enabled — see setup guide)
//
// Microsoft 365 SMTP settings (these never change):
//   Host: smtp.office365.com
//   Port: 587
//   Security: STARTTLS
// ─────────────────────────────────────────────────────────────────────────

const nodemailer = require("nodemailer");

function getTransporter() {
  return nodemailer.createTransport({
    host:   "smtp.office365.com",
    port:   587,
    secure: false, // STARTTLS — Office 365 requires this (not port 465)
    auth: {
      user: process.env.M365_USER,
      pass: process.env.M365_PASSWORD,
    },
    tls: {
      ciphers: "SSLv3",
      rejectUnauthorized: true,
    },
  });
}

const FROM = () =>
  `HR Scheduling <${process.env.M365_USER}>`;

const APP_URL = () =>
  process.env.APP_URL || "https://your-site.netlify.app";

// ── Shared HTML wrapper ───────────────────────────────────────────────────

function wrap(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#f3f4f6; font-family:Arial,sans-serif; }
  .outer { max-width:560px; margin:32px auto; background:#fff;
           border-radius:10px; overflow:hidden; border:1px solid #e5e7eb; }
  .header { background:#085041; padding:24px 28px; }
  .header h1 { margin:0; color:#fff; font-size:17px; font-weight:600; }
  .header p  { margin:4px 0 0; color:rgba(255,255,255,.7); font-size:13px; }
  .body { padding:24px 28px; color:#374151; font-size:14px; line-height:1.6; }
  .detail-table { width:100%; border-collapse:collapse; margin:16px 0; }
  .detail-table td { padding:8px 0; vertical-align:top; }
  .detail-table td:first-child { color:#6b7280; width:130px; font-size:13px; }
  .detail-table td:last-child  { font-weight:600; color:#111827; }
  .btn { display:inline-block; padding:11px 22px; border-radius:6px;
         text-decoration:none; font-weight:600; font-size:14px; margin-top:8px; }
  .btn-teal { background:#0f6e56; color:#fff; }
  .btn-dark { background:#111827; color:#fff; }
  .footer { background:#f9fafb; border-top:1px solid #e5e7eb;
            padding:16px 28px; font-size:12px; color:#9ca3af; }
</style>
</head>
<body><div class="outer">${content}</div></body>
</html>`;
}

// ── Email templates ───────────────────────────────────────────────────────

function bookingConfirmationEmail({
  employeeName, employeeEmail, managerEmail,
  meetingLabel, scheduledDate, startTime, durationMins, calendarLink,
}) {
  const subject = `Confirmed: ${meetingLabel} — ${scheduledDate}`;
  const html = wrap(`
    <div class="header">
      <h1>Meeting confirmed</h1>
      <p>${meetingLabel}</p>
    </div>
    <div class="body">
      <p>Hi ${employeeName},</p>
      <p>Your meeting has been confirmed. Details below:</p>
      <table class="detail-table">
        <tr><td>Meeting</td><td>${meetingLabel}</td></tr>
        <tr><td>Date</td><td>${scheduledDate}</td></tr>
        <tr><td>Time</td><td>${startTime || "To be confirmed"}</td></tr>
        <tr><td>Duration</td><td>${durationMins} minutes</td></tr>
      </table>
      ${calendarLink
        ? `<a href="${calendarLink}" class="btn btn-teal">Add to Calendar</a>`
        : ""}
      <p style="margin-top:20px;font-size:13px;color:#6b7280">
        View your full schedule at <a href="${APP_URL()}" style="color:#0f6e56">${APP_URL()}</a>
      </p>
    </div>
    <div class="footer">This is an automated message from HR Scheduling. Please do not reply to this email.</div>
  `);

  return {
    from:    FROM(),
    to:      [employeeEmail, managerEmail].filter(Boolean).join(", "),
    subject,
    html,
  };
}

function votingInviteEmail({
  employeeName, employeeEmail, meetingLabel, voteUrl, voteDeadline, slots,
}) {
  const slotList = (slots || [])
    .map((s) => `<li style="margin:6px 0;color:#374151">${s.date} at ${s.time}</li>`)
    .join("");

  const subject = `Action needed: Vote for your ${meetingLabel} time slot`;
  const html = wrap(`
    <div class="header">
      <h1>Vote for your preferred time</h1>
      <p>${meetingLabel}</p>
    </div>
    <div class="body">
      <p>Hi ${employeeName},</p>
      <p>HR has proposed the following time slots for your upcoming <strong>${meetingLabel}</strong>.
         Please vote for your preferred time.</p>
      <p><strong>Available slots:</strong></p>
      <ul style="margin:8px 0 16px;padding-left:20px">${slotList}</ul>
      <table class="detail-table">
        <tr><td>Voting closes</td><td>${voteDeadline}</td></tr>
      </table>
      <a href="${voteUrl}" class="btn btn-teal">Cast My Vote</a>
      <p style="margin-top:16px;font-size:13px;color:#6b7280">
        The most-voted slot wins. If there's a tie, your team head will make the final call.
      </p>
    </div>
    <div class="footer">This is an automated message from HR Scheduling. Please do not reply to this email.</div>
  `);

  return {
    from:    FROM(),
    to:      employeeEmail,
    subject,
    html,
  };
}

function cancellationEmail({
  employeeName, employeeEmail, managerEmail,
  meetingLabel, scheduledDate, rebookUrl,
}) {
  const subject = `Cancelled: ${meetingLabel} — ${scheduledDate}`;
  const html = wrap(`
    <div class="header" style="background:#7f1d1d">
      <h1>Meeting cancelled</h1>
      <p>${meetingLabel}</p>
    </div>
    <div class="body">
      <p>Hi ${employeeName},</p>
      <p>Your <strong>${meetingLabel}</strong> scheduled for <strong>${scheduledDate}</strong>
         has been cancelled.</p>
      <p>The slot has been reopened and is available for rebooking.</p>
      ${rebookUrl
        ? `<a href="${rebookUrl}" class="btn btn-dark">Rebook Now</a>`
        : ""}
      <p style="margin-top:16px;font-size:13px;color:#6b7280">
        If you have questions, contact HR at
        <a href="mailto:${process.env.M365_USER}" style="color:#0f6e56">${process.env.M365_USER}</a>
      </p>
    </div>
    <div class="footer">This is an automated message from HR Scheduling. Please do not reply to this email.</div>
  `);

  return {
    from:    FROM(),
    to:      [employeeEmail, managerEmail].filter(Boolean).join(", "),
    subject,
    html,
  };
}

function voteResultEmail({
  attendeeEmails, meetingLabel, winningSlot, calendarLink,
}) {
  const subject = `Confirmed: ${meetingLabel} — ${winningSlot.date} at ${winningSlot.time}`;
  const html = wrap(`
    <div class="header">
      <h1>Time confirmed</h1>
      <p>${meetingLabel}</p>
    </div>
    <div class="body">
      <p>The vote for <strong>${meetingLabel}</strong> is complete. Here's the confirmed time:</p>
      <table class="detail-table">
        <tr><td>Date</td><td>${winningSlot.date}</td></tr>
        <tr><td>Time</td><td>${winningSlot.time}</td></tr>
      </table>
      ${calendarLink
        ? `<a href="${calendarLink}" class="btn btn-teal">Add to Calendar</a>`
        : ""}
    </div>
    <div class="footer">This is an automated message from HR Scheduling. Please do not reply to this email.</div>
  `);

  return {
    from:    FROM(),
    to:      attendeeEmails.join(", "),
    subject,
    html,
  };
}

// ── Send helper ───────────────────────────────────────────────────────────

async function sendEmail(emailObj) {
  const transporter = getTransporter();
  // Verify connection before sending (helpful for diagnosing config issues)
  await transporter.verify();
  const info = await transporter.sendMail(emailObj);
  return info;
}

module.exports = {
  sendEmail,
  bookingConfirmationEmail,
  votingInviteEmail,
  cancellationEmail,
  voteResultEmail,
};
