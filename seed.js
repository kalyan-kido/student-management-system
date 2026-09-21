const bcrypt = require('bcrypt');
const db = require('./db');
const parseUniversityId = require('./idParser');

async function seed() {
  // 1. Branch
  db.prepare(`INSERT OR IGNORE INTO branches (code, name) VALUES (?, ?)`)
    .run('05', 'Computer Science and Engineering');

  // 2. Teacher (who will also be the section incharge)
  const teacherPassword = await bcrypt.hash('teacher1234', 10);
  const teacherResult = db.prepare(`
    INSERT INTO teachers (name, email, password, role)
    VALUES (?, ?, ?, ?)
  `).run('Dr. Ramesh Kumar', 'ramesh@example.com', teacherPassword, 'incharge');
  const teacherId = teacherResult.lastInsertRowid;
    // Admin head account
  const adminPassword = await bcrypt.hash('admin1234', 10);
  db.prepare(`
    INSERT INTO teachers (name, email, password, role)
    VALUES (?, ?, ?, ?)
  `).run('Admin Head', 'admin@example.com', adminPassword, 'admin_head');

  // 3. Section
  const sectionResult = db.prepare(`
    INSERT INTO sections (branch_code, year, section_name, incharge_id)
    VALUES (?, ?, ?, ?)
  `).run('05', 2, 'A', teacherId);
  const sectionId = sectionResult.lastInsertRowid;

  // 4. Subject
  const subjectResult = db.prepare(`
    INSERT INTO subjects (name, branch_code, year)
    VALUES (?, ?, ?)
  `).run('Data Structures', '05', 2);
  const subjectId = subjectResult.lastInsertRowid;

  // 5. Link teacher to teach this subject in this section
  db.prepare(`
    INSERT INTO section_subjects (section_id, subject_id, teacher_id)
    VALUES (?, ?, ?)
  `).run(sectionId, subjectId, teacherId);

  // 6. Student, now linked to the section
  const parsed = parseUniversityId('23Q71A05I5');
  const studentPassword = await bcrypt.hash('test1234', 10);

  db.prepare(`
    INSERT INTO students
    (university_id, name, email, password, role, joining_year, college_code,
     admission_type, branch_code, roll_suffix, section_id, address, parent_phone, student_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parsed.universityId, 'Kalyan Teja', 'kalyan@example.com', studentPassword, 'student',
    parsed.joiningYear, parsed.collegeCode, parsed.admissionType, parsed.branchCode, parsed.rollSuffix,
    sectionId, 'Vizianagaram, Andhra Pradesh', '9876543210', '9123456780'
  );


    // Timetable — Mon-Fri, 4 periods, for our seeded section
  const periods = [
    { day: 'Monday', period: 1 },
    { day: 'Monday', period: 2 },
    { day: 'Tuesday', period: 1 },
    { day: 'Wednesday', period: 1 },
    { day: 'Thursday', period: 2 },
  ];

  const insertPeriod = db.prepare(`
    INSERT INTO timetable (section_id, day_of_week, period_number, subject_id, teacher_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  periods.forEach(p => {
    insertPeriod.run(sectionId, p.day, p.period, subjectId, teacherId);
  });

  // Syllabus topics for the seeded subject
  db.prepare(`INSERT INTO syllabus (subject_id, topic, is_covered) VALUES (?, ?, ?)`).run(subjectId, 'Arrays and Linked Lists', 1);
  db.prepare(`INSERT INTO syllabus (subject_id, topic, is_covered) VALUES (?, ?, ?)`).run(subjectId, 'Stacks and Queues', 1);
  db.prepare(`INSERT INTO syllabus (subject_id, topic, is_covered) VALUES (?, ?, ?)`).run(subjectId, 'Trees and Graphs', 0);
    db.prepare(`INSERT INTO syllabus (subject_id, topic, is_covered) VALUES (?, ?, ?)`).run(subjectId, 'Dynamic Programming', 0);

  console.log('Seed complete.');
  console.log('Student login: kalyan@example.com / test1234');
  console.log('Teacher login: ramesh@example.com / teacher1234');
}

seed();