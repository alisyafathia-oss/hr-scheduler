// functions/api/votes/[id].js
// GET /api/votes/:id — get vote status, tally, and current user's vote.

import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../../_compat.js";
import _auth from "../../../src/lib/auth.js";
import _googleClient from "../../../src/lib/google-client.js";

const { requireAuth } = _auth;
const { readSheet } = _googleClient;

const SHEET_ID    = () => process.env.CONTRACTS_SHEET_ID;
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

async function handler(event, voteId) {
  if (event.httpMethod !== "GET") {
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
    if (!voteId) return json({ error: "voteId required" }, 400);

    const rows    = await readSheet(SHEET_ID(), VOTES_RANGE);
    const voteRow = rows.find((r) => r[0] === voteId);
    if (!voteRow) return json({ error: "Vote not found" }, 404);

    const vote   = rowToVote(voteRow);
    const tally  = tallyVotes(vote.votes, vote.slots);
    const myVote = vote.votes[session.email] || null;

    return json({ vote, tally, myVote, hasVoted: !!myVote });
  } catch (err) {
    console.error("Vote get error:", err);
    return json({ error: err.message }, 500);
  }
}

export async function onRequest({ request, env, params }) {
  injectEnv(env);
  const event = await toNetlifyEvent(request);
  return fromNetlifyResponse(await handler(event, params.id));
}
