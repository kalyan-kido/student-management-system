// Read-only admin overview page at /admin-home.
// Connected in server.js with:
//   require('./adminHome')(app, { db, COLLEGE_NAME, requireAdmin: (req, res, next) => requireAdmin(req, res, next), parseId: require('./idParser') });
module.exports = function (app, deps) {
  const { db, COLLEGE_NAME, requireAdmin, parseId } = deps;

  app.get('/admin-home', requireAdmin, (req, res) => {
    const one = (sql) => db.prepare(sql).get();

    const counts = {
      students: one('SELECT COUNT(*) AS c FROM students').c,
      teachers: one("SELECT COUNT(*) AS c FROM teachers WHERE role != 'admin_head'").c,
      branches: one('SELECT COUNT(*) AS c FROM branches').c,
      sections: one('SELECT COUNT(*) AS c FROM sections').c,
      sectionsInUse: one('SELECT COUNT(DISTINCT section_id) AS c FROM students WHERE section_id IS NOT NULL').c
    };

    const students = db.prepare(`
      SELECT s.university_id, s.name, s.branch_code, s.student_phone, s.parent_phone,
             sec.year AS section_year, sec.section_name
      FROM students s
      LEFT JOIN sections sec ON s.section_id = sec.id
    `).all();

    const branchNames = {};
    db.prepare('SELECT code, name FROM branches').all().forEach(b => { branchNames[b.code] = b.name; });

    const strength = {};
    const yearMismatch = [];
    const noPhone = [];

    students.forEach(s => {
      const bname = branchNames[s.branch_code] || 'No branch set';
      if (!strength[bname]) strength[bname] = { 1: 0, 2: 0, 3: 0, 4: 0, other: 0, total: 0 };

      let info = null;
      try { info = parseId(s.university_id); } catch (e) { info = null; }
      const y = info && info.studyYear ? info.studyYear : null;

      strength[bname][y || 'other']++;
      strength[bname].total++;

      if (y && s.section_year && y !== s.section_year) {
        yearMismatch.push({ id: s.university_id, name: s.name, calculated: y, assigned: s.section_year, section: s.section_name });
      }
      if (!s.student_phone && !s.parent_phone) {
        noPhone.push({ id: s.university_id, name: s.name });
      }
    });

    const waiting = one('SELECT COUNT(*) AS c FROM students WHERE section_id IS NULL').c;

    const noIncharge = db.prepare(`
      SELECT b.name AS branch_name, sec.year, sec.section_name, COUNT(s.university_id) AS student_count
      FROM sections sec
      JOIN branches b ON sec.branch_code = b.code
      JOIN students s ON s.section_id = sec.id
      WHERE sec.incharge_id IS NULL
      GROUP BY sec.id
      ORDER BY b.name, sec.year, sec.section_name
    `).all();

    const noTeacher = db.prepare(`
      SELECT name, year, semester FROM subjects
      WHERE id NOT IN (SELECT subject_id FROM section_subjects)
      ORDER BY year, semester, name
    `).all();

    const noRollCode = db.prepare(
      "SELECT code, name FROM branches WHERE roll_code IS NULL OR roll_code = ''"
    ).all();

    res.render('adminHome', {
      collegeName: COLLEGE_NAME,
      admin: req.session.teacher,
      counts: counts,
      strength: strength,
      waiting: waiting,
      noIncharge: noIncharge,
      noTeacher: noTeacher,
      yearMismatch: yearMismatch,
      noRollCode: noRollCode,
      noPhone: noPhone
    });
  });
};