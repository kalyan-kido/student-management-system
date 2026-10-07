const db = require('./db');

const branches = [
  { code: 'ECE', name: 'Electronics and Communication Engineering' },
  { code: 'EEE', name: 'Electrical and Electronics Engineering' },
  { code: 'MECH', name: 'Mechanical Engineering' },
  { code: 'CIVIL', name: 'Civil Engineering' },
  { code: 'CSE-CS', name: 'Computer Science and Engineering (Cyber Security)' },
  { code: 'CSD', name: 'Computer Science and Design' },
  { code: 'CSM', name: 'Computer Science and Machine Learning' },
  { code: 'IT', name: 'Information Technology' }
];

const insert = db.prepare('INSERT OR IGNORE INTO branches (code, name) VALUES (?, ?)');

branches.forEach(b => {
  insert.run(b.code, b.name);
  console.log(`Added: ${b.code} — ${b.name}`);
});

console.log('Done seeding branches.');
