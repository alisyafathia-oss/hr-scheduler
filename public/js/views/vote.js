// public/js/views/vote.js
// Standalone voting page — accessed via /vote/:voteId from email link.
// Works even without being in the main app shell (no sidebar).

async function renderVotePage(voteId, session) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--surface-2)">
      <div class="card" style="max-width:480px;width:100%">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--teal);display:flex;align-items:center;justify-content:center">
            ${Icon.vote}
          </div>
          <div>
            <div style="font-weight:600">Meeting vote</div>
            <div style="font-size:12px;color:var(--ink-3)">Select your preferred time</div>
          </div>
        </div>
        <div id="vote-content">
          <div class="empty-state">${Icon.vote}<p>Loading vote…</p></div>
        </div>
      </div>
    </div>`;

  try {
    const { vote, tally, myVote, hasVoted } = await API.getVote(voteId);
    renderVoteContent(vote, tally, myVote, hasVoted, session, voteId);
  } catch (e) {
    document.getElementById('vote-content').innerHTML =
      `<p style="color:var(--red)">Could not load this vote: ${e.message}</p>`;
  }
}

function renderVoteContent(vote, tally, myVote, hasVoted, session, voteId) {
  const content = document.getElementById('vote-content');
  const deadline = new Date(vote.deadline);
  const isExpired = deadline < new Date();
  const isClosed  = vote.status !== 'open' || isExpired;

  if (vote.status === 'resolved') {
    const winner = vote.slots.find(s => s.id === vote.winnerId);
    content.innerHTML = `
      <div style="background:var(--teal-light);border-radius:var(--radius);padding:16px;text-align:center;margin-bottom:16px">
        <div style="font-size:13px;color:var(--teal-dark);font-weight:500;margin-bottom:4px">Vote closed — time confirmed</div>
        <div style="font-size:18px;font-weight:600;color:var(--teal-dark)">${winner ? `${fmtDate(winner.date)} at ${winner.startTime}` : 'Confirmed'}</div>
      </div>
      <p style="font-size:13px;color:var(--ink-3);text-align:center">A calendar invite has been sent to all participants.</p>`;
    return;
  }

  if (vote.status === 'tie') {
    const isResolver = session?.role === 'team_head' || session?.role === 'hr_admin';
    content.innerHTML = `
      <div style="background:var(--amber-light);border-radius:var(--radius);padding:12px;font-size:13px;color:var(--amber);margin-bottom:16px">
        It's a tie! ${isResolver ? 'Please select the winning slot below.' : 'Your team head will decide.'}
      </div>
      ${isResolver ? `
        <div class="slot-grid" id="tie-slot-grid">
          ${vote.slots.map(s => `
            <div class="slot-card" data-slot-id="${s.id}">
              <div class="slot-date">${fmtDate(s.date)}</div>
              <div class="slot-time">${s.startTime}</div>
              <div style="font-size:11px;color:var(--teal-dark);margin-top:4px">${tally.counts[s.id] || 0} vote(s)</div>
            </div>`).join('')}
        </div>
        <button class="btn btn-primary" style="margin-top:16px;width:100%" id="resolve-btn" disabled>Confirm this slot</button>
      ` : ''}`;

    if (isResolver) {
      let picked = null;
      content.querySelectorAll('.slot-card').forEach(card => {
        card.addEventListener('click', () => {
          content.querySelectorAll('.slot-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          picked = card.dataset.slotId;
          content.querySelector('#resolve-btn').disabled = false;
        });
      });
      content.querySelector('#resolve-btn').addEventListener('click', async (e) => {
        if (!picked) return;
        setLoading(e.target, true);
        try {
          await API.resolveVote({ voteId, slotId: picked });
          Toast.success('Slot confirmed! Emails sent to all participants.');
          renderVoteContent({ ...vote, status: 'resolved', winnerId: picked }, tally, myVote, true, session, voteId);
        } catch (err) { Toast.error(err.message); }
        setLoading(e.target, false);
      });
    }
    return;
  }

  if (hasVoted) {
    content.innerHTML = `
      <div style="background:var(--teal-light);border-radius:var(--radius);padding:12px;font-size:13px;color:var(--teal-dark);margin-bottom:16px">
        ${Icon.check} Your vote has been recorded.
      </div>
      <div>
        <div style="font-size:13px;font-weight:500;margin-bottom:12px">Current results (${Object.keys(vote.votes).length}/${vote.voters.length} voted)</div>
        ${vote.slots.map(s => `
          <div class="vote-bar-wrap">
            <div class="vote-bar-label">
              <span>${fmtDate(s.date)} at ${s.startTime}</span>
              <span>${tally.counts[s.id] || 0} vote(s)</span>
            </div>
            <div class="vote-bar-track">
              <div class="vote-bar-fill" style="width:${tally.maxCount > 0 ? Math.round((tally.counts[s.id]||0)/tally.maxCount*100) : 0}%"></div>
            </div>
          </div>`).join('')}
      </div>
      <p style="font-size:12px;color:var(--ink-4);margin-top:12px">Voting closes ${deadline.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>`;
    return;
  }

  content.innerHTML = `
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:4px">Pick your preferred time for <strong>${vote.meetingId}</strong>:</p>
    <p style="font-size:12px;color:var(--ink-4);margin-bottom:16px">Deadline: ${deadline.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
    <div class="slot-grid" id="vote-slot-grid">
      ${vote.slots.map(s => `
        <div class="slot-card" data-slot-id="${s.id}">
          <div class="slot-date">${fmtDate(s.date)}</div>
          <div class="slot-time">${s.startTime}</div>
        </div>`).join('')}
    </div>
    <button class="btn btn-primary" style="margin-top:16px;width:100%" id="cast-vote-btn" disabled>${Icon.vote} Submit my vote</button>`;

  let selectedSlot = null;
  content.querySelectorAll('.slot-card').forEach(card => {
    card.addEventListener('click', () => {
      content.querySelectorAll('.slot-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedSlot = card.dataset.slotId;
      content.querySelector('#cast-vote-btn').disabled = false;
    });
  });

  content.querySelector('#cast-vote-btn').addEventListener('click', async (e) => {
    if (!selectedSlot) return;
    setLoading(e.target, true);
    try {
      const result = await API.castVote({ voteId, slotId: selectedSlot });
      Toast.success('Vote submitted!');
      const { vote: updated, tally: newTally } = await API.getVote(voteId);
      renderVoteContent(updated, newTally, selectedSlot, true, session, voteId);
    } catch (err) { Toast.error(err.message); }
    setLoading(e.target, false);
  });
}
