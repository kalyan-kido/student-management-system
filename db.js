const Database = require('better-sqlite3');
const db = new Database('school.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'teacher'
  );

  CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_code TEXT NOT NULL,
    year INTEGER NOT NULL,
    section_name TEXT NOT NULL,
    incharge_id INTEGER,
    FOREIGN KEY (branch_code) REFERENCES branches(code),
    FOREIGN KEY (incharge_id) REFERENCES teachers(id)
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    branch_code TEXT NOT NULL,
    year INTEGER NOT NULL,
    FOREIGN KEY (branch_code) REFERENCES branches(code)
  );

  CREATE TABLE IF NOT EXISTS section_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    teacher_id INTEGER NOT NULL,
    FOREIGN KEY (section_id) REFERENCES sections(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
  );

  CREATE TABLE IF NOT EXISTS students (
    university_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'student',
    joining_year INTEGER,
    college_code TEXT,
    admission_type TEXT,
    branch_code TEXT,
    roll_suffix TEXT,
    section_id INTEGER,
    address TEXT,
    parent_phone TEXT,
    student_phone TEXT,
    FOREIGN KEY (branch_code) REFERENCES branches(code),
    FOREIGN KEY (section_id) REFERENCES sections(id)
  );

  CREATE TABLE IF NOT EXISTS course_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    book_title TEXT NOT NULL,
    author TEXT,
    pdf_url TEXT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

    CREATE TABLE IF NOT EXISTS marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    subject_id INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    score REAL,
    max_score REAL DEFAULT 100,
    grade TEXT,
    updated_by INTEGER,
    FOREIGN KEY (student_id) REFERENCES students(university_id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (updated_by) REFERENCES teachers(id)
  );

  CREATE TABLE IF NOT EXISTS timetable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    day_of_week TEXT NOT NULL,
    period_number INTEGER NOT NULL,
    subject_id INTEGER,
    teacher_id INTEGER,
    FOREIGN KEY (section_id) REFERENCES sections(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
  );

  CREATE TABLE IF NOT EXISTS syllabus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    is_covered INTEGER DEFAULT 0,
    notes_pdf_url TEXT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    date_achieved TEXT,
    FOREIGN KEY (student_id) REFERENCES students(university_id)
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT,
    FOREIGN KEY (section_id) REFERENCES sections(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT,
    date_posted TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('Database and all tables ready.');

module.exports = db;