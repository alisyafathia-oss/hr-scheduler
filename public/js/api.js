// public/js/api.js
// Thin wrapper around fetch — all API calls go through here.

const API = (() => {
  async function request(path, options = {}) {
    const res = await fetch(`/api/${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  return {
    // Auth
    session:  ()           => request('session'),
    logout:   ()           => window.location.href = '/api/auth-logout',

    // Meetings
    meetings: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`meetings${q ? '?' + q : ''}`);
    },
    cancelMeeting:   (meetingId) => request('meetings/cancel',   { method: 'POST', body: JSON.stringify({ meetingId }) }),
    completeMeeting: (meetingId) => request('meetings/complete', { method: 'POST', body: JSON.stringify({ meetingId }) }),

    // Slots
    slots:        (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`slots${q ? '?' + q : ''}`);
    },
    createSlot:   (data)        => request('slots',              { method: 'POST', body: JSON.stringify(data) }),
    bookSlot:     (data)        => request('slots?action=book',  { method: 'POST', body: JSON.stringify(data) }),
    availability: (params = {}) => {
      const q = new URLSearchParams({ action: 'availability', ...params }).toString();
      return request(`slots?${q}`);
    },

    // Voting
    startVote:    (data)       => request('votes/start',   { method: 'POST', body: JSON.stringify(data) }),
    castVote:     (data)       => request('votes/cast',    { method: 'POST', body: JSON.stringify(data) }),
    getVote:      (voteId)     => request(`votes/${voteId}`),
    resolveVote:  (data)       => request('votes/resolve', { method: 'POST', body: JSON.stringify(data) }),

    // Agenda
    generateAgenda: (meetingId) => request('agenda', { method: 'POST', body: JSON.stringify({ meetingId }) }),

    // Manual sync trigger (HR only)
    triggerSync: () => request('sync', { method: 'POST' }),

    // People list (HR only)
    people: () => request('people'),

    // Skip meeting (silent cancel — no email)
    skipMeeting: (meetingId) => request('meetings/skip', { method: 'POST', body: JSON.stringify({ meetingId }) }),
  };
})();
