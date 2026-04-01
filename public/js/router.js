// public/js/router.js
// Minimal client-side router. Maps URL paths to view functions.
// Views are registered via Router.register(path, renderFn).

const Router = (() => {
  const routes = {};
  let currentPath = null;

  function navigate(path, replace = false) {
    if (replace) history.replaceState({}, '', path);
    else history.pushState({}, '', path);
    render(path);
  }

  function render(path) {
    const handler = routes[path] || routes['*'];
    if (handler) {
      currentPath = path;
      handler(path);
    }
  }

  function register(path, fn) { routes[path] = fn; }

  function current() { return currentPath || window.location.pathname; }

  window.addEventListener('popstate', () => render(window.location.pathname));

  // Intercept all internal link clicks
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href && href.startsWith('/') && !href.startsWith('//') && !a.hasAttribute('data-external')) {
      e.preventDefault();
      navigate(href);
    }
  });

  return { register, navigate, render, current };
})();
