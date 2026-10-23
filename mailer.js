// Sends email. Settings come from a .env file in the project folder (never commit it).
//   MAIL_MODE=console   -> prints the email in the terminal (for testing, no real email sent)
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM -> real email through an SMTP server
// With neither, email is off and the site keeps using the admin-approval flow.
const fs = require('fs');
const path = require('path');

(function loadEnv() {
  try {
    const file = path.join(__dirname, '.env');
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
      if (!line.trim() || line.trim().startsWith('#')) return;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) return;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    });
  } catch (e) { /* ignore a broken .env */ }
})();

function mode() {
  if (process.env.MAIL_MODE === 'console') return 'console';
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  return 'off';
}

function isEnabled() { return mode() !== 'off'; }

let transporter = null;

async function sendMail(message) {
  const m = mode();
  if (m === 'console') {
    console.log('\n----- EMAIL (console mode, not really sent) -----');
    console.log('To:      ' + message.to);
    console.log('Subject: ' + message.subject);
    console.log(message.text);
    console.log('-------------------------------------------------\n');
    return;
  }
  if (m !== 'smtp') throw new Error('Email is not configured');
  if (!transporter) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
}

module.exports = { mode, isEnabled, sendMail };