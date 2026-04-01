// public/js/app.js  (v2 — Employee_ID login)
(async function init() {
  const app = document.getElementById('app');
  const path = window.location.pathname;
  const voteMatch = path.match(/^\/vote\/(.+)$/);

  try {
    const session = await API.session();

    if (voteMatch) {
      app.innerHTML = '';
      await renderVotePage(voteMatch[1], session.authenticated ? session : null);
      return;
    }

    if (!session.authenticated) {
      app.innerHTML = renderLogin();
      attachLoginHandlers();
      return;
    }

    Router.register('/dashboard/hr',        () => renderHRDashboard(session));
    Router.register('/dashboard/team-head', () => renderTeamHeadDashboard(session));
    Router.register('/dashboard/employee',  () => renderEmployeeDashboard(session));
    Router.register('/', () => {
      const dest = session.role === 'hr_admin'  ? '/dashboard/hr'
                 : session.role === 'team_head' ? '/dashboard/team-head'
                 : '/dashboard/employee';
      Router.navigate(dest, true);
    });
    Router.register('*', () => {
      const dest = session.role === 'hr_admin'  ? '/dashboard/hr'
                 : session.role === 'team_head' ? '/dashboard/team-head'
                 : '/dashboard/employee';
      Router.navigate(dest, true);
    });

    Router.render(window.location.pathname);
  } catch (err) {
    app.innerHTML = renderLogin('Could not connect to the server. Please refresh.');
    attachLoginHandlers();
  }
})();
