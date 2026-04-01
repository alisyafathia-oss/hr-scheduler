// netlify/functions/session.js
// Returns the current session data (used by the frontend to know who's logged in).
const { getSession } = require("../../src/lib/auth");

exports.handler = async (event) => {
  const session = getSession(event);
  if (!session) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authenticated: false }),
    };
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authenticated: true,
      email: session.email,
      name: session.name,
      picture: session.picture,
      role: session.role,
    }),
  };
};
