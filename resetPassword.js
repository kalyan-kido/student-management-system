// Usage: node resetPassword.js student|teacher <email or university ID>
// Gives the account a temporary password and forces a change at next login.
const db = require('./db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const type = process.argv[2];
const ident = process.argv[3];
if (!['student', 'teacher'].includes(type) || !ident) {
  console.log('Usage: node resetPassword.js student|teacher <email or university ID>');
  process.exit(1);
}

const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
let temp = '';
for (let i = 0; i < 10; i++) temp += chars[crypto.randomInt(chars.length)];
const hashed = bcrypt.hashSync(temp, 10);

let changes = 0;
if (type === 'teacher') {
  changes = db.prepare('UPDATE teachers SET password = ?, must_change_password = 1 WHERE lower(email) = lower(?)').run(hashed, ident).changes;
} else {
  changes = db.prepare('UPDATE students SET password = ?, must_change_password = 1 WHERE lower(email) = lower(?) OR upper(university_id) = upper(?)').run(hashed, ident, ident).changes;
}

if (!changes) {
  console.log('No ' + type + ' account found for ' + ident);
  process.exit(1);
}
console.log('Temporary password for ' + ident + ': ' + temp);
console.log('They must choose a new password at their next login.');