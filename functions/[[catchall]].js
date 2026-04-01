// functions/[[catchall]].js
// SPA fallback — serves index.html for all routes that don't match a static
// file or a more specific Function (e.g. /api/*).
// Cloudflare Pages routes more-specific functions first, so /api/* handlers
// are never affected by this catch-all.

export async function onRequest({ request, env }) {
  const url      = new URL(request.url);
  const indexUrl = new URL("/index.html", url.origin);
  return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
}
