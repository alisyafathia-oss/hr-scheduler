// functions/api/votes/cast.js
// POST /api/votes/cast — participant casts their vote.

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../../_compat.js";
import _auth from "../../../src/lib/auth.js";
import _googleClient from "../../../src/lib/google-client.js";
import { isAfter, parseISO } from "date-fns";

const { requireAuth } = _auth;
const { readSheet, writeSheet } = _googleClient;

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

function tallyVotes(votes, slots) {
  const counts = {};
  slots.forEach((s) => (counts[s.id] = 0));
  Object.values(votes).forEach((slotId) => {
    if (counts[slotId] !== undefined) counts[slotId]++;
  });
  const maxCount = Math.max(...Object.values(counts));
  const winners  = slots.filter((s) => counts[s.id] === maxCount);
  return { counts, maxCount, winners, isTie: winners.length > 1 };
}

async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { error, session } = requireAuth(event);
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
    if (!vote) return json({ error: "Invalid vote record" }, 500);
    if (vote.status !== "open") return json({ error: "Voting is closed" }, 400);
    if (isAfter(new Date(), parseISO(vote.deadline))) return json({ error: "Voting deadline passed" }, 400);
    if (!vote.voters.includes(session.email)) return json({ error: "You are not a voter in this session" }, 403);
    if (!vote.slots.find((s) => s.id === slotId)) return json({ error: "Invalid slot" }, 400);

    vote.votes[session.email] = slotId;

    const allVoted = vote.voters.every((v) => vote.votes[v]);
    if (allVoted) {
      const { winners, isTie } = tallyVotes(vote.votes, vote.slots);
      if (!isTie) {
        vote.status   = "resolved";
        vote.winnerId = winners[0].id;
      } else {
        vote.status = "tie";
      }
    }

    const rowNum = voteIdx + 2;
    await writeSheet(SHEET_ID(), `Votes!A${rowNum}:L${rowNum}`, [voteToRow(vote)]);

    return json({ success: true, allVoted, status: vote.status, yourVote: slotId });
  } catch (err) {
    console.error("Vote cast error:", err);
    return json({ error: err.message }, 500);
  }
}

export async function onRequest({ request, env }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event));
}
