// functions/[[catchall]].js
// SPA fallback — serves index.html for all routes that don't match a static
// file or a more specific Function (e.g. /api/*).
//
// IMPORTANT: We fetch "/" not "/index.html" from ASSETS.
// Cloudflare Pages clean-URL handling redirects "/index.html" → "/" in the
// browser, which would re-trigger this function and cause an infinite redirect
// loop. Fetching "/" goes directly to the KV asset store (bypassing Functions)
// and returns the index.html content with a 200 — no loop.

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  // Static asset requests (files with extensions: .js .css .png .ico etc.)
  // are passed straight through to the asset store.
  if (/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
    return env.ASSETS.fetch(request);
  }

  // All SPA routes — serve the root document (index.html) directly.
  return env.ASSETS.fetch(url.origin + "/");
}
