// scripts/setup-hr-password.js
// ─────────────────────────────────────────────────────────────────────────
// Run this ONCE locally to generate the HR admin password hash.
// Then paste the output into your Netlify environment variables.
//
// Usage:
//   node scripts/setup-hr-password.js
//
// You will be prompted to enter the HR admin password.
// The script outputs the two env var values to paste into Netlify.
// ─────────────────────────────────────────────────────────────────────────

const crypto   = require("crypto");
const readline = require("readline");

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const h = crypto.createHmac("sha256", s).update(password).digest("hex");
  return { hash: h, salt: s };
}

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
});

// Hide password input
function askHidden(prompt, callback) {
  process.stdout.write(prompt);
  const stdin = process.openStdin();
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  let password = "";
  process.stdin.on("data", function handler(ch) {
    ch = ch + "";
    switch (ch) {
      case "\n": case "\r": case "\u0004":
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", handler);
        process.stdout.write("\n");
        callback(password);
        break;
      case "\u0003":
        process.exit();
        break;
      case "\u007f":
        password = password.slice(0, -1);
        break;
      default:
        process.stdout.write("*");
        password += ch;
    }
  });
}

console.log("\n╔══════════════════════════════════════════╗");
console.log("║  HR Scheduler — HR Admin Password Setup  ║");
console.log("╚══════════════════════════════════════════╝\n");
console.log("This generates the password hash to store in Netlify.\n");

askHidden("Enter HR admin password (min 8 chars): ", (pw1) => {
  if (pw1.length < 8) {
    console.error("\nPassword must be at least 8 characters.");
    process.exit(1);
  }
  askHidden("Confirm password: ", (pw2) => {
    if (pw1 !== pw2) {
      console.error("\nPasswords do not match.");
      process.exit(1);
    }

    const { hash, salt } = hashPassword(pw1);

    console.log("\n✓ Password hashed successfully.\n");
    console.log("═══════════════════════════════════════════════════");
    console.log("Paste these into Netlify → Site Settings → Env Vars");
    console.log("═══════════════════════════════════════════════════\n");
    console.log(`HR_ADMIN_PASSWORD_HASH=${hash}`);
    console.log(`HR_ADMIN_PASSWORD_SALT=${salt}`);
    console.log("\n═══════════════════════════════════════════════════");
    console.log("Keep these values secret. Never commit to git.");
    process.exit(0);
  });
});
