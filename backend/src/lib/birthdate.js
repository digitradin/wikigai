/* Optional birthday — validation + age helpers.
   Stored as a DATE in users.birth_date. Only the derived age (never the date) is used
   elsewhere, e.g. to adapt AI learning plans. */
'use strict';
const MIN_AGE = 8, MAX_AGE = 100;

function ageOn(date, now = new Date()) {
  const d = new Date(date);
  if (isNaN(d)) return null;
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a -= 1;
  return a;
}

/* '' / null / undefined → { ok: true, value: null } (field is optional)
   'YYYY-MM-DD' (a real date, age 8–100) → { ok: true, value: 'YYYY-MM-DD' } */
function parseBirthDate(input) {
  if (input == null || String(input).trim() === '') return { ok: true, value: null };
  const s = String(input).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return { ok: false };
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return { ok: false };
  const age = ageOn(d);
  if (age == null || age < MIN_AGE || age > MAX_AGE) return { ok: false };
  return { ok: true, value: s };
}

/* node-postgres returns a DATE as a JS Date at local midnight — read the local parts,
   not toISOString() (which would shift the day in time zones east of UTC). */
const pad = (n) => String(n).padStart(2, '0');
const toIso = (v) => {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return String(v).slice(0, 10);
};

module.exports = { parseBirthDate, ageOn, toIso, MIN_AGE, MAX_AGE };
