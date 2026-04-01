// functions/api/votes/start.js
// POST /api/votes/start — HR admin starts a vote session.

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../../_compat.js";
import _auth from "../../../src/lib/auth.js";
import _googleClient from "../../../src/lib/google-client.js";
import _mailer from "../../../src/lib/mailer.js";
import { addHours } from "date-fns";

const { requireRole } = _auth;
const { appendSheet } = _googleClient;
const { sendEmail, votingInviteEmail } = _mailer;

const SHEET_ID = () => process.env.CONTRACTS_SHEET_ID;

function voteToRow(v) {
  return [v.id, v.meetingId, JSON.stringify(v.slots), JSON.stringify(v.voters),
          JSON.stringify(v.votes), v.status, v.deadline, v.winnerId || "",
          v.createdAt, v.resolvedBy || "", "", ""];
}

async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { error } = requireRole(event, "hr_admin");
  if (error) return error;

  const json = (data, code = 200) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  try {
    const { meetingId, slots, voterEmails } = JSON.parse(event.body || "{}");
    if (!meetingId || !slots?.length || !voterEmails?.length) {
      return json({ error: "meetingId, slots[], voterEmails[] required" }, 400);
    }

    const voteWindowHours = parseInt(process.env.VOTE_WINDOW_HOURS || "24");
    const deadline = addHours(new Date(), voteWindowHours).toISOString();
    const id = `vote_${Date.now()}`;

    const vote = {
      id, meetingId,
      slots:     slots.map((s, i) => ({ id: `s${i}`, ...s })),
      voters:    voterEmails,
      votes:     {},
      status:    "open",
      deadline,
      winnerId:  null,
      createdAt: new Date().toISOString(),
    };

    await appendSheet(SHEET_ID(), "Votes!A:L", [voteToRow(vote)]);

    const voteUrl     = `${process.env.APP_URL}/vote/${id}`;
    const slotLabels  = slots.map((s) => ({ date: s.date, time: s.startTime }));
    const deadlineLabel = new Date(deadline).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

    for (const email of voterEmails) {
      try {
        await sendEmail(votingInviteEmail({
          employeeName: email.split("@")[0],
          employeeEmail: email,
          meetingLabel: meetingId,
          voteUrl,
          voteDeadline: deadlineLabel,
          slots: slotLabels,
        }));
      } catch (e) { console.error(`Vote invite failed for ${email}:`, e); }
    }

    return json({ success: true, voteId: id, deadline });
  } catch (err) {
    console.error("Vote start error:", err);
    return json({ error: err.message }, 500);
  }
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
