// netlify/functions/scheduled-sync.js
// Runs daily at 7am UTC via Netlify scheduled functions.

const { schedule } = require("@netlify/functions");
const { runSync }  = require("../../src/lib/sync");

async function handler() {
  console.log("[scheduled-sync] Starting at", new Date().toISOString());
  try {
    const result = await runSync();
    console.log("[scheduled-sync] Done:", result);
    return { statusCode: 200, body: JSON.stringify({ success: true, ...result }) };
  } catch (err) {
    console.error("[scheduled-sync] Error:", err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
}

exports.handler = schedule("0 7 * * *", handler);
