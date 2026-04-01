// netlify/functions/sync.js
// POST /api/sync — manual schedule sync, HR admin only.

const { requireRole } = require("../../src/lib/auth");
const { runSync }     = require("../../src/lib/sync");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const { error } = requireRole(event, "hr_admin");
  if (error) return error;

  try {
    const result = await runSync();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (err) {
    console.error("Manual sync error:", err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
