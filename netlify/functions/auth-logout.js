// netlify/functions/auth-logout.js
const { clearSessionCookie } = require("../../src/lib/auth");

exports.handler = async () => ({
  statusCode: 302,
  headers: {
    Location: process.env.APP_URL + "/",
    "Set-Cookie": clearSessionCookie(),
  },
  body: "",
});
