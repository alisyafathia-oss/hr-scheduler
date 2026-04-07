// public/js/views/hr-dashboard.js
// HR Admin dashboard — Overview | Schedule (grouped by employee) | People | Group Votes

let hrState = { meetings: [], slots: [], tab: 'overview', filter: 'all' };

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

  // Sidebar nav wiring
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.nav;
      if      (nav === 'hr-schedule') switchTab('schedule');
      else if (nav === 'hr-votes')    switchTab('votes');
      else if (nav === 'hr-people')   switchTab('people');
      else if (nav === 'home')        switchTab('overview');
    });
  });

  // Tab bar
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

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
  if (tab === 'overview') { content.innerHTML = renderHROverview(); attachHRHandlers(tab); }
  if (tab === 'schedule') { content.innerHTML = renderHRSchedule(); attachHRHandlers(tab); }
  if (tab === 'votes')    { renderHRVotes(content); }
  if (tab === 'people')   { renderHRPeople(content); }
  if (tab === 'slots')    { renderHRSlotsTab(content); }
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function renderHROverview() {
  const m     = hrState.meetings;
  const today = new Date().toISOString().split('T')[0];
  const in14  = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  const pending   = m.filter(x => x.status === 'pending').length;
  const booked    = m.filter(x => x.status === 'booked').length;
  const completed = m.filter(x => x.status === 'completed').length;
  const overdue   = m.filter(x => x.status === 'pending' && x.scheduledDate < today).length;

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
      <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">Pending</div></div>
      <div class="stat-card"><div class="stat-value">${overdue}</div><div class="stat-label">Overdue</div></div>
      <div class="stat-card"><div class="stat-value">${completed}</div><div class="stat-label">Completed</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="card">
        <div class="card-title">Upcoming booked (next 14 days)</div>
        ${upcoming.length === 0
          ? `<div class="empty-state" style="padding:16px">${Icon.calendar}<p>Nothing booked yet</p></div>`
          : upcoming.map(mtg => `
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
        ${pendingList.length === 0
          ? `<div class="empty-state" style="padding:16px">${Icon.check}<p>All caught up!</p></div>`
          : pendingList.map(mtg => `
              <div class="timeline-item">
                <div class="timeline-date"><strong>${mtg.scheduledDate.slice(8)}</strong>${monthAbbr(mtg.scheduledDate)}</div>
                <div class="timeline-info">
                  <div class="timeline-label">${mtg.label}</div>
                  <div class="timeline-meta">${mtg.employeeName}</div>
                </div>
                <button class="btn btn-sm btn-secondary hr-agenda-btn" data-id="${mtg.id}" title="Agenda">${Icon.doc}</button>
              </div>`).join('')}
      </div>
    </div>`;
}

// ── Schedule tab — grouped by employee ────────────────────────────────────────

function renderHRSchedule() {
  const f     = hrState.filter;
  const today = new Date().toISOString().split('T')[0];
  const m     = hrState.meetings;

  const counts = {
    total:     m.length,
    pending:   m.filter(x => x.status === 'pending').length,
    overdue:   m.filter(x => x.status === 'pending' && x.scheduledDate < today).length,
    booked:    m.filter(x => x.status === 'booked').length,
    completed: m.filter(x => x.status === 'completed').length,
    cancelled: m.filter(x => x.status === 'cancelled').length,
  };

  // Group meetings by employee
  const byEmp = {};
  hrState.meetings.forEach(m => {
    if (!byEmp[m.employeeId]) {
      byEmp[m.employeeId] = { id: m.employeeId, name: m.employeeName, email: m.employeeEmail, meetings: [] };
    }
    const eff = effectiveStatus(m);
    if (f === 'all' || m.status === f || (f === 'overdue' && eff === 'overdue')) byEmp[m.employeeId].meetings.push(m);
  });

  const employees = Object.values(byEmp)
    .filter(e => e.meetings.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalShown = employees.reduce((s, e) => s + e.meetings.length, 0);

  return `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card accent"><div class="stat-value">${counts.total}</div><div class="stat-label">Total</div></div>
      <div class="stat-card"><div class="stat-value">${counts.pending}</div><div class="stat-label">Pending</div></div>
      <div class="stat-card"><div class="stat-value">${counts.overdue}</div><div class="stat-label">Overdue</div></div>
      <div class="stat-card"><div class="stat-value">${counts.booked}</div><div class="stat-label">Booked</div></div>
      <div class="stat-card"><div class="stat-value">${counts.completed}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card"><div class="stat-value">${counts.cancelled}</div><div class="stat-label">Cancelled</div></div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <span style="font-size:13px;color:var(--ink-3)">Filter:</span>
      ${['all','overdue','pending','booked','completed','cancelled'].map(s =>
        `<button class="btn btn-sm ${f === s ? 'btn-primary' : 'btn-secondary'} filter-btn" data-filter="${s}">${s.charAt(0).toUpperCase()+s.slice(1)}</button>`
      ).join('')}
      <span style="margin-left:auto;font-size:13px;color:var(--ink-3)">${employees.length} employees · ${totalShown} meetings</span>
    </div>
    ${employees.length === 0
      ? `<div class="empty-state">${Icon.calendar}<p>No meetings found</p></div>`
      : employees.map(emp => {
          const sorted  = [...emp.meetings].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
          const overdue = sorted.filter(m => m.status === 'pending' && m.scheduledDate < today).length;
          const pending = sorted.filter(m => m.status === 'pending').length;
          return `
            <div class="card" style="margin-bottom:10px;padding:0;overflow:hidden">
              <div style="padding:12px 16px;display:flex;align-items:center;cursor:pointer;justify-content:space-between" data-emp-toggle="${emp.id}">
                <div>
                  <span style="font-weight:600;font-size:14px">${emp.name}</span>
                  <span style="color:var(--ink-3);font-size:12px;margin-left:8px">${emp.id}</span>
                  <div style="font-size:12px;color:var(--ink-3)">${emp.email || ''}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  ${overdue > 0 ? `<span class="badge badge-overdue">${overdue} overdue</span>` : ''}
                  <span class="badge badge-pending">${pending} pending</span>
                  <span style="font-size:12px;color:var(--ink-3)">${sorted.length} total</span>
                  <span id="chev-${emp.id}" style="font-size:13px;color:var(--ink-3)">▼</span>
                </div>
              </div>
              <div id="emp-detail-${emp.id}" style="display:none;border-top:1px solid var(--border)">
                <table style="width:100%">
                  <thead><tr style="background:var(--surface-2)">
                    <th style="padding:7px 16px;text-align:left;font-size:12px;color:var(--ink-3);font-weight:500">Date</th>
                    <th style="padding:7px 16px;text-align:left;font-size:12px;color:var(--ink-3);font-weight:500">Meeting</th>
                    <th style="padding:7px 16px;text-align:left;font-size:12px;color:var(--ink-3);font-weight:500">Status</th>
                    <th style="padding:7px 16px;text-align:left;font-size:12px;color:var(--ink-3);font-weight:500">Actions</th>
                  </tr></thead>
                  <tbody>
                    ${sorted.map(m => `
                      <tr style="border-top:1px solid var(--border)">
                        <td style="padding:7px 16px;font-size:13px;font-family:monospace;color:${m.status==='pending'&&m.scheduledDate<today?'var(--red)':'inherit'};white-space:nowrap">${fmtDate(m.scheduledDate)}</td>
                        <td style="padding:7px 16px;font-size:13px">${m.label}</td>
                        <td style="padding:7px 16px">${statusBadge(effectiveStatus(m))}</td>
                        <td style="padding:7px 16px">
                          <div style="display:flex;gap:4px;flex-wrap:wrap">
                            <button class="btn btn-sm btn-secondary hr-agenda-btn" data-id="${m.id}" title="Agenda">${Icon.doc}</button>
                            ${['pending','booked'].includes(m.status) ? `
                              <button class="btn btn-sm btn-primary hr-done-btn" data-id="${m.id}">${Icon.check} Done</button>
                              <button class="btn btn-sm btn-secondary hr-skip-btn" data-id="${m.id}">${Icon.x} Skip</button>
                            ` : ''}
                          </div>
                        </td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            </div>`;
        }).join('')}`;
}

// ── People tab ────────────────────────────────────────────────────────────────

async function renderHRPeople(container) {
  container.innerHTML = `<div class="empty-state">${Icon.users}<p>Loading people…</p></div>`;
  try {
    const { people } = await API.people();
    const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
    const roleColor = { hr_admin: 'booked', team_head: 'pending', employee: 'completed' };
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-size:18px;font-weight:600">All Employees</span>
        <span style="font-size:13px;color:var(--ink-3)">${sorted.length} people</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>ID</th><th>Name</th><th>Type</th><th>Designation</th><th>Work Email</th><th>Role</th>
          </tr></thead>
          <tbody>
            ${sorted.map(p => `
              <tr>
                <td class="td-mono">${p.id}</td>
                <td class="td-name">${p.name}</td>
                <td>${p.employmentType || '—'}</td>
                <td>${p.designation || '—'}</td>
                <td class="td-mono" style="font-size:12px">${p.workEmail || '—'}</td>
                <td><span class="badge badge-${roleColor[p.role] || 'completed'}">${(p.role||'employee').replace('_',' ')}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--red)">Failed to load: ${e.message}</p></div>`;
  }
}

