#!/usr/bin/env node
/* Extract every user-visible string from the survey data files into a
   source catalog (msgid list), grouped by domain. Used by:
   - translators: to know what must be translated
   - check.js:    to verify every locale covers every msgid            */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ASSETS = path.join(__dirname, '../../frontend/public/assets');

function load(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ASSETS, file), 'utf8'), ctx, { filename: file });
  return ctx.window;
}

function extract() {
  const w = Object.assign({}, load('survey-data.js'), load('survey-bank-1.js'), load('survey-data-2b.js'), load('survey-bank-2.js'));
  const S1 = w.STAGE_DATA, B1 = w.STAGE1_BANK, S2 = w.STAGE_DATA_2B, B2 = w.STAGE2_BANK;
  const out = {}; // domain -> Set
  const add = (dom, s) => { if (typeof s === 'string' && s.trim()) (out[dom] = out[dom] || new Set()).add(s); };

  // domains, subfields, subjects
  Object.values(S1.ui || {}).forEach((s) => add('stage1', s));
  Object.values(S1.areas).forEach((a) => { add('taxonomy', a.name); add('taxonomy', a.desc); });
  Object.values(S2.subfields).forEach((s) => add('taxonomy', s.name));
  Object.values(S2.config.subjectClusters || {}).forEach((s) => add('taxonomy', s));
  // careers (Stage 1 example lists + Stage 2 professions)
  Object.values(S1.careers).forEach((l) => l.forEach((c) => add('careers', c)));
  S2.careers.forEach((c) => { add('careers', c.career); add('careers', c.subfieldName); add('tasks', c.task); add('sources', c.blsProxy); add('sources', c.note); });
  Object.values(B2.partB.tasks2 || {}).forEach((s) => add('tasks', s));
  // stage 1 questions
  S1.questions.forEach((q) => { add('stage1', q.text); add('stage1', q.a); add('stage1', q.b); });
  (B1.stems || []).forEach((s) => add('stage1', s));
  Object.values(B1.statements || {}).forEach((l) => l.forEach((s) => add('stage1', s)));
  (B1.pairs || []).forEach((q) => { add('stage1', q.text); add('stage1', q.a); add('stage1', q.b); });
  // stage 2 questions
  Object.values(S2.ui || {}).forEach((s) => add('stage2', s));
  S2.partA.forEach((q) => { add('stage2', q.text); add('stage2', q.a); add('stage2', q.b); });
  S2.partB.forEach((q) => { add('stage2', q.text); }); // a/b are career task lines (in "tasks")
  (B2.partA.stems || []).forEach((s) => add('stage2', s));
  Object.values(B2.partA.phrases || {}).forEach((l) => l.forEach((s) => add('stage2', s)));
  (B2.partB.stems || []).forEach((s) => add('stage2', s));

  // a string belongs to the first domain that claims it
  const seen = new Set(), res = {};
  ['taxonomy', 'careers', 'tasks', 'sources', 'stage1', 'stage2'].forEach((d) => {
    res[d] = [...(out[d] || [])].filter((s) => !seen.has(s) && seen.add(s));
  });
  return res;
}
module.exports = { extract };
if (require.main === module) {
  const r = extract();
  let tot = 0, chars = 0;
  Object.entries(r).forEach(([d, l]) => { tot += l.length; const c = l.join('').length; chars += c; console.log(d.padEnd(10), l.length, 'strings', c, 'chars'); });
  console.log('TOTAL', tot, chars);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(r, null, 1));
}
