// functions/api/votes/resolve.js
// POST /api/votes/resolve — team head or HR manually resolves a tie.

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../../_compat.js";
import _auth from "../../../src/lib/auth.js";
import _googleClient from "../../../src/lib/google-client.js";
import _mailer from "../../../src/lib/mailer.js";

const { requireRole } = _auth;
const { readSheet, writeSheet } = _googleClient;
const { sendEmail, voteResultEmail } = _mailer;

const SHEET_ID    = () => process.env.SCHEDULER_SHEET_ID;
const VOTES_RANGE = "Votes!A2:L";

function rowToVote(row) {
  if (!row || row.length < 7) return null;
  try {
    return {
      id: row[0], meetingId: row[1],
      slots:      JSON.parse(row[2] || "[]"),
      voters:     JSON.parse(row[3] || "[]"),
      votes:      JSON.parse(row[4] || "{}"),
      status:     row[5] || "open",
      deadline:   row[6],
      winnerId:   row[7] || null,
      createdAt:  row[8],
      resolvedBy: row[9] || null,
    };
  } catch { return null; }
}

function voteToRow(v) {
  return [v.id, v.meetingId, JSON.stringify(v.slots), JSON.stringify(v.voters),
          JSON.stringify(v.votes), v.status, v.deadline, v.winnerId || "",
          v.createdAt, v.resolvedBy || "", "", ""];
}

async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { error, session } = requireRole(event, "team_head", "hr_admin");
  if (error) return error;

  const json = (data, code = 200) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  try {
    const { voteId, slotId } = JSON.parse(event.body || "{}");
    if (!voteId || !slotId) return json({ error: "voteId and slotId required" }, 400);

    const rows    = await readSheet(SHEET_ID(), VOTES_RANGE);
    const voteIdx = rows.findIndex((r) => r[0] === voteId);
    if (voteIdx === -1) return json({ error: "Vote not found" }, 404);

    const vote = rowToVote(rows[voteIdx]);
    if (!["open", "tie"].includes(vote.status)) {
      return json({ error: "Vote is not open for resolution" }, 400);
    }

    vote.status     = "resolved";
    vote.winnerId   = slotId;
    vote.resolvedBy = session.email;

    const rowNum = voteIdx + 2;
    await writeSheet(SHEET_ID(), `Votes!A${rowNum}:L${rowNum}`, [voteToRow(vote)]);

    const winningSlot = vote.slots.find((s) => s.id === slotId);
    if (winningSlot) {
      try {
        await sendEmail(voteResultEmail({
          attendeeEmails: vote.voters,
          meetingLabel:   vote.meetingId,
          winningSlot:    { date: winningSlot.date, time: winningSlot.startTime },
        }));
      } catch (e) { console.error("Vote result email failed:", e); }
    }

    return json({ success: true, vote, winningSlot });
  } catch (err) {
    console.error("Vote resolve error:", err);
    return json({ error: err.message }, 500);
  }
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
