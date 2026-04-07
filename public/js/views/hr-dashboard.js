// public/js/views/hr-dashboard.js
// HR Admin dashboard — the most feature-rich view.
// Tabs: Overview | Schedule | People | Slots | Votes

let hrState = { meetings: [], slots: [], people: [], tab: 'overview', filter: 'all' };

async function renderHRDashboard(session) {
  document.getElementById('app').innerHTML = renderShell(session, 'home', `
    <div class="page-header">
      <h1 class="page-title">HR Dashboard</h1>
      <p class="page-subtitle">Manage scheduling for all employees</p>
    </div>
    <div class="tab-bar">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="schedule">Schedule</button>
      <button class="tab" data-tab="people">People</button>
      <button class="tab" data-tab="slots">Slots</button>
      <button class="tab" data-tab="votes">Group Votes</button>
    </div>
    <div id="hr-tab-content">
      <div class="empty-state">${Icon.calendar}<p>Loading…</p></div>
    </div>
  `);

  // Nav wiring
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.nav;
      if (nav === 'hr-schedule') switchTab('schedule');
      else if (nav === 'hr-votes') switchTab('votes');
      else if (nav === 'hr-people') switchTab('people');
      else if (nav === 'home') switchTab('overview');
    });
  });

  // Tab switching
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  // Load data and render
  try {
    const { meetings } = await API.meetings();
    hrState.meetings = meetings;
    switchTab('overview');
  } catch (e) {
    Toast.error('Failed to load meetings: ' + e.message);
  }
}

function switchTab(tab) {
  hrState.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const content = document.getElementById('hr-tab-content');
  if (!content) return;
  if (tab === 'overview')  content.innerHTML = renderHROverview();
  if (tab === 'schedule')  content.innerHTML = renderHRSchedule();
  if (tab === 'votes')     renderHRVotes(content);
  if (tab === 'people')    renderHRPeople(content);
  if (tab === 'slots')     renderHRSlotsTab(content);
  attachHRHandlers(tab);
}

function renderHROverview() {
  const m = hrState.meetings;
  const today = new Date().toISOString().split('T')[0];
  const pending   = m.filter(x => x.status === 'pending' && x.scheduledDate >= today).length;
  const overdue   = m.filter(x => x.status === 'pending' && x.scheduledDate < today).length;
  const booked    = m.filter(x => x.status === 'booked').length;
  const completed = m.filter(x => x.status === 'completed').length;
  const cancelled = m.filter(x => x.status === 'cancelled').length;

  // Upcoming in next 14 days
  const today = new Date().toISOString().split('T')[0];
  const in14  = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const upcoming = m
    .filter(x => x.status === 'booked' && x.scheduledDate >= today && x.scheduledDate <= in14)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(0, 8);

  const pendingList = m
    .filter(x => x.status === 'pending')
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(0, 6);

  return `
    <div class="stats-grid">
      <div class="stat-card accent"><div class="stat-value">${m.length}</div><div class="stat-label">Total meetings</div></div>
      <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">Pending booking</div></div>
      ${overdue > 0 ? `<div class="stat-card" style="border-left:3px solid #c2410c"><div class="stat-value" style="color:#c2410c">${overdue}</div><div class="stat-label">Overdue</div></div>` : `<div class="stat-card"><div class="stat-value">${booked}</div><div class="stat-label">Booked</div></div>`}
      <div class="stat-card"><div class="stat-value">${completed}</div><div class="stat-label">Completed</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="card">
        <div class="card-title">Upcoming (next 14 days)</div>
        ${upcoming.length === 0 ? `<div class="empty-state" style="padding:16px">${Icon.calendar}<p>Nothing booked yet</p></div>` :
          upcoming.map(mtg => `
            <div class="timeline-item">
              <div class="timeline-date"><strong>${mtg.scheduledDate.slice(8)}</strong>${monthAbbr(mtg.scheduledDate)}</div>
              <div class="timeline-info">
                <div class="timeline-label">${mtg.label}</div>
                <div class="timeline-meta">${mtg.employeeName}</div>
              </div>
              ${statusBadge(mtg.status)}
            </div>`).join('')}
      </div>
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <span class="card-title" style="margin:0">Needs booking</span>
          <button class="btn btn-primary btn-sm" id="sync-btn">${Icon.refresh} Sync now</button>
        </div>
        ${pendingList.length === 0 ? `<div class="empty-state" style="padding:16px">${Icon.check}<p>All caught up!</p></div>` :
          pendingList.map(mtg => `
            <div class="timeline-item">
              <div class="timeline-date"><strong>${mtg.scheduledDate.slice(8)}</strong>${monthAbbr(mtg.scheduledDate)}</div>
              <div class="timeline-info">
                <div class="timeline-label">${mtg.label}</div>
                <div class="timeline-meta">${mtg.employeeName}</div>
              </div>
              <button class="btn btn-sm btn-secondary hr-agenda-btn" data-id="${mtg.id}" title="Generate agenda">${Icon.doc}</button>
            </div>`).join('')}
      </div>
    </div>`;
}

