const db = require('./db');

const cols = db.prepare('PRAGMA table_info(branches)').all();
if (!cols.some(c => c.name === 'roll_code')) {
  db.exec('ALTER TABLE branches ADD COLUMN roll_code TEXT');
}

const codes = { CIVIL: '01', EEE: '02', MECH: '03', ECE: '04', '05': '05', IT: '12' };
const update = db.prepare('UPDATE branches SET roll_code = ? WHERE code = ?');
for (const [code, rollCode] of Object.entries(codes)) {
  update.run(rollCode, code);
}

console.table(db.prepare('SELECT code, name, roll_code FROM branches').all());
