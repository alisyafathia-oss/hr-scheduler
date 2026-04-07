// public/js/components.js
// Reusable UI components shared across all views.

// ── Toast notifications ──────────────────────────────────────────────────
const Toast = (() => {
  let container;
  function init() {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  function show(message, type = 'info', duration = 3500) {
    if (!container) init();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s ease';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
  return {
    success: (msg) => show(msg, 'success'),
    error:   (msg) => show(msg, 'error', 5000),
    info:    (msg) => show(msg, 'info'),
  };
})();

// ── Modal ────────────────────────────────────────────────────────────────
function showModal({ title, body, footer, onClose, wide = false }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const closeBtn = `<button class="modal-close" id="modal-close-btn">
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 3l10 10M13 3L3 13"/>
    </svg>
  </button>`;

  backdrop.innerHTML = `
    <div class="modal${wide ? ' modal-wide' : ''}">
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        ${closeBtn}
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>`;

  document.body.appendChild(backdrop);

  function close() {
    backdrop.remove();
    if (onClose) onClose();
  }

  backdrop.querySelector('#modal-close-btn').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  return {
    close,
    el: backdrop,
    find: (sel) => backdrop.querySelector(sel),
    setBody: (html) => { backdrop.querySelector('.modal-body').innerHTML = html; },
  };
}

// ── Confirm dialog ───────────────────────────────────────────────────────
function confirm(message, action, danger = false) {
  return new Promise((resolve) => {
    const modal = showModal({
      title: 'Confirm action',
      body: `<p style="color:var(--ink-2)">${message}</p>`,
      footer: `
        <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${action}</button>
      `,
      onClose: () => resolve(false),
    });
    modal.find('#confirm-cancel').addEventListener('click', () => { modal.close(); resolve(false); });
    modal.find('#confirm-ok').addEventListener('click',    () => { modal.close(); resolve(true);  });
  });
}

// ── SVG icons ────────────────────────────────────────────────────────────
const Icon = {
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>`,
  users:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.87"/></svg>`,
  check:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
  x:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  clock:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  doc:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>`,
  vote:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  logout:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
  refresh:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  plus:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
  copy:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  home:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
};

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—';
  try {
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return str; }
}

function statusBadge(status) {
  const map = { pending: 'Pending', overdue: 'Overdue', booked: 'Booked',
                completed: 'Completed', cancelled: 'Cancelled',
                open: 'Open', tie: 'Tie', resolved: 'Resolved' };
  return `<span class="badge badge-${status}">${map[status] || status}</span>`;
}

// Returns 'overdue' if a pending meeting's scheduled date has passed
function effectiveStatus(meeting) {
  if (meeting.status === 'pending') {
    const today = new Date().toISOString().split('T')[0];
    if (meeting.scheduledDate && meeting.scheduledDate < today) return 'overdue';
  }
  return meeting.status;
}

function typeBadge(type) {
  const map = { intern: 'Intern', contract: 'Contract', permanent: 'Permanent' };
  return `<span class="badge badge-${type}">${map[type] || type}</span>`;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => Toast.success('Copied to clipboard'));
}

function setLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) btn.dataset.originalText = btn.innerHTML;
  btn.innerHTML = loading
    ? '<span style="opacity:.6">Loading…</span>'
    : btn.dataset.originalText || btn.innerHTML;
}

// Render the app shell (topbar + sidebar + content area)
function renderShell(session, activeNav, contentHtml) {
  const roleLabel = { hr_admin: 'HR Admin', team_head: 'Team Head', employee: 'Employee' }[session.role] || session.role;

  const hrNav = session.role === 'hr_admin' ? `
    <span class="sidebar-section-label">HR Tools</span>
    <button class="nav-item ${activeNav === 'hr-schedule' ? 'active' : ''}" data-nav="hr-schedule">${Icon.calendar} Schedule</button>
    <button class="nav-item ${activeNav === 'hr-people' ? 'active' : ''}" data-nav="hr-people">${Icon.users} People</button>
    <button class="nav-item ${activeNav === 'hr-votes' ? 'active' : ''}" data-nav="hr-votes">${Icon.vote} Votes</button>
  ` : '';

  const teamNav = session.role === 'team_head' ? `
    <span class="sidebar-section-label">My Team</span>
    <button class="nav-item ${activeNav === 'th-slots' ? 'active' : ''}" data-nav="th-slots">${Icon.clock} My Slots</button>
    <button class="nav-item ${activeNav === 'th-schedule' ? 'active' : ''}" data-nav="th-schedule">${Icon.calendar} Team Schedule</button>
  ` : '';

  const empNav = `
    <span class="sidebar-section-label">My Meetings</span>
    <button class="nav-item ${activeNav === 'emp-schedule' ? 'active' : ''}" data-nav="emp-schedule">${Icon.calendar} My Schedule</button>
    <button class="nav-item ${activeNav === 'emp-book' ? 'active' : ''}" data-nav="emp-book">${Icon.clock} Book a Slot</button>
  `;

  return `
    <div class="app-shell">
      <header class="topbar">
        <a class="topbar-brand" href="/">
          <div class="brand-mark">${Icon.calendar}</div>
          HR Scheduler
        </a>
        <div class="topbar-right">
          <div class="user-chip">
            ${session.picture ? `<img src="${session.picture}" alt="" />` : ''}
            <span>${session.name || session.email}</span>
            <span class="role-badge">${roleLabel}</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="API.logout()">
            ${Icon.logout} Sign out
          </button>
        </div>
      </header>
      <nav class="sidebar">
        <button class="nav-item ${activeNav === 'home' ? 'active' : ''}" data-nav="home">${Icon.home} Dashboard</button>
        ${hrNav}${teamNav}${empNav}
        <div style="flex:1"></div>
        <button class="nav-item danger" onclick="API.logout()">${Icon.logout} Sign out</button>
      </nav>
      <main class="main-content" id="main-content">
        ${contentHtml}
      </main>
    </div>`;
}
