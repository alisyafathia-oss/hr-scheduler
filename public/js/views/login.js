// public/js/views/login.js  (v3)
function renderLogin(errorMsg) {
  return `
    <div class="login-page">
      <div class="login-card">
        <div class="login-mark">${Icon.calendar}</div>
        <h1 class="login-title">HR Scheduler</h1>
        <p class="login-subtitle">Sign in to access your schedule</p>

        ${errorMsg ? `<div style="background:var(--red-light);color:var(--red);padding:10px 14px;border-radius:var(--radius-sm);font-size:13px;margin-bottom:16px">${errorMsg}</div>` : ''}

        <div class="tab-bar" style="margin-bottom:20px;width:100%">
          <button class="tab active" data-login-tab="staff" style="flex:1">Staff &amp; Managers</button>
          <button class="tab"        data-login-tab="hr"    style="flex:1">HR Access</button>
        </div>

        <div id="panel-staff">
          <div class="form-group">
            <label class="form-label">Employee ID</label>
            <input class="form-input" id="login-emp-id" placeholder="e.g. E002"
              autocomplete="username"
              style="font-family:var(--mono);font-size:15px;letter-spacing:.06em" />
          </div>
          <div id="staff-error" style="display:none;background:var(--red-light);color:var(--red);
            padding:10px 14px;border-radius:var(--radius-sm);font-size:13px;margin-bottom:12px"></div>
          <button class="btn btn-primary" style="width:100%" id="staff-submit">Sign in</button>
          <p style="font-size:12px;color:var(--ink-4);margin-top:14px;text-align:center">
            Enter your Employee ID to view and book your meetings.
          </p>
        </div>

        <div id="panel-hr" style="display:none">
          <div class="form-group">
            <label class="form-label">HR email address</label>
            <input class="form-input" id="login-email" type="email"
              placeholder="hr@yourcompany.com" autocomplete="email" />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <div style="position:relative">
              <input class="form-input" id="login-password" type="password"
                placeholder="Enter your password" autocomplete="current-password"
                style="padding-right:44px" />
              <button id="toggle-pw" type="button"
                style="position:absolute;right:10px;top:50%;transform:translateY(-50%);
                  background:none;border:none;cursor:pointer;color:var(--ink-3);padding:4px">
                <svg id="pw-eye" viewBox="0 0 24 24" width="16" height="16" fill="none"
                  stroke="currentColor" stroke-width="1.8">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="hr-error" style="display:none;background:var(--red-light);color:var(--red);
            padding:10px 14px;border-radius:var(--radius-sm);font-size:13px;margin-bottom:12px"></div>
          <button class="btn btn-primary" style="width:100%" id="hr-submit">Sign in as HR</button>
          <p style="font-size:12px;color:var(--ink-4);margin-top:14px;text-align:center">
            HR admin access only. Contact IT if you need help.
          </p>
        </div>

      </div>
    </div>`;
}

function attachLoginHandlers() {
  // Tab switching
  document.querySelectorAll('[data-login-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.dataset.loginTab;
      document.querySelectorAll('[data-login-tab]').forEach(x =>
        x.classList.toggle('active', x.dataset.loginTab === t));
      document.getElementById('panel-staff').style.display = t === 'staff' ? '' : 'none';
      document.getElementById('panel-hr').style.display    = t === 'hr'    ? '' : 'none';
    });
  });

  // Show/hide password
  document.getElementById('toggle-pw')?.addEventListener('click', () => {
    const pw = document.getElementById('login-password');
    const showing = pw.type === 'text';
    pw.type = showing ? 'password' : 'text';
    document.getElementById('pw-eye').style.opacity = showing ? '1' : '0.4';
  });

  // ── Staff login ────────────────────────────────────────────────────────
  const empInput   = document.getElementById('login-emp-id');
  const staffBtn   = document.getElementById('staff-submit');
  const staffErr   = document.getElementById('staff-error');

  // Auto-uppercase
  empInput?.addEventListener('input', () => {
    const pos = empInput.selectionStart;
    empInput.value = empInput.value.toUpperCase();
    empInput.setSelectionRange(pos, pos);
  });

  async function doStaffLogin() {
    const employeeId = (empInput?.value || '').trim().toUpperCase();
    if (!employeeId) { staffErr.textContent = 'Please enter your Employee ID.'; staffErr.style.display = 'block'; return; }
    staffErr.style.display = 'none';
    setLoading(staffBtn, true);
    try {
      const res  = await fetch('/.netlify/functions/auth-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginType: 'id', employeeId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        staffErr.textContent = data.error || 'Login failed. Please check your Employee ID.';
        staffErr.style.display = 'block';
        setLoading(staffBtn, false);
        return;
      }
      window.location.href = data.redirect;
    } catch {
      staffErr.textContent = 'Could not connect. Please try again.';
      staffErr.style.display = 'block';
      setLoading(staffBtn, false);
    }
  }

  staffBtn?.addEventListener('click', doStaffLogin);
  empInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doStaffLogin(); });

  // ── HR login ───────────────────────────────────────────────────────────
  const emailInput = document.getElementById('login-email');
  const pwInput    = document.getElementById('login-password');
  const hrBtn      = document.getElementById('hr-submit');
  const hrErr      = document.getElementById('hr-error');

  async function doHRLogin() {
    const email    = (emailInput?.value || '').trim();
    const password = pwInput?.value || '';
    if (!email || !password) { hrErr.textContent = 'Email and password are required.'; hrErr.style.display = 'block'; return; }
    hrErr.style.display = 'none';
    setLoading(hrBtn, true);
    try {
      const res  = await fetch('/.netlify/functions/auth-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginType: 'hr', email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        hrErr.textContent = data.error || 'Login failed.';
        hrErr.style.display = 'block';
        setLoading(hrBtn, false);
        return;
      }
      window.location.href = data.redirect;
    } catch {
      hrErr.textContent = 'Could not connect. Please try again.';
      hrErr.style.display = 'block';
      setLoading(hrBtn, false);
    }
  }

  hrBtn?.addEventListener('click', doHRLogin);
  pwInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doHRLogin(); });
  emailInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') pwInput?.focus(); });
}