// ── Votes tab ─────────────────────────────────────────────────────────────────

async function renderHRVotes(container) {
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
    const row  = document.createElement('div');
    row.className = 'form-row vote-slot-row';
    row.innerHTML = `<input class="form-input" placeholder="2025-06-15" name="slot-date" /><input class="form-input" placeholder="10:00" name="slot-time" />`;
    list.appendChild(row);
  });

  container.querySelector('#start-vote-btn').addEventListener('click', async (e) => {
    setLoading(e.target, true);
    const meetingId   = container.querySelector('#vote-meeting-id').value.trim();
    const voterEmails = container.querySelector('#vote-emails').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
    const slots = Array.from(container.querySelectorAll('.vote-slot-row')).map(r => ({
      date:      r.querySelector('[name="slot-date"]').value.trim(),
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

// ── Event handlers ────────────────────────────────────────────────────────────

function attachHRHandlers(tab) {
  // Sync button (overview)
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

  // Filter buttons (schedule)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => { hrState.filter = btn.dataset.filter; switchTab('schedule'); });
  });

  // Expand/collapse employee rows (schedule)
  document.querySelectorAll('[data-emp-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const id     = el.dataset.empToggle;
      const detail = document.getElementById(`emp-detail-${id}`);
      const chev   = document.getElementById(`chev-${id}`);
      if (!detail) return;
      const open = detail.style.display === 'none';
      detail.style.display = open ? 'block' : 'none';
      if (chev) chev.textContent = open ? '▲' : '▼';
    });
  });

  // Agenda buttons
  document.querySelectorAll('.hr-agenda-btn').forEach(btn => {
    btn.addEventListener('click', () => showAgendaModal(btn.dataset.id));
  });

  // Done buttons (mark completed)
  document.querySelectorAll('.hr-done-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const ok = await confirm('Mark this meeting as done / completed?', 'Mark done');
      if (!ok) return;
      setLoading(e.target, true);
      try {
        await API.completeMeeting(btn.dataset.id);
        hrState.meetings = hrState.meetings.map(m =>
          m.id === btn.dataset.id ? { ...m, status: 'completed' } : m
        );
        Toast.success('Marked as done');
        switchTab(hrState.tab);
      } catch (err) { Toast.error(err.message); }
      setLoading(e.target, false);
    });
  });

  // Skip buttons (silent cancel — no email)
  document.querySelectorAll('.hr-skip-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const ok = await confirm('Skip this meeting? It will be marked cancelled with no email sent.', 'Skip', true);
      if (!ok) return;
      setLoading(e.target, true);
      try {
        await API.skipMeeting(btn.dataset.id);
        hrState.meetings = hrState.meetings.map(m =>
          m.id === btn.dataset.id ? { ...m, status: 'cancelled' } : m
        );
        Toast.success('Meeting skipped');
        switchTab(hrState.tab);
      } catch (err) { Toast.error(err.message); }
      setLoading(e.target, false);
    });
  });

  // Legacy cancel buttons (sends email) — kept for overview tab
  document.querySelectorAll('.hr-cancel-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mtg = hrState.meetings.find(m => m.id === btn.dataset.id);
      const ok  = await confirm(`Cancel "${mtg?.label}" for ${mtg?.employeeName}? A cancellation email will be sent.`, 'Cancel meeting', true);
      if (!ok) return;
      try {
        await API.cancelMeeting(btn.dataset.id);
        hrState.meetings = hrState.meetings.map(m =>
          m.id === btn.dataset.id ? { ...m, status: 'cancelled' } : m
        );
        Toast.success('Meeting cancelled');
        switchTab(hrState.tab);
      } catch (err) { Toast.error(err.message); }
    });
  });
}

