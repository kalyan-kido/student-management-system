// Forgot password, change password and admin resets.
// Connected in server.js with:
//   require('./passwordRoutes')(app, { db, bcrypt, COLLEGE_NAME, requireAdmin: (req, res, next) => requireAdmin(req, res, next) });
const nodeCrypto = require('crypto');

module.exports = function (app, deps) {
  const { db, bcrypt, COLLEGE_NAME, requireAdmin } = deps;

  // Password reset support (requests table + forced-change flag)
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT NOT NULL,
      account_key TEXT NOT NULL,
      identifier TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      handled_at TEXT
    );
  `);
  for (const table of ['students', 'teachers']) {
    const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
    if (!cols.some(c => c.name === 'must_change_password')) {
      db.exec('ALTER TABLE ' + table + ' ADD COLUMN must_change_password INTEGER DEFAULT 0');
    }
  }

  // ---------- Password safety: forced change + pending reset count ----------
  app.use((req, res, next) => {
    const allowed = ['/change-password', '/logout', '/teacher-logout', '/login', '/teacher-login'];
    if (req.session && req.session.mustChange && !allowed.includes(req.path)) {
      return res.redirect('/change-password');
    }
    res.locals.pendingResets = 0;
    if (req.session && req.session.teacher && req.session.teacher.role === 'admin_head') {
      res.locals.pendingResets = db.prepare("SELECT COUNT(*) AS c FROM password_requests WHERE status = 'open'").get().c;
    }
    next();
  });

  // ---------- Forgot password, change password, admin resets ----------
  function makeTempPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 10; i++) out += chars[nodeCrypto.randomInt(chars.length)];
    return out;
  }

  async function resetAccountPassword(type, key) {
    const temp = makeTempPassword();
    const hashed = await bcrypt.hash(temp, 10);
    let changed;
    if (type === 'teacher') {
      changed = db.prepare('UPDATE teachers SET password = ?, must_change_password = 1 WHERE id = ?').run(hashed, key).changes;
    } else {
      changed = db.prepare('UPDATE students SET password = ?, must_change_password = 1 WHERE university_id = ?').run(hashed, key).changes;
    }
    return changed ? temp : null;
  }

  function listOpenRequests() {
    const rows = db.prepare("SELECT * FROM password_requests WHERE status = 'open' ORDER BY id").all();
    return rows.map(r => {
      let name = '';
      let account = r.identifier || '';
      if (r.account_type === 'student') {
        const s = db.prepare('SELECT name, email FROM students WHERE university_id = ?').get(r.account_key);
        if (s) { name = s.name; account = r.account_key + ' / ' + s.email; }
      } else {
        const t = db.prepare('SELECT name, email FROM teachers WHERE id = ?').get(r.account_key);
        if (t) { name = t.name; account = t.email; }
      }
      return { id: r.id, type: r.account_type, name: name, account: account, created: r.created_at };
    });
  }

  function renderResetPage(req, res, result, error) {
    res.set('Cache-Control', 'no-store');
    res.render('adminPasswordRequests', {
      collegeName: COLLEGE_NAME,
      admin: req.session.teacher,
      requests: listOpenRequests(),
      result: result,
      error: error
    });
  }

  app.get('/forgot-password', (req, res) => {
    const type = req.query.type === 'teacher' ? 'teacher' : 'student';
    res.render('forgotPassword', { collegeName: COLLEGE_NAME, type: type, sent: false, error: null });
  });

  app.post('/forgot-password', (req, res) => {
    const type = req.body.type === 'teacher' ? 'teacher' : 'student';
    const ident = String(req.body.identifier || '').trim();

    if (!ident) {
      return res.render('forgotPassword', { collegeName: COLLEGE_NAME, type: type, sent: false, error: 'Please enter your email.' });
    }

    let key = null;
    if (type === 'student') {
      const s = db.prepare('SELECT university_id FROM students WHERE lower(email) = lower(?) OR upper(university_id) = upper(?)').get(ident, ident);
      if (s) key = s.university_id;
    } else {
      const t = db.prepare('SELECT id FROM teachers WHERE lower(email) = lower(?)').get(ident);
      if (t) key = String(t.id);
    }

    if (key) {
      const open = db.prepare("SELECT id FROM password_requests WHERE account_type = ? AND account_key = ? AND status = 'open'").get(type, key);
      if (!open) {
        db.prepare('INSERT INTO password_requests (account_type, account_key, identifier) VALUES (?, ?, ?)').run(type, key, ident);
      }
    }

    // Same answer whether or not the account exists
    res.render('forgotPassword', { collegeName: COLLEGE_NAME, type: type, sent: true, error: null });
  });

  app.get('/change-password', (req, res) => {
    if (!req.session.student && !req.session.teacher) return res.redirect('/');
    res.render('changePassword', { collegeName: COLLEGE_NAME, error: null, forced: !!req.session.mustChange });
  });

  app.post('/change-password', async (req, res) => {
    const forced = !!req.session.mustChange;
    const kind = req.session.mustChange || (req.session.teacher ? 'teacher' : (req.session.student ? 'student' : null));
    if (!kind) return res.redirect('/');

    const show = (error) => res.render('changePassword', { collegeName: COLLEGE_NAME, error: error, forced: forced });
    const currentPassword = req.body.currentPassword || '';
    const newPassword = req.body.newPassword || '';
    const confirmPassword = req.body.confirmPassword || '';

    let acct;
    if (kind === 'teacher') {
      acct = db.prepare('SELECT id, password FROM teachers WHERE id = ?').get(req.session.teacher ? req.session.teacher.id : -1);
    } else {
      acct = db.prepare('SELECT university_id, password FROM students WHERE university_id = ?').get(req.session.student ? req.session.student.universityId : '');
    }
    if (!acct) return res.redirect('/');

    if (!(await bcrypt.compare(currentPassword, acct.password))) return show('Your current password is not correct.');
    if (newPassword.length < 8) return show('The new password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return show('The two new passwords do not match.');
    if (newPassword === currentPassword) return show('Choose a password different from the current one.');

    const hashed = await bcrypt.hash(newPassword, 10);
    if (kind === 'teacher') {
      db.prepare('UPDATE teachers SET password = ?, must_change_password = 0 WHERE id = ?').run(hashed, acct.id);
    } else {
      db.prepare('UPDATE students SET password = ?, must_change_password = 0 WHERE university_id = ?').run(hashed, acct.university_id);
    }
    delete req.session.mustChange;

    if (kind === 'teacher') {
      return res.redirect(req.session.teacher.role === 'admin_head' ? '/admin-dashboard' : '/teacher-dashboard');
    }
    res.redirect('/dashboard');
  });

  app.get('/admin/password-requests', requireAdmin, (req, res) => {
    renderResetPage(req, res, null, null);
  });

  app.post('/admin/password-requests/direct', requireAdmin, async (req, res) => {
    const type = req.body.type === 'teacher' ? 'teacher' : 'student';
    const ident = String(req.body.identifier || '').trim();
    let key = null;
    let label = '';

    if (type === 'student') {
      const s = db.prepare('SELECT university_id, name FROM students WHERE lower(email) = lower(?) OR upper(university_id) = upper(?)').get(ident, ident);
      if (s) { key = s.university_id; label = s.name + ' (' + s.university_id + ')'; }
    } else {
      const t = db.prepare('SELECT id, name FROM teachers WHERE lower(email) = lower(?)').get(ident);
      if (t) { key = String(t.id); label = t.name; }
    }

    if (!key) return renderResetPage(req, res, null, 'No ' + type + ' account found for "' + ident + '".');
    const temp = await resetAccountPassword(type, key);
    if (!temp) return renderResetPage(req, res, null, 'Could not reset that account.');
    renderResetPage(req, res, { label: label, temp: temp }, null);
  });

  app.post('/admin/password-requests/:id/reset', requireAdmin, async (req, res) => {
    const row = db.prepare("SELECT * FROM password_requests WHERE id = ? AND status = 'open'").get(req.params.id);
    if (!row) return res.redirect('/admin/password-requests');

    let label = row.identifier || '';
    if (row.account_type === 'student') {
      const s = db.prepare('SELECT name FROM students WHERE university_id = ?').get(row.account_key);
      if (s) label = s.name + ' (' + row.account_key + ')';
    } else {
      const t = db.prepare('SELECT name FROM teachers WHERE id = ?').get(row.account_key);
      if (t) label = t.name;
    }

    const temp = await resetAccountPassword(row.account_type, row.account_key);
    if (!temp) return renderResetPage(req, res, null, 'That account no longer exists.');

    db.prepare("UPDATE password_requests SET status = 'done', handled_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
    renderResetPage(req, res, { label: label, temp: temp }, null);
  });

  app.post('/admin/password-requests/:id/dismiss', requireAdmin, (req, res) => {
    db.prepare("UPDATE password_requests SET status = 'dismissed', handled_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open'").run(req.params.id);
    res.redirect('/admin/password-requests');
  });

};