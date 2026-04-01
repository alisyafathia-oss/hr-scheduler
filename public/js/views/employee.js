// public/js/views/employee.js
let empState = { meetings: [], slots: [], tab: 'schedule' };

async function renderEmployeeDashboard(session) {
  document.getElementById('app').innerHTML = renderShell(session, 'emp-schedule', `
    <div class="page-header">
      <h1 class="page-title">My Meetings</h1>
      <p class="page-subtitle">View your schedule and book available slots</p>
    </div>
    <div class="tab-bar">
      <button class="tab active" data-tab="schedule">My Schedule</button>
      <button class="tab" data-tab="book">Book a Slot</button>
    </div>
    <div id="emp-tab-content">
      <div class="empty-state">${Icon.calendar}<p>Loading…</p></div>
    </div>
  `);

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchEmpTab(t.dataset.tab, session)));

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = btn.dataset.nav;
      if (n === 'emp-schedule') switchEmpTab('schedule', session);
      else if (n === 'emp-book') switchEmpTab('book', session);
    });
  });

  await switchEmpTab('schedule', session);
}

async function switchEmpTab(tab, session) {
  empState.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const content = document.getElementById('emp-tab-content');
  if (!content) return;

  if (tab === 'schedule') {
    content.innerHTML = `<div class="empty-state">${Icon.calendar}<p>Loading…</p></div>`;
    try {
      const { meetings } = await API.meetings();
      empState.meetings = meetings;
      content.innerHTML = renderEmpSchedule(meetings, session);
    } catch (e) { Toast.error(e.message); }
  }

  if (tab === 'book') {
    content.innerHTML = `<div class="empty-state">${Icon.clock}<p>Loading available slots…</p></div>`;
    try {
      const [{ slots }, { meetings }] = await Promise.all([
        API.slots({ status: 'available' }),
        API.meetings({ status: 'pending' }),
      ]);
      empState.slots    = slots;
      empState.meetings = meetings;
      content.innerHTML = renderBookingView(slots, meetings);
      attachBookingHandlers(content, session);
    } catch (e) { Toast.error(e.message); }
  }
}

function renderEmpSchedule(meetings, session) {
  const sorted = [...meetings].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  if (!sorted.length) return `<div class="empty-state">${Icon.calendar}<p>No meetings scheduled yet</p></div>`;

  const today = new Date().toISOString().split('T')[0];
  const upcoming = sorted.filter(m => m.scheduledDate >= today);
  const past     = sorted.filter(m => m.scheduledDate < today);

  function section(label, items) {
    if (!items.length) return '';
    return `
      <div class="timeline-month">
        <div class="timeline-month-label">${label}</div>
        ${items.map(m => `
          <div class="timeline-item">
            <div class="timeline-date">
              <strong>${m.scheduledDate.slice(8)}</strong>
              ${monthAbbr2(m.scheduledDate)}
            </div>
            <div class="timeline-info">
              <div class="timeline-label">${m.label}</div>
              <div class="timeline-meta">${m.durationMins} min${m.isGroupSession ? ' · Group session' : ''}</div>
            </div>
            <div class="timeline-actions">
              ${statusBadge(m.status)}
              ${m.status === 'pending' ? `<button class="btn btn-sm btn-primary emp-book-btn" data-id="${m.id}">${Icon.clock} Book</button>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
  }

  const html = `
    <div class="timeline">
      ${section('Upcoming', upcoming)}
      ${section('Past', past)}
    </div>`;

  setTimeout(() => {
    document.querySelectorAll('.emp-book-btn').forEach(btn => {
      btn.addEventListener('click', () => switchEmpTab('book', session));
    });
  }, 0);

  return html;
}

function renderBookingView(slots, pendingMeetings) {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
      <div class="card">
        <div class="card-title">1. Select a meeting to book</div>
        ${pendingMeetings.length === 0
          ? `<p style="font-size:13px;color:var(--ink-3)">No pending meetings to book.</p>`
          : pendingMeetings.map(m => `
              <div class="timeline-item ${empState.selectedMeeting === m.id ? 'selected' : ''}" style="cursor:pointer;margin-bottom:6px" data-meeting-id="${m.id}">
                <div class="timeline-info">
                  <div class="timeline-label">${m.label}</div>
                  <div class="timeline-meta">${fmtDate(m.scheduledDate)} · ${m.durationMins} min</div>
                </div>
              </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title">2. Choose a slot</div>
        ${slots.length === 0
          ? `<p style="font-size:13px;color:var(--ink-3)">No slots available yet. Check back later or contact HR.</p>`
          : `<div class="slot-grid" id="slot-grid">
              ${slots.map(s => `
                <div class="slot-card" data-slot-id="${s.id}">
                  <div class="slot-date">${fmtDate(s.date)}</div>
                  <div class="slot-time">${s.startTime} – ${s.endTime}</div>
                </div>`).join('')}
            </div>
            <button class="btn btn-primary" style="margin-top:16px;width:100%" id="confirm-booking-btn" disabled>Confirm booking</button>`}
      </div>
    </div>`;
}

function attachBookingHandlers(content, session) {
  let selectedMeeting = null;
  let selectedSlot    = null;

  content.querySelectorAll('[data-meeting-id]').forEach(el => {
    el.addEventListener('click', () => {
      content.querySelectorAll('[data-meeting-id]').forEach(x => x.style.borderColor = '');
      el.style.borderColor = 'var(--teal)';
      el.style.background  = 'var(--teal-light)';
      selectedMeeting = el.dataset.meetingId;
      checkReady();
    });
  });

  content.querySelectorAll('.slot-card').forEach(card => {
    card.addEventListener('click', () => {
      content.querySelectorAll('.slot-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedSlot = card.dataset.slotId;
      checkReady();
    });
  });

  function checkReady() {
    const btn = content.querySelector('#confirm-booking-btn');
    if (btn) btn.disabled = !(selectedMeeting && selectedSlot);
  }

  content.querySelector('#confirm-booking-btn')?.addEventListener('click', async (e) => {
    if (!selectedMeeting || !selectedSlot) return;
    const ok = await confirm('Confirm this booking? A calendar invite will be created and emails sent to you and your manager.', 'Confirm booking');
    if (!ok) return;
    setLoading(e.target, true);
    try {
      await API.bookSlot({ slotId: selectedSlot, meetingId: selectedMeeting });
      Toast.success('Booking confirmed! Check your email for the calendar invite.');
      await switchEmpTab('schedule', session);
    } catch (err) { Toast.error(err.message); }
    setLoading(e.target, false);
  });
}

function monthAbbr2(dateStr) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(dateStr.slice(5,7)) - 1] || '';
}
