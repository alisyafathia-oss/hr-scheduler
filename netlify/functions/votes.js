// netlify/functions/votes.js
// POST /api/votes/start   — HR starts a vote for a group meeting (hr_admin)
// POST /api/votes/cast    — participant casts their vote
// GET  /api/votes/:id     — get vote status
// POST /api/votes/resolve — manually resolve a tie (team_head / hr_admin)

const { requireAuth, requireRole } = require("../../src/lib/auth");
const { readSheet, appendSheet, writeSheet } = require("../../src/lib/google-client");
const { createCalendarEvent } = require("../../src/lib/google-client");
const { sendEmail, votingInviteEmail, voteResultEmail } = require("../../src/lib/mailer");
const { rowToMeeting, meetingToRow } = require("../../src/lib/schedule-engine");
const { addHours, isAfter, parseISO } = require("date-fns");

const SHEET_ID    = () => process.env.CONTRACTS_SHEET_ID;
const VOTES_RANGE  = "Votes!A2:L";
const MEET_RANGE   = "Meetings!A2:O";

// Vote row: [id, meetingId, slots(JSON), voters(JSON), votes(JSON), status, deadline, winnerId, createdAt, resolvedBy, resolvedAt, notes]
function rowToVote(row) {
  if (!row || row.length < 7) return null;
  try {
    return {
      id: row[0], meetingId: row[1],
      slots: JSON.parse(row[2] || "[]"),
      voters: JSON.parse(row[3] || "[]"),
      votes: JSON.parse(row[4] || "{}"),
      status: row[5] || "open",
      deadline: row[6],
      winnerId: row[7] || null,
      createdAt: row[8],
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

exports.handler = async (event) => {
  const { error, session } = requireAuth(event);
  if (error) return error;

  const method = event.httpMethod;
  const action = event.path.replace(/.*\/votes\/?/, "").split("?")[0];

  const json = (data, code = 200) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  try {
    // ── POST /api/votes/start ─────────────────────────────────────────────
    if (method === "POST" && action === "start") {
      const hrCheck = requireRole(event, "hr_admin");
      if (hrCheck.error) return hrCheck.error;

      const { meetingId, slots, voterEmails } = JSON.parse(event.body || "{}");
      if (!meetingId || !slots?.length || !voterEmails?.length) {
        return json({ error: "meetingId, slots[], voterEmails[] required" }, 400);
      }

      const voteWindowHours = parseInt(process.env.VOTE_WINDOW_HOURS || "24");
      const deadline = addHours(new Date(), voteWindowHours).toISOString();
      const id = `vote_${Date.now()}`;

      const vote = {
        id, meetingId,
        slots: slots.map((s, i) => ({ id: `s${i}`, ...s })),
        voters: voterEmails,
        votes: {},
        status: "open",
        deadline,
        winnerId: null,
        createdAt: new Date().toISOString(),
      };

      await appendSheet(SHEET_ID(), "Votes!A:L", [voteToRow(vote)]);

      // Send voting invite emails
      const voteUrl = `${process.env.APP_URL}/vote/${id}`;
      const slotLabels = slots.map((s) => ({ date: s.date, time: s.startTime }));
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
    }

    // ── POST /api/votes/cast ──────────────────────────────────────────────
    if (method === "POST" && action === "cast") {
      const { voteId, slotId } = JSON.parse(event.body || "{}");
      if (!voteId || !slotId) return json({ error: "voteId and slotId required" }, 400);

      const rows   = await readSheet(SHEET_ID(), VOTES_RANGE);
      const voteIdx = rows.findIndex((r) => r[0] === voteId);
      if (voteIdx === -1) return json({ error: "Vote not found" }, 404);

      const vote = rowToVote(rows[voteIdx]);
      if (!vote) return json({ error: "Invalid vote record" }, 500);
      if (vote.status !== "open") return json({ error: "Voting is closed" }, 400);
      if (isAfter(new Date(), parseISO(vote.deadline))) return json({ error: "Voting deadline passed" }, 400);
      if (!vote.voters.includes(session.email)) return json({ error: "You are not a voter in this session" }, 403);
      if (!vote.slots.find((s) => s.id === slotId)) return json({ error: "Invalid slot" }, 400);

      vote.votes[session.email] = slotId;

      // Check if all voters have voted → auto-resolve if no tie
      const allVoted = vote.voters.every((v) => vote.votes[v]);
      if (allVoted) {
        const { winners, isTie } = tallyVotes(vote.votes, vote.slots);
        if (!isTie) {
          vote.status   = "resolved";
          vote.winnerId = winners[0].id;
        } else {
          vote.status = "tie"; // requires manual resolution
        }
      }

      const rowNum = voteIdx + 2;
      await writeSheet(SHEET_ID(), `Votes!A${rowNum}:L${rowNum}`, [voteToRow(vote)]);

      return json({ success: true, allVoted, status: vote.status, yourVote: slotId });
    }

    // ── GET /api/votes/:id ─────────────────────────────────────────────────
    if (method === "GET") {
      const voteId = action;
      if (!voteId) return json({ error: "voteId required" }, 400);

      const rows    = await readSheet(SHEET_ID(), VOTES_RANGE);
      const voteRow = rows.find((r) => r[0] === voteId);
      if (!voteRow) return json({ error: "Vote not found" }, 404);

      const vote   = rowToVote(voteRow);
      const tally  = tallyVotes(vote.votes, vote.slots);
      const myVote = vote.votes[session.email] || null;

      return json({ vote, tally, myVote, hasVoted: !!myVote });
    }

    // ── POST /api/votes/resolve — tie-break by team head ─────────────────
    if (method === "POST" && action === "resolve") {
      const headCheck = requireRole(event, "team_head", "hr_admin");
      if (headCheck.error) return headCheck.error;

      const { voteId, slotId } = JSON.parse(event.body || "{}");
      if (!voteId || !slotId) return json({ error: "voteId and slotId required" }, 400);

      const rows    = await readSheet(SHEET_ID(), VOTES_RANGE);
      const voteIdx = rows.findIndex((r) => r[0] === voteId);
      if (voteIdx === -1) return json({ error: "Vote not found" }, 404);

      const vote = rowToVote(rows[voteIdx]);
      if (!["open", "tie"].includes(vote.status)) return json({ error: "Vote is not open for resolution" }, 400);

      vote.status    = "resolved";
      vote.winnerId  = slotId;
      vote.resolvedBy = session.email;

      const rowNum = voteIdx + 2;
      await writeSheet(SHEET_ID(), `Votes!A${rowNum}:L${rowNum}`, [voteToRow(vote)]);

      // Notify all voters of the winning slot
      const winningSlot = vote.slots.find((s) => s.id === slotId);
      if (winningSlot) {
        try {
          await sendEmail(voteResultEmail({
            attendeeEmails: vote.voters,
            meetingLabel: vote.meetingId,
            winningSlot: { date: winningSlot.date, time: winningSlot.startTime },
          }));
        } catch (e) { console.error("Vote result email failed:", e); }
      }

      return json({ success: true, vote, winningSlot });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("Votes API error:", err);
    return json({ error: err.message }, 500);
  }
};