function renderHRSchedule() {
  const f = hrState.filter;
  const today = new Date().toISOString().split('T')[0];
  const filtered = hrState.meetings.filter(m => {
    if (f === 'all') return true;
    if (f === 'overdue') return m.status === 'pending' && m.scheduledDate < today;
    return m.status === f;
  });
  const sorted = [...filtered].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <span style="font-size:13px;color:var(--ink-3)">Filter:</span>
      ${['all','overdue','pending','booked','completed','cancelled'].map(s =>
        `<button class="btn btn-sm ${f === s ? 'btn-primary' : 'btn-secondary'} filter-btn" data-filter="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</button>`
      ).join('')}
      <span style="margin-left:auto;font-size:13px;color:var(--ink-3)">${filtered.length} meetings</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Date</th><th>Meeting</th><th>Employee</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${sorted.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--ink-3)">No meetings found</td></tr>` :
            sorted.map(m => {
              const eff = effectiveStatus(m);
              return `
              <tr>
                <td class="td-mono">${fmtDate(m.scheduledDate)}</td>
                <td class="td-name">${m.label}</td>
                <td>${m.employeeName}<br/><span class="td-mono">${m.employeeEmail}</span></td>
                <td>${statusBadge(eff)}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-sm btn-secondary hr-agenda-btn" data-id="${m.id}" title="Agenda">${Icon.doc}</button>
                    ${m.status === 'booked' ? `<button class="btn btn-sm btn-secondary hr-complete-btn" data-id="${m.id}" title="Mark complete">${Icon.check}</button>` : ''}
                    ${['pending','booked'].includes(m.status) ? `<button class="btn btn-sm btn-danger hr-cancel-btn" data-id="${m.id}" title="Cancel">${Icon.x}</button>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function renderHRVotes(container) {
  container.innerHTML = `<div class="empty-state">${Icon.vote}<p>Loading votes…</p></div>`;
  // Votes UI — start a new group vote
  container.innerHTML = `
    <div class="card" style="max-width:560px">
      <div class="card-title">Start a group vote</div>
      <div class="form-group">
        <label class="form-label">Meeting ID</label>
        <input class="form-input" id="vote-meeting-id" placeholder="e.g. emp001_DEV_PLAN_360_2025-06-15" />
      </div>
      <div class="form-group">
        <label class="form-label">Participant emails (one per line)</label>
        <textarea class="form-textarea" id="vote-emails" placeholder="alice@company.com&#10;bob@company.com"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Proposed slots (date YYYY-MM-DD, time HH:MM)</label>
        <div id="vote-slots-list">
          <div class="form-row vote-slot-row">
            <input class="form-input" placeholder="2025-06-15" name="slot-date" />
            <input class="form-input" placeholder="10:00" name="slot-time" />
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:8px" id="add-slot-btn">${Icon.plus} Add slot</button>
      </div>
      <button class="btn btn-primary" id="start-vote-btn">${Icon.vote} Start vote</button>
    </div>`;

  container.querySelector('#add-slot-btn').addEventListener('click', () => {
    const list = container.querySelector('#vote-slots-list');
    const row = document.createElement('div');
    row.className = 'form-row vote-slot-row';
    row.innerHTML = `<input class="form-input" placeholder="2025-06-15" name="slot-date" /><input class="form-input" placeholder="10:00" name="slot-time" />`;
    list.appendChild(row);
  });

  container.querySelector('#start-vote-btn').addEventListener('click', async (e) => {
    setLoading(e.target, true);
    const meetingId = container.querySelector('#vote-meeting-id').value.trim();
    const voterEmails = container.querySelector('#vote-emails').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
    const slotRows = container.querySelectorAll('.vote-slot-row');
    const slots = Array.from(slotRows).map(r => ({
      date: r.querySelector('[name="slot-date"]').value.trim(),
      startTime: r.querySelector('[name="slot-time"]').value.trim(),
    })).filter(s => s.date && s.startTime);

    if (!meetingId || voterEmails.length === 0 || slots.length === 0) {
      Toast.error('Please fill in all fields'); setLoading(e.target, false); return;
    }
    try {
      const { voteId, deadline } = await API.startVote({ meetingId, slots, voterEmails });
      Toast.success(`Vote started! ID: ${voteId}. Deadline: ${new Date(deadline).toLocaleString()}`);
    } catch (err) { Toast.error(err.message); }
    setLoading(e.target, false);
  });
}

function attachHRHandlers(tab) {
  // Sync button
  document.getElementById('sync-btn')?.addEventListener('click', async (e) => {
    setLoading(e.target, true);
    try {
      await API.triggerSync();
      const { meetings } = await API.meetings();
      hrState.meetings = meetings;
      Toast.success('Sync complete');
      switchTab('overview');
    } catch (err) { Toast.error(err.message); }
    setLoading(e.target, false);
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => { hrState.filter = btn.dataset.filter; switchTab('schedule'); });
  });

  // Agenda buttons
  document.querySelectorAll('.hr-agenda-btn').forEach(btn => {
    btn.addEventListener('click', () => showAgendaModal(btn.dataset.id));
  });

  // Cancel buttons
  document.querySelectorAll('.hr-cancel-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mtg = hrState.meetings.find(m => m.id === btn.dataset.id);
      const ok = await confirm(`Cancel "${mtg?.label}" for ${mtg?.employeeName}? An email will be sent.`, 'Cancel meeting', true);
      if (!ok) return;
      try {
        await API.cancelMeeting(btn.dataset.id);
        hrState.meetings = hrState.meetings.map(m => m.id === btn.dataset.id ? { ...m, status: 'cancelled' } : m);
        Toast.success('Meeting cancelled');
        switchTab(hrState.tab);
      } catch (err) { Toast.error(err.message); }
    });
  });

  // Complete buttons
  document.querySelectorAll('.hr-complete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await API.completeMeeting(btn.dataset.id);
        hrState.meetings = hrState.meetings.map(m => m.id === btn.dataset.id ? { ...m, status: 'completed' } : m);
        Toast.success('Marked as completed');
        switchTab(hrState.tab);
      } catch (err) { Toast.error(err.message); }
    });
  });
}

