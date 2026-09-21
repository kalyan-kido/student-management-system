const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./db');
const parseUniversityId = require('./idParser');
const calculateGrade = require('./gradeHelper');

const app = express();
const PORT = 3000;
const COLLEGE_NAME = 'Avanthi Institute of Engineering & Technology';

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'change-this-to-something-random-later',
  resave: false,
  saveUninitialized: false
}));

// ---------- Landing page ----------
app.get('/', (req, res) => {
  res.render('landing', {
    collegeName: COLLEGE_NAME,
    currentYear: new Date().getFullYear()
  });
});

// ---------- Student login ----------
app.get('/login', (req, res) => {
  res.render('login', { collegeName: COLLEGE_NAME, error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const student = db.prepare('SELECT * FROM students WHERE email = ?').get(email);

  if (!student) {
    return res.render('login', {
      collegeName: COLLEGE_NAME,
      error: 'No account found with that email.'
    });
  }

  const passwordMatches = await bcrypt.compare(password, student.password);

  if (!passwordMatches) {
    return res.render('login', {
      collegeName: COLLEGE_NAME,
      error: 'Incorrect password.'
    });
  }

  req.session.student = {
    universityId: student.university_id,
    name: student.name,
    role: student.role,
    sectionId: student.section_id
  };

  res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
  if (!req.session.student) {
    return res.redirect('/login');
  }

  const student = db.prepare(`
    SELECT students.*, branches.name AS branch_name, 
           sections.section_name, sections.year AS section_year
    FROM students
    LEFT JOIN branches ON students.branch_code = branches.code
    LEFT JOIN sections ON students.section_id = sections.id
    WHERE students.university_id = ?
  `).get(req.session.student.universityId);

  const marks = db.prepare(`
    SELECT subjects.name AS subject_name, marks.semester, marks.score, marks.max_score, marks.grade
    FROM marks
    JOIN subjects ON marks.subject_id = subjects.id
    WHERE marks.student_id = ?
    ORDER BY marks.semester
  `).all(req.session.student.universityId);

  res.render('dashboard', {
    collegeName: COLLEGE_NAME,
    student: student,
    marks: marks
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// ---------- Timetable ----------
app.get('/timetable', (req, res) => {
  if (!req.session.student) return res.redirect('/login');

  const timetable = db.prepare(`
    SELECT timetable.*, subjects.name AS subject_name, subjects.id AS subject_id, teachers.name AS teacher_name
    FROM timetable
    JOIN subjects ON timetable.subject_id = subjects.id
    JOIN teachers ON timetable.teacher_id = teachers.id
    WHERE timetable.section_id = ?
  `).all(req.session.student.sectionId || 1);

  res.render('timetable', {
    collegeName: COLLEGE_NAME,
    timetable: timetable
  });
});

app.get('/api/subject/:id/syllabus', (req, res) => {
  const syllabus = db.prepare('SELECT * FROM syllabus WHERE subject_id = ?').all(req.params.id);
  res.json(syllabus);
});

// ---------- Teacher login ----------
app.get('/teacher-login', (req, res) => {
  res.render('teacherLogin', { collegeName: COLLEGE_NAME, error: null });
});

app.post('/teacher-login', async (req, res) => {
  const { email, password } = req.body;

  const teacher = db.prepare('SELECT * FROM teachers WHERE email = ?').get(email);

  if (!teacher) {
    return res.render('teacherLogin', {
      collegeName: COLLEGE_NAME,
      error: 'No staff account found with that email.'
    });
  }

  const passwordMatches = await bcrypt.compare(password, teacher.password);

  if (!passwordMatches) {
    return res.render('teacherLogin', {
      collegeName: COLLEGE_NAME,
      error: 'Incorrect password.'
    });
  }

  req.session.teacher = {
    id: teacher.id,
    name: teacher.name,
    role: teacher.role
  };

  if (teacher.role === 'admin_head') {
    return res.redirect('/admin-dashboard');
  }

  res.redirect('/teacher-dashboard');
});

app.get('/teacher-dashboard', (req, res) => {
  if (!req.session.teacher) {
    return res.redirect('/teacher-login');
  }

  const assignments = db.prepare(`
    SELECT sections.section_name, sections.year, branches.name AS branch_name,
           subjects.name AS subject_name, section_subjects.section_id, section_subjects.subject_id
    FROM section_subjects
    JOIN sections ON section_subjects.section_id = sections.id
    JOIN branches ON sections.branch_code = branches.code
    JOIN subjects ON section_subjects.subject_id = subjects.id
    WHERE section_subjects.teacher_id = ?
  `).all(req.session.teacher.id);

  res.render('teacherDashboard', {
    collegeName: COLLEGE_NAME,
    teacher: req.session.teacher,
    assignments: assignments
  });
});

app.get('/teacher-logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Marks ----------
app.get('/teacher/marks/:sectionId/:subjectId', (req, res) => {
  if (!req.session.teacher) return res.redirect('/teacher-login');

  const { sectionId, subjectId } = req.params;
  const teacherId = req.session.teacher.id;

  const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId);
  const isAssigned = db.prepare('SELECT * FROM section_subjects WHERE section_id=? AND subject_id=? AND teacher_id=?').get(sectionId, subjectId, teacherId);
  const isInchargeHere = section && section.incharge_id === teacherId;

  if (!isAssigned && !isInchargeHere) {
    return res.status(403).send('<h1>Not authorized for this class.</h1><a href="/teacher-dashboard">Back</a>');
  }

  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
  const students = db.prepare('SELECT university_id, name FROM students WHERE section_id = ?').all(sectionId);
  const existingMarks = db.prepare('SELECT student_id, score, max_score FROM marks WHERE subject_id = ? AND semester = ?').all(subjectId, 1);

  const marksMap = {};
  existingMarks.forEach(m => marksMap[m.student_id] = m);

  res.render('teacherMarks', {
    collegeName: COLLEGE_NAME,
    section, subject, students, marksMap, sectionId, subjectId
  });
});

app.post('/teacher/marks/:sectionId/:subjectId', (req, res) => {
  if (!req.session.teacher) return res.redirect('/teacher-login');

  const { sectionId, subjectId } = req.params;
  const teacherId = req.session.teacher.id;
  const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId);
  const isAssigned = db.prepare('SELECT * FROM section_subjects WHERE section_id=? AND subject_id=? AND teacher_id=?').get(sectionId, subjectId, teacherId);
  const isInchargeHere = section && section.incharge_id === teacherId;

  if (!isAssigned && !isInchargeHere) {
    return res.status(403).send('Not authorized.');
  }

  const body = req.body;

  Object.keys(body).forEach(key => {
    if (!key.endsWith('_score')) return;
    const studentId = key.replace('_score', '');
    const score = body[key];
    const maxScore = body[studentId + '_max'] || 100;

    if (score === '') return;

    const grade = calculateGrade(parseFloat(score), parseFloat(maxScore));

    const existing = db.prepare('SELECT id FROM marks WHERE student_id=? AND subject_id=? AND semester=?').get(studentId, subjectId, 1);

    if (existing) {
      db.prepare('UPDATE marks SET score=?, max_score=?, grade=?, updated_by=? WHERE id=?').run(score, maxScore, grade, teacherId, existing.id);
    } else {
      db.prepare('INSERT INTO marks (student_id, subject_id, semester, score, max_score, grade, updated_by) VALUES (?,?,?,?,?,?,?)').run(studentId, subjectId, 1, score, maxScore, grade, teacherId);
    }
  });

  res.redirect(`/teacher/marks/${sectionId}/${subjectId}`);
});

// ---------- Admin ----------
function requireAdmin(req, res, next) {
  if (!req.session.teacher || req.session.teacher.role !== 'admin_head') {
    return res.redirect('/teacher-login');
  }
  next();
}

app.get('/admin-dashboard', requireAdmin, (req, res) => {
  const unassignedStudents = db.prepare(`
    SELECT university_id, name, email
    FROM students
    WHERE section_id IS NULL
  `).all();

  const sections = db.prepare(`
    SELECT sections.id, sections.section_name, sections.year, sections.incharge_id,
           branches.name AS branch_name
    FROM sections
    JOIN branches ON sections.branch_code = branches.code
  `).all();

  const teachers = db.prepare(`
    SELECT id, name, role FROM teachers WHERE role != 'admin_head'
  `).all();

  const subjects = db.prepare(`
    SELECT id, name, branch_code, year FROM subjects
  `).all();

  const currentAssignments = db.prepare(`
    SELECT section_subjects.id, sections.section_name, sections.year,
           subjects.name AS subject_name, teachers.name AS teacher_name
    FROM section_subjects
    JOIN sections ON section_subjects.section_id = sections.id
    JOIN subjects ON section_subjects.subject_id = subjects.id
    JOIN teachers ON section_subjects.teacher_id = teachers.id
  `).all();

  res.render('adminDashboard', {
    collegeName: COLLEGE_NAME,
    admin: req.session.teacher,
    unassignedStudents,
    sections,
    teachers,
    subjects,
    currentAssignments
  });
});

app.post('/admin/assign-section', requireAdmin, (req, res) => {
  const { universityId, sectionId } = req.body;
  db.prepare('UPDATE students SET section_id = ? WHERE university_id = ?')
    .run(sectionId, universityId);
  res.redirect('/admin-dashboard');
});

app.post('/admin/assign-teacher-subject', requireAdmin, (req, res) => {
  const { sectionId, subjectId, teacherId } = req.body;
  db.prepare(`
    INSERT INTO section_subjects (section_id, subject_id, teacher_id)
    VALUES (?, ?, ?)
  `).run(sectionId, subjectId, teacherId);
  res.redirect('/admin-dashboard');
});

app.post('/admin/set-incharge', requireAdmin, (req, res) => {
  const { sectionId, teacherId } = req.body;
  db.prepare('UPDATE sections SET incharge_id = ? WHERE id = ?')
    .run(teacherId, sectionId);
  res.redirect('/admin-dashboard');
});

// ---------- Achievements (teacher side) ----------
app.get('/teacher/achievements', (req, res) => {
  if (!req.session.teacher) return res.redirect('/teacher-login');

  const students = db.prepare(`
    SELECT university_id, name FROM students ORDER BY name
  `).all();

  const achievements = db.prepare(`
    SELECT achievements.*, students.name AS student_name
    FROM achievements
    JOIN students ON achievements.student_id = students.university_id
    ORDER BY achievements.date_achieved DESC
  `).all();

  res.render('teacherAchievements', {
    collegeName: COLLEGE_NAME,
    teacher: req.session.teacher,
    students,
    achievements
  });
});

app.post('/teacher/achievements/add', (req, res) => {
  if (!req.session.teacher) return res.redirect('/teacher-login');

  const { studentId, title, description, dateAchieved } = req.body;

  db.prepare(`
    INSERT INTO achievements (student_id, title, description, date_achieved)
    VALUES (?, ?, ?, ?)
  `).run(studentId, title, description, dateAchieved);

  res.redirect('/teacher/achievements');
});

app.post('/teacher/achievements/delete/:id', (req, res) => {
  if (!req.session.teacher) return res.redirect('/teacher-login');

  db.prepare('DELETE FROM achievements WHERE id = ?').run(req.params.id);

  res.redirect('/teacher/achievements');
});

// ---------- Achievements (student side) ----------
app.get('/achievements', (req, res) => {
  if (!req.session.student) return res.redirect('/login');

  console.log('DEBUG session:', req.session.student);

  const achievements = db.prepare(`
    SELECT * FROM achievements WHERE student_id = ? ORDER BY date_achieved DESC
  `).all(req.session.student.universityId);

  console.log('DEBUG achievements found:', achievements);

  res.render('achievements', {
    collegeName: COLLEGE_NAME,
    student: req.session.student,
    achievements
  });
});

// ---------- Fees (placeholder) ----------
app.get('/fees', (req, res) => {
  if (!req.session.student) return res.redirect('/login');
  res.send('<h1>Fees</h1><p>Coming soon.</p><a href="/dashboard">Back to dashboard</a>');
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});