// ── Agenda modal ──────────────────────────────────────────────────────────────

async function showAgendaModal(meetingId) {
  const modal = showModal({
    title: 'Meeting agenda',
    body:  `<div class="empty-state">${Icon.doc}<p>Generating agenda…</p></div>`,
    wide:  true,
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
      <button class="btn btn-secondary btn-sm" id="agenda-copy">
        ${Icon.copy} Copy as plain text
      </button>`);

    modal.find('#agenda-copy').addEventListener('click', () => copyToClipboard(text));
  } catch (err) {
    modal.setBody(`<p style="color:var(--red)">Failed to generate agenda: ${err.message}</p>`);
  }
}

// ── Slots tab ─────────────────────────────────────────────────────────────────

async function renderHRSlotsTab(container) {
  container.innerHTML = `<div class="empty-state">${Icon.clock}<p>Loading slots…</p></div>`;
  try {
    const { slots } = await API.slots();
    hrState.slots = (slots || []).filter(s => s.status !== 'deleted');

    if (!hrState.slots.length) {
      container.innerHTML = `<div class="empty-state">${Icon.clock}<p>No slots created yet. Team heads add slots from their dashboard.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>Time</th><th>Team Head</th><th>Linked Meeting</th><th>Status</th><th>Booked by</th><th></th>
          </tr></thead>
          <tbody>
            ${hrState.slots.sort((a,b) => (a.date||'').localeCompare(b.date||'')).map(s => `
              <tr>
                <td class="td-mono">${fmtDate(s.date)}</td>
                <td>${s.startTime} – ${s.endTime}</td>
                <td class="td-mono" style="font-size:12px">${s.teamHeadEmail || '—'}</td>
                <td class="td-mono" style="font-size:11px">${s.meetingId || '—'}</td>
                <td>${statusBadge(s.status || 'available')}</td>
                <td>${s.bookedBy || '—'}</td>
                <td>
                  ${s.status !== 'booked' ? `<button class="btn btn-sm btn-danger hr-slot-delete-btn" data-id="${s.id}" title="Delete">${Icon.x}</button>` : ''}
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
          renderHRSlotsTab(container);
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