async function showAgendaModal(meetingId) {
  const modal = showModal({
    title: 'Meeting agenda',
    body: `<div class="empty-state">${Icon.doc}<p>Generating agenda…</p></div>`,
    wide: true,
  });

  try {
    const { agenda, text } = await API.generateAgenda(meetingId);
    const sectionsHtml = agenda.sections.map(s => `
      <div class="agenda-section">
        <div class="agenda-section-heading">
          ${s.heading}
          <span class="agenda-duration">${s.duration}</span>
        </div>
        <ul class="agenda-items">
          ${s.items.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>`).join('');

    modal.setBody(`
      <div style="margin-bottom:12px">
        <div style="font-size:16px;font-weight:600">${agenda.title}</div>
        <div style="font-size:13px;color:var(--ink-3);margin-top:2px">${agenda.date} · ${agenda.duration} · ${agenda.attendees.join(', ')}</div>
      </div>
      <div class="agenda-block">
        ${sectionsHtml}
        ${agenda.closingNote ? `<div class="agenda-closing">${agenda.closingNote}</div>` : ''}
      </div>
      <button class="btn btn-secondary btn-sm agenda-copy-btn" id="agenda-copy">
        ${Icon.copy} Copy as plain text
      </button>`);

    modal.find('#agenda-copy').addEventListener('click', () => copyToClipboard(text));
  } catch (err) {
    modal.setBody(`<p style="color:var(--red)">Failed to generate agenda: ${err.message}</p>`);
  }
}

