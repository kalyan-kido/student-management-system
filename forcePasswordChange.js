// Makes anyone with a temporary password choose a new one before using the site.
// Connected in server.js right after passwordRoutes: require('./forcePasswordChange')(app, db);
module.exports = function (app, db) {
  const allowed = ['/change-password', '/logout', '/teacher-logout', '/login', '/teacher-login'];

  app.use((req, res, next) => {
    if (!req.session) return next();

    if (!req.session.mustChange) {
      if (req.session.teacher) {
        const t = db.prepare('SELECT must_change_password AS m FROM teachers WHERE id = ?').get(req.session.teacher.id);
        if (t && t.m) req.session.mustChange = 'teacher';
      }
      if (!req.session.mustChange && req.session.student) {
        const s = db.prepare('SELECT must_change_password AS m FROM students WHERE university_id = ?').get(req.session.student.universityId);
        if (s && s.m) req.session.mustChange = 'student';
      }
    }

    if (req.session.mustChange && !allowed.includes(req.path)) {
      return res.redirect('/change-password');
    }
    next();
  });
};