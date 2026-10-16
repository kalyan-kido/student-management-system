const db = require('./db');
const parseId = require('./idParser');

const students = db.prepare('SELECT university_id FROM students WHERE joining_year IS NULL').all();
const findBranch = db.prepare('SELECT code FROM branches WHERE roll_code = ? OR code = ?');
const update = db.prepare(`
  UPDATE students
  SET joining_year = ?, college_code = ?, admission_type = ?, branch_code = ?, roll_suffix = ?
  WHERE university_id = ?
`);

let fixed = 0;
for (const s of students) {
  try {
    const info = parseId(s.university_id);
    const branch = findBranch.get(info.branchCode, info.branchCode);
    if (!branch || info.admissionType === 'Unknown') {
      console.log('Skipped ' + s.university_id + ' (unknown branch code or type)');
      continue;
    }
    update.run(info.joiningYear, info.collegeCode, info.admissionType, branch.code, info.rollSuffix, s.university_id);
    fixed++;
  } catch (err) {
    console.log('Skipped ' + s.university_id + ': ' + err.message);
  }
}
console.log('Students fixed: ' + fixed + ' of ' + students.length);