async function renderHRPeople(container) {
  container.innerHTML = `<div class="empty-state">${Icon.users}<p>Loading people…</p></div>`;
  try {
    const { people } = await API.people();
    hrState.people = people;

    const roleLabel = { hr_admin: 'HR Admin', team_head: 'Team Head', employee: 'Employee' };
    const typeLabel = { intern: 'Intern', employee: 'Contract', contract: 'Contract', permanent: 'Permanent' };

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-size:13px;color:var(--ink-3)">${people.length} people</span>
        <input class="form-input" id="people-search" placeholder="Search name or email…" style="max-width:240px" />
      </div>
      <div class="table-wrap">
        <table id="people-table">
          <thead><tr>
            <th>Name</th><th>Email</th><th>Designation</th><th>Type</th><th>Role</th>
          </tr></thead>
          <tbody>
            ${people.map(p => {
              const empType = p.isPermanent ? 'permanent' : (p.employmentType || 'employee');
              return `
              <tr data-name="${(p.name||'').toLowerCase()}" data-email="${(p.email||'').toLowerCase()}">
                <td><strong>${p.name || p.id}</strong>${p.initials ? `<span class="td-mono" style="font-size:11px;margin-left:6px">${p.initials}</span>` : ''}</td>
                <td class="td-mono">${p.email || '—'}</td>
                <td>${p.designation || '—'}</td>
                <td>${typeBadge(empType)}</td>
                <td><span class="badge badge-${p.hrRole}">${roleLabel[p.hrRole] || p.hrRole}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    container.querySelector('#people-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('#people-table tbody tr').forEach(row => {
        const match = !q || row.dataset.name.includes(q) || row.dataset.email.includes(q);
        row.style.display = match ? '' : 'none';
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${Icon.users}<p style="color:var(--red)">Failed to load people: ${err.message}</p></div>`;
  }
}

async function renderHRSlotsTab(container) {
  container.innerHTML = `<div class="empty-state">${Icon.clock}<p>Loading slots…</p></div>`;
  try {
    const { slots } = await API.slots();
    hrState.slots = slots.filter(s => s.status !== 'deleted');

    if (!hrState.slots.length) {
      container.innerHTML = `<div class="empty-state">${Icon.clock}<p>No slots created yet. Team heads can add slots from their dashboard.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table id="hr-slots-table">
          <thead><tr>
            <th>Date</th><th>Time</th><th>Team Head</th><th>Linked Meeting</th><th>Status</th><th>Booked by</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${hrState.slots.sort((a,b) => (a.date||'').localeCompare(b.date||'')).map(s => `
              <tr>
                <td class="td-mono">${fmtDate(s.date)}</td>
                <td>${s.startTime} – ${s.endTime}</td>
                <td class="td-mono">${s.teamHeadEmail || '—'}</td>
                <td class="td-mono" style="font-size:11px">${s.meetingId || '—'}</td>
                <td>${statusBadge(s.status || 'available')}</td>
                <td>${s.bookedBy || '—'}</td>
                <td>
                  ${s.status !== 'booked' ? `<button class="btn btn-sm btn-danger hr-slot-delete-btn" data-id="${s.id}" title="Delete slot">${Icon.x}</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    container.querySelectorAll('.hr-slot-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await confirm('Delete this slot? This cannot be undone.', 'Delete slot', true);
        if (!ok) return;
        try {
          await API.deleteSlot(btn.dataset.id);
          Toast.success('Slot deleted');
          await renderHRSlotsTab(container);
        } catch (err) { Toast.error(err.message); }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${Icon.clock}<p style="color:var(--red)">Failed to load slots: ${err.message}</p></div>`;
  }
}

function monthAbbr(dateStr) {
  if (!dateStr) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `<br/>${months[parseInt(dateStr.slice(5,7)) - 1]}`;
}
