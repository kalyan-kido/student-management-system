// Self-service password reset by emailed link (valid 30 minutes, works once).
// Must be connected BEFORE passwordRoutes so it handles POST /forgot-password first.
// If email is not configured it steps aside and the admin-approval flow is used.
const nodeCrypto = require('crypto');
const mailer = require('./mailer');

module.exports = function (app, deps) {
  const { db, bcrypt, COLLEGE_NAME } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT NOT NULL,
      account_key TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets(token_hash)');

  const TOKEN_MINUTES = 30;
  const MAX_PER_ACCOUNT_PER_HOUR = 3;
  const MAX_PER_IP_PER_HOUR = 10;
  const ipHits = new Map();

  function tooManyFromIp(ip) {
    const now = Date.now();
    const recent = (ipHits.get(ip) || []).filter(t => now - t < 3600000);
    recent.push(now);
    ipHits.set(ip, recent);
    return recent.length > MAX_PER_IP_PER_HOUR;
  }

  const hashToken = (t) => nodeCrypto.createHash('sha256').update(t).digest('hex');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const baseUrl = () => (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

  function findAccount(type, ident) {
    if (type === 'teacher') {
      const t = db.prepare('SELECT id AS acct_key, name, email, role FROM teachers WHERE lower(email) = lower(?)').get(ident);
      return t ? { key: String(t.acct_key), name: t.name, email: t.email, role: t.role } : null;
    }
    const s = db.prepare('SELECT university_id AS acct_key, name, email FROM students WHERE lower(email) = lower(?) OR upper(university_id) = upper(?)').get(ident, ident);
    return s ? { key: s.acct_key, name: s.name, email: s.email, role: 'student' } : null;
  }

  function buildEmail(name, link) {
    const subject = 'Reset your password - ' + COLLEGE_NAME;
    const text =
      'Hello ' + name + ',\n\n' +
      'We received a request to reset your password for the ' + COLLEGE_NAME + ' portal.\n\n' +
      'Open this link to choose a new password. It works once and expires in ' + TOKEN_MINUTES + ' minutes:\n' +
      link + '\n\n' +
      'If you did not ask for this, you can ignore this email. Your password will not change.\n';
    const html =
      '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #E9E1D6;border-top:4px solid #BF0716;border-radius:8px;padding:28px;color:#1B1614">' +
      '<h2 style="margin:0 0 12px;color:#8E0510">' + esc(COLLEGE_NAME) + '</h2>' +
      '<p>Hello ' + esc(name) + ',</p>' +
      '<p>We received a request to reset your password for the college portal.</p>' +
      '<p style="margin:24px 0"><a href="' + esc(link) + '" style="background:#BF0716;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold">Choose a new password</a></p>' +
      '<p style="font-size:13px;color:#6E625A">This link works once and expires in ' + TOKEN_MINUTES + ' minutes. If the button does not work, copy this address into your browser:<br>' + esc(link) + '</p>' +
      '<p style="font-size:13px;color:#6E625A">If you did not ask for this, ignore this email. Your password will not change.</p>' +
      '</div>';
    return { subject: subject, text: text, html: html };
  }

  async function notifyAdmin(type, account) {
    const to = process.env.ADMIN_NOTIFY_EMAIL;
    if (!to || !mailer.isEnabled()) return;
    if (type === 'student' && process.env.NOTIFY_ADMIN_FOR_STUDENTS !== 'true') return;
    try {
      await mailer.sendMail({
        to: to,
        subject: 'Password reset requested: ' + account.name,
        text: 'A password reset link was emailed to ' + account.name + ' (' + account.email + ', ' + type + ') at ' + new Date().toISOString() + '.\nNo action is needed. If this was not them, contact the account owner.\n'
      });
    } catch (err) {
      console.error('Admin notice failed:', err.message);
    }
  }

  function queueForAdmin(type, key, ident) {
    try {
      const open = db.prepare("SELECT id FROM password_requests WHERE account_type = ? AND account_key = ? AND status = 'open'").get(type, key);
      if (!open) db.prepare('INSERT INTO password_requests (account_type, account_key, identifier) VALUES (?, ?, ?)').run(type, key, ident);
    } catch (err) {
      console.error('Could not queue the request for the admin:', err.message);
    }
  }

  app.post('/forgot-password', async (req, res, next) => {
    if (!mailer.isEnabled()) return next();

    const type = req.body.type === 'teacher' ? 'teacher' : 'student';
    const ident = String(req.body.identifier || '').trim();
    if (!ident) return next();

    if (tooManyFromIp(req.ip)) {
      return res.status(429).render('forgotPassword', {
        collegeName: COLLEGE_NAME, type: type, sent: false,
        error: 'Too many requests. Please try again in an hour.'
      });
    }

    const account = findAccount(type, ident);
    if (account && account.email) {
      const since = new Date(Date.now() - 3600000).toISOString();
      const recent = db.prepare('SELECT COUNT(*) AS c FROM password_resets WHERE account_type = ? AND account_key = ? AND created_at >= ?')
        .get(type, account.key, since.replace('T', ' ').slice(0, 19)).c;

      if (recent < MAX_PER_ACCOUNT_PER_HOUR) {
        const token = nodeCrypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + TOKEN_MINUTES * 60000).toISOString();
        db.prepare('INSERT INTO password_resets (account_type, account_key, token_hash, expires_at) VALUES (?, ?, ?, ?)')
          .run(type, account.key, hashToken(token), expires);

        const link = baseUrl() + '/reset-password?token=' + token;
        const email = buildEmail(account.name, link);
        try {
          await mailer.sendMail({ to: account.email, subject: email.subject, text: email.text, html: email.html });
          notifyAdmin(type, account);
        } catch (err) {
          console.error('Reset email could not be sent:', err.message);
          queueForAdmin(type, account.key, ident);
        }
      }
    }

    // Same answer whether or not the account exists
    res.render('forgotEmailSent', { collegeName: COLLEGE_NAME, type: type });
  });

  function findValidToken(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
      .get(hashToken(token), new Date().toISOString());
  }

  function showReset(res, data) {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.render('resetPassword', Object.assign({ collegeName: COLLEGE_NAME, token: '', error: null, loginUrl: '/login' }, data));
  }

  app.get('/reset-password', (req, res) => {
    const token = String(req.query.token || '');
    const row = findValidToken(token);
    if (!row) return showReset(res, { state: 'invalid' });
    showReset(res, { state: 'form', token: token, loginUrl: row.account_type === 'teacher' ? '/teacher-login' : '/login' });
  });

  app.post('/reset-password', async (req, res) => {
    const token = String(req.body.token || '');
    const row = findValidToken(token);
    if (!row) return showReset(res, { state: 'invalid' });

    const loginUrl = row.account_type === 'teacher' ? '/teacher-login' : '/login';
    const newPassword = req.body.newPassword || '';
    const confirmPassword = req.body.confirmPassword || '';

    if (newPassword.length < 8) return showReset(res, { state: 'form', token: token, loginUrl: loginUrl, error: 'The new password must be at least 8 characters.' });
    if (newPassword !== confirmPassword) return showReset(res, { state: 'form', token: token, loginUrl: loginUrl, error: 'The two passwords do not match.' });

    const hashed = await bcrypt.hash(newPassword, 10);
    let changed;
    if (row.account_type === 'teacher') {
      changed = db.prepare('UPDATE teachers SET password = ?, must_change_password = 0 WHERE id = ?').run(hashed, row.account_key).changes;
    } else {
      changed = db.prepare('UPDATE students SET password = ?, must_change_password = 0 WHERE university_id = ?').run(hashed, row.account_key).changes;
    }
    if (!changed) return showReset(res, { state: 'invalid' });

    db.prepare('UPDATE password_resets SET used_at = ? WHERE account_type = ? AND account_key = ? AND used_at IS NULL')
      .run(new Date().toISOString(), row.account_type, row.account_key);
    try {
      db.prepare("UPDATE password_requests SET status = 'done', handled_at = CURRENT_TIMESTAMP WHERE account_type = ? AND account_key = ? AND status = 'open'")
        .run(row.account_type, row.account_key);
    } catch (err) { /* the admin queue table may not exist yet; nothing to close */ }

    showReset(res, { state: 'done', loginUrl: loginUrl });
  });
};