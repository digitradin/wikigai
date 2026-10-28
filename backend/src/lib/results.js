/* Survey results row of an account (v20261028b).
   Rows belong to the permanent account id (users.id) so the email can change without losing results.
   Older rows only had user_email (= email hash): they are found by email once and linked to the id. */
const db = require('./db');
const { hashEmail } = require('./crypto');

async function findResultsRow(user, cols = 'id, user_name, stage, results, created_at, updated_at') {
  let row = await db.getOne(`SELECT ${cols} FROM user_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [user.id]);
  if (!row && user.email) {
    row = await db.getOne(`SELECT ${cols} FROM user_results WHERE user_id IS NULL AND user_email = $1 ORDER BY created_at DESC LIMIT 1`, [hashEmail(user.email)]);
    if (row && row.id) await db.query('UPDATE user_results SET user_id = $1 WHERE id = $2', [user.id, row.id]);
  }
  return row;
}

module.exports = { findResultsRow };
