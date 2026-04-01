/**
 * functions/_compat.js
 * Adapter between Cloudflare Pages Functions and the existing Netlify-style
 * handler API used throughout src/lib/*.
 *
 * Usage in each Pages Function:
 *   import { injectEnv, toNetlifyEvent, fromNetlifyResponse } from "../_compat.js";
 */

/**
 * Copies Cloudflare environment bindings into process.env so that all
 * existing src/lib files can continue to read process.env.* unchanged.
 * Requires the `nodejs_compat` compatibility flag in wrangler.toml.
 */
export function injectEnv(env) {
  if (typeof process !== "undefined" && process.env) {
    Object.assign(process.env, env);
  }
}

/**
 * Converts a Cloudflare Pages Request into the Netlify-style event object
 * expected by the handler logic ported from netlify/functions/*.
 */
export async function toNetlifyEvent(request) {
  const url = new URL(request.url);

  const queryStringParameters = {};
  url.searchParams.forEach((value, key) => {
    queryStringParameters[key] = value;
  });

  let body = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }

  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    httpMethod: request.method,
    path: url.pathname,
    headers,
    queryStringParameters,
    body,
  };
}

/**
 * Converts a Netlify function response object into a Cloudflare Response.
 * Handles Set-Cookie passthrough correctly.
 */
export function fromNetlifyResponse(netlifyResponse) {
  const { statusCode, headers = {}, body = "" } = netlifyResponse;
  return new Response(body, {
    status: statusCode,
    headers,
  });
}
