// public/js/views/team-head.js
let thState = { slots: [], suggestions: [], tab: 'slots' };

async function renderTeamHeadDashboard(session) {
  document.getElementById('app').innerHTML = renderShell(session, 'th-slots', `
    <div class="page-header">
      <h1 class="page-title">My Availability</h1>
      <p class="page-subtitle">Add time slots for your team to book 1:1s</p>
    </div>
    <div class="tab-bar">
      <button class="tab active" data-tab="slots">My Slots</button>
      <button class="tab" data-tab="add">Add Slot</button>
      <button class="tab" data-tab="schedule">Team Schedule</button>
    </div>
    <div id="th-tab-content"></div>
  `);

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchThTab(t.dataset.tab, session)));

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = btn.dataset.nav;
      if (n === 'th-slots') switchThTab('slots', session);
      else if (n === 'th-schedule') switchThTab('schedule', session);
    });
  });

  await switchThTab('slots', session);
}

async function switchThTab(tab, session) {
  thState.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const content = document.getElementById('th-tab-content');
  if (!content) return;

  if (tab === 'slots') {
    content.innerHTML = `<div class="empty-state">${Icon.clock}<p>Loading slots…</p></div>`;
    try {
      const { slots } = await API.slots({ teamHeadEmail: session.email || session.workEmail });
      thState.slots = slots;
      content.innerHTML = renderThSlots(slots);
    } catch (e) { Toast.error(e.message); }
  }

  if (tab === 'add') {
    content.innerHTML = renderAddSlot();
    content.innerHTML += `
      <div class="card" style="margin-top:20px;max-width:600px">
        <div class="card-title">Suggested free windows from your calendar</div>
        <p style="font-size:13px;color:var(--ink-3);margin-bottom:12px">Based on your Google Calendar availability for the next 14 days.</p>
        <button class="btn btn-secondary" id="fetch-avail-btn">${Icon.calendar} Fetch availability</button>
        <div id="avail-results" style="margin-top:16px"></div>
      </div>`;

    content.querySelector('#fetch-avail-btn').addEventListener('click', async (e) => {
      setLoading(e.target, true);
      try {
        const { suggestions, calendarNote } = await API.availability({ days: 14 });
        thState.suggestions = suggestions;
        const resultsEl = content.querySelector('#avail-results');
        if (calendarNote) {
          resultsEl.innerHTML = `<p style="font-size:13px;color:var(--amber);margin-bottom:8px">⚠ ${calendarNote}</p>`;
        }
        if (!suggestions.length) {
          resultsEl.innerHTML += `<p style="font-size:13px;color:var(--ink-3)">No free windows found in the next 14 days.</p>`;
        } else {
          resultsEl.innerHTML = `
            <p style="font-size:13px;color:var(--ink-3);margin-bottom:8px">Click a slot to pre-fill the form above:</p>
            <div class="avail-grid">
              ${suggestions.map((s, i) => `
                <div class="avail-chip" data-idx="${i}">${s.label}</div>`).join('')}
            </div>`;
          resultsEl.querySelectorAll('.avail-chip').forEach(chip => {
            chip.addEventListener('click', () => {
              const s = thState.suggestions[chip.dataset.idx];
              content.querySelector('#slot-date').value  = s.date;
              content.querySelector('#slot-start').value = s.startTime;
              content.querySelector('#slot-end').value   = s.endTime;
              resultsEl.querySelectorAll('.avail-chip').forEach(c => c.classList.remove('selected'));
              chip.classList.add('selected');
            });
          });
        }
      } catch (err) { Toast.error(err.message); }
      setLoading(e.target, false);
    });

    content.querySelector('#save-slot-btn').addEventListener('click', async (e) => {
      setLoading(e.target, true);
      const date      = content.querySelector('#slot-date').value;
      const startTime = content.querySelector('#slot-start').value;
      const endTime   = content.querySelector('#slot-end').value;
      const meetingId = content.querySelector('#slot-meeting').value;
      if (!date || !startTime || !endTime) { Toast.error('Date and times are required'); setLoading(e.target, false); return; }
      try {
        await API.createSlot({ date, startTime, endTime, meetingId });
        Toast.success('Slot added successfully');
        await switchThTab('slots', session);
      } catch (err) { Toast.error(err.message); }
      setLoading(e.target, false);
    });
  }

  if (tab === 'schedule') {
    content.innerHTML = `<div class="empty-state">${Icon.calendar}<p>Loading…</p></div>`;
    try {
      const { meetings } = await API.meetings();
      const mine = meetings.filter(m => m.managerEmail === session.email || m.employeeEmail === session.email);
      content.innerHTML = renderMeetingTimeline(mine);
    } catch (e) { Toast.error(e.message); }
  }
}

function renderThSlots(slots) {
  if (!slots.length) {
    return `<div class="empty-state">${Icon.clock}<p>No slots added yet</p><p style="margin-top:8px"><button class="btn btn-primary" onclick="document.querySelector('[data-tab=add]').click()">Add your first slot</button></p></div>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Time</th><th>Status</th><th>Booked by</th></tr></thead>
        <tbody>
          ${slots.sort((a,b) => a.date.localeCompare(b.date)).map(s => `
            <tr>
              <td class="td-mono">${fmtDate(s.date)}</td>
              <td>${s.startTime} – ${s.endTime}</td>
              <td>${statusBadge(s.status)}</td>
              <td>${s.bookedBy || '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderAddSlot() {
  return `
    <div class="card" style="max-width:480px">
      <div class="card-title">Add a new time slot</div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input type="date" class="form-input" id="slot-date" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start time</label>
          <input type="time" class="form-input" id="slot-start" />
        </div>
        <div class="form-group">
          <label class="form-label">End time</label>
          <input type="time" class="form-input" id="slot-end" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Linked meeting ID (optional)</label>
        <input class="form-input" id="slot-meeting" placeholder="Leave blank to allow any booking" />
      </div>
      <button class="btn btn-primary" id="save-slot-btn">${Icon.plus} Add slot</button>
    </div>`;
}

function renderMeetingTimeline(meetings) {
  if (!meetings.length) return `<div class="empty-state">${Icon.calendar}<p>No meetings found</p></div>`;
  const sorted = [...meetings].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return `
    <div class="timeline">
      ${sorted.map(m => `
        <div class="timeline-item">
          <div class="timeline-date"><strong>${m.scheduledDate.slice(8)}</strong><br/>${monthAbbr2(m.scheduledDate)}</div>
          <div class="timeline-info">
            <div class="timeline-label">${m.label}</div>
            <div class="timeline-meta">${m.employeeName} · ${m.employeeEmail}</div>
          </div>
          <div class="timeline-actions">${statusBadge(m.status)}</div>
        </div>`).join('')}
    </div>`;
}

function monthAbbr2(dateStr) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(dateStr.slice(5,7)) - 1] || '';
}
