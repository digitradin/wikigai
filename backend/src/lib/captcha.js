const crypto = require('crypto');

/**
 * Brand captcha — "select the 3 drink brands".
 *
 * Grid = 9 brands: exactly 3 real drink brands + 6 decoys (cars / sports).
 * Rendered as emoji tiles so it is self-contained (no external images).
 * The correct set is signed server-side into a captcha token so the client
 * can never tamper with which tiles are "drinks".
 */

// 3 drink brands per round (canonical drink pool)
const DRINKS = [
  { id: 'coca_cola', name: 'Coca-Cola', emoji: '🥤' },
  { id: 'pepsi', name: 'Pepsi', emoji: '🥤' },
  { id: 'fanta', name: 'Fanta', emoji: '🍊' },
  { id: 'sprite', name: 'Sprite', emoji: '🍋' },
  { id: 'red_bull', name: 'Red Bull', emoji: '🐂' },
  { id: 'monster', name: 'Monster', emoji: '👹' },
  { id: 'starbucks', name: 'Starbucks', emoji: '☕' },
  { id: 'nescafe', name: 'Nescafé', emoji: '☕' },
  { id: 'heineken', name: 'Heineken', emoji: '🍺' },
  { id: 'corona', name: 'Corona', emoji: '🍺' },
  { id: 'lipton', name: 'Lipton', emoji: '🍵' },
  { id: 'evian', name: 'Evian', emoji: '💧' },
  { id: 'tropicana', name: 'Tropicana', emoji: '🧃' },
  { id: 'gatorade', name: 'Gatorade', emoji: '🥤' },
  { id: 'innocent', name: 'Innocent', emoji: '🧃' },
];

// 6 decoys per round (cars + sports) — clearly NOT drinks
const CARS = [
  { id: 'toyota', name: 'Toyota', emoji: '🚗' },
  { id: 'bmw', name: 'BMW', emoji: '🚙' },
  { id: 'audi', name: 'Audi', emoji: '🚘' },
  { id: 'tesla', name: 'Tesla', emoji: '⚡' },
  { id: 'ferrari', name: 'Ferrari', emoji: '🏎️' },
  { id: 'ford', name: 'Ford', emoji: '🛻' },
  { id: 'mercedes', name: 'Mercedes', emoji: '🚗' },
  { id: 'honda', name: 'Honda', emoji: '🏍️' },
];

const SPORTS = [
  { id: 'nike', name: 'Nike', emoji: '👟' },
  { id: 'adidas', name: 'Adidas', emoji: '👟' },
  { id: 'puma', name: 'Puma', emoji: '🐆' },
  { id: 'reebok', name: 'Reebok', emoji: '👟' },
  { id: 'olympics', name: 'Olympics', emoji: '🏅' },
  { id: 'fifa', name: 'FIFA', emoji: '⚽' },
  { id: 'nba', name: 'NBA', emoji: '🏀' },
  { id: 'nfl', name: 'NFL', emoji: '🏈' },
];

function pick(arr, n) {
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = crypto.randomInt(0, copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build a fresh captcha challenge.
 * @returns {{tiles: Array, answer: string[]}}
 *   tiles: shuffled [{id,name,emoji}] (9 items)
 *   answer: the 3 drink brand ids (server-side truth, do not send to client)
 */
function buildChallenge() {
  const drinks = pick(DRINKS, 3);
  const decoyCars = pick(CARS, 3);
  const decoySports = pick(SPORTS, 3);
  const tiles = shuffle([...drinks, ...decoyCars, ...decoySports]);
  const answer = drinks.map(d => d.id);
  return { tiles, answer, prompt: 'Select the 3 drink brands' };
}

module.exports = { buildChallenge, DRINKS, CARS, SPORTS };
