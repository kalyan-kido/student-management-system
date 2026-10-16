const db = require('./db');

const sectionNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const years = [1, 2, 3, 4];

const branches = db.prepare('SELECT code FROM branches').all();
const exists = db.prepare(
  'SELECT id FROM sections WHERE branch_code = ? AND year = ? AND section_name = ?'
);
const insert = db.prepare(
  'INSERT INTO sections (branch_code, year, section_name) VALUES (?, ?, ?)'
);

let added = 0;
const run = db.transaction(() => {
  for (const b of branches) {
    for (const y of years) {
      for (const s of sectionNames) {
        if (!exists.get(b.code, y, s)) {
          insert.run(b.code, y, s);
          added++;
        }
      }
    }
  }
});
run();

console.log(`Branches found: ${branches.length}. New sections added: ${added}.`);
