/**
 * Quick cue validation: Tests 1, 2, 4 only (skips exhaustive Test 3).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const problems = JSON.parse(readFileSync(join(__dirname, '../src/data/problems.json'), 'utf-8'));

// ── Inline validation logic ──
function stem(word) {
  let w = word.toLowerCase().trim();
  const suffixes = ['ing','tion','sion','ment','ness','ous','ive','ful','less','ly','ed','er','est','es','s'];
  for (const suffix of suffixes) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) { w = w.slice(0, -suffix.length); break; }
  }
  return w;
}
function normalize(str) { return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); }
function tokenize(str) { return normalize(str).split(' ').map(stem).filter(Boolean); }
const STOPWORDS = new Set(['the','and','for','with','from','that','this','what','when','where','which','find','solve','compute','apply','use','given','determine','calculate','show','let','suppose','assume','consider','are','was','been','being','have','has','had','does','did','will','would','could','should','may','might','must','shall','not','but','yet','also','just','than','then','now','how']);
function meaningfulTokens(str) { return tokenize(str).filter(t => t.length >= 4 && !STOPWORDS.has(t)); }
function isMathNotation(str) { return /[\\^{}']|^[a-z]{1,3}$|^d\/d[a-z]$/i.test(str.trim()); }
function normalizeMath(str) { return str.toLowerCase().replace(/\s+/g, '').trim(); }
const GENERIC_CUE_PHRASES = new Set(['rate of change','maximum value','minimum value','increasing function','decreasing function','concave up','concave down','integral','derivative','antiderivative','differentiate','integrate','continuous function','area under']);

function buildGenericCueWords(allProblems, minConcepts = 3) {
  const wordToConcepts = new Map();
  for (const p of allProblems) {
    const cues = [...(p.cue_tokens || []), ...(p.cue_aliases || [])];
    for (const cue of cues) {
      const tokens = new Set(meaningfulTokens(cue));
      for (const t of tokens) {
        if (!wordToConcepts.has(t)) wordToConcepts.set(t, new Set());
        wordToConcepts.get(t).add(p.concept);
      }
    }
  }
  return new Set([...wordToConcepts.entries()].filter(([, s]) => s.size >= minConcepts).map(([w]) => w));
}

function isGenericCue(cue, genericWords) {
  const n = normalize(cue);
  if (GENERIC_CUE_PHRASES.has(n)) return true;
  const tokens = meaningfulTokens(cue);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return genericWords.has(tokens[0]);
  return tokens.every(t => genericWords.has(t));
}

function cueMatches(studentCue, validCues, genericWords) {
  const normalizedStudent = normalize(studentCue);
  const studentTokens = meaningfulTokens(studentCue);
  const studentMath = normalizeMath(studentCue);
  let firstGenericMatch = null;
  for (const validCue of validCues) {
    const normalizedValid = normalize(validCue);
    if (normalizedStudent === normalizedValid) {
      if (!isGenericCue(validCue, genericWords)) return { matched: true, validCue };
      if (!firstGenericMatch) firstGenericMatch = validCue;
      continue;
    }
    const validTokens = meaningfulTokens(validCue);
    if (validTokens.length === 0 && isMathNotation(validCue)) {
      if (studentMath === normalizeMath(validCue)) {
        if (!isGenericCue(validCue, genericWords)) return { matched: true, validCue };
        if (!firstGenericMatch) firstGenericMatch = validCue;
      }
      continue;
    }
    if (studentTokens.length === 0 || validTokens.length === 0) continue;
    let tokenMatch = false;
    if (validTokens.length === 1) tokenMatch = studentTokens.includes(validTokens[0]);
    else { const overlap = studentTokens.filter(t => validTokens.includes(t)); tokenMatch = overlap.length >= 2; }
    if (tokenMatch) {
      if (!isGenericCue(validCue, genericWords)) return { matched: true, validCue };
      if (!firstGenericMatch) firstGenericMatch = validCue;
    }
  }
  if (firstGenericMatch) return { matched: true, validCue: firstGenericMatch };
  return { matched: false, validCue: null };
}

function validateCues(studentCues, problem, allProblems = []) {
  if (!studentCues || studentCues.length !== 2) return { valid: false, matchCount: 0 };
  const nonEmpty = studentCues.filter(c => c.trim().length > 0);
  if (nonEmpty.length < 2) return { valid: false, matchCount: 0 };
  const unique = new Set(nonEmpty.map(c => isMathNotation(c) ? normalizeMath(c) : normalize(c)));
  if (unique.size !== 2) return { valid: false, matchCount: 0 };
  const genericWords = buildGenericCueWords(allProblems, 3);
  const validCues = [...(problem.cue_tokens || []), ...(problem.cue_aliases || [])];
  const hasNonGenericValidCue = validCues.some(vc => !isGenericCue(vc, genericWords));
  let matchCount = 0, nonGenericMatchCount = 0;
  for (const cue of nonEmpty) {
    const result = cueMatches(cue, validCues, genericWords);
    if (result.matched) {
      matchCount++;
      if (!isGenericCue(cue, genericWords) && !isGenericCue(result.validCue, genericWords)) nonGenericMatchCount++;
    }
  }
  const needsNonGeneric = hasNonGenericValidCue;
  if (matchCount >= 1 && (!needsNonGeneric || nonGenericMatchCount >= 1)) return { valid: true, matchCount };
  if (matchCount >= 1 && nonGenericMatchCount === 0) return { valid: false, matchCount };
  return { valid: false, matchCount: 0 };
}

// ── TEST 1: Garbage ──
console.log('═══ TEST 1: Garbage Cue Rejection ═══\n');
const garbageInputs = [
  ['find the derivative', 'solve for x'],
  ['the', 'and'],
  ['calculate the answer', 'use the formula'],
  ['maximize', 'minimize'],
  ['plug in values', 'take the limit'],
];
let totalGarbagePasses = 0;
for (const garbage of garbageInputs) {
  let passCount = 0; const passedIds = [];
  for (const p of problems) { if (validateCues(garbage, p, problems).valid) { passCount++; passedIds.push(p.id); } }
  console.log(`"${garbage.join('", "')}" passed ${passCount}/${problems.length}${passCount > 0 ? ` [${passedIds.slice(0, 5).join(', ')}]` : ''}`);
  totalGarbagePasses += passCount;
}
const garbageRate = totalGarbagePasses / (garbageInputs.length * problems.length);
console.log(`\nTotal garbage passes: ${totalGarbagePasses}/${garbageInputs.length * problems.length} (${(garbageRate * 100).toFixed(1)}%)`);
console.log(garbageRate < 0.05 ? 'GARBAGE TEST: PASS' : 'GARBAGE TEST: FAIL');

// ── TEST 2: Adversarial ──
console.log('\n═══ TEST 2: Named Adversarial Generic Pairs ═══\n');
const adversarialPairs = [
  ['rate of change', 'maximum value'],
  ['integral', 'derivative'],
  ['increasing function', 'concave up'],
  ['volume', 'velocity'],
];
let adversarialAllPass = true;
for (const pair of adversarialPairs) {
  let passCount = 0; const passedIds = [];
  for (const p of problems) { if (validateCues(pair, p, problems).valid) { passCount++; passedIds.push(p.id); } }
  const pairRate = passCount / problems.length;
  if (pairRate > 0.10) adversarialAllPass = false;
  console.log(`"${pair.join('", "')}" passed ${passCount}/${problems.length} (${(pairRate * 100).toFixed(1)}%) ${pairRate <= 0.10 ? 'PASS' : 'FAIL'}${passCount > 0 ? `\n  IDs: ${passedIds.slice(0, 10).join(', ')}` : ''}`);
}
console.log(adversarialAllPass ? '\nNAMED ADVERSARIAL TEST: PASS' : '\nNAMED ADVERSARIAL TEST: FAIL');

// ── TEST 4: Legitimate ──
console.log('\n═══ TEST 4: Legitimate Cue Acceptance ═══\n');
let legitimateFailures = 0; const failedProblems = [];
for (const p of problems) {
  const allValid = [...(p.cue_tokens || []), ...(p.cue_aliases || [])];
  if (allValid.length < 2) continue;
  let anyPairPassed = false;
  for (let i = 0; i < allValid.length && !anyPairPassed; i++) {
    for (let j = i + 1; j < allValid.length && !anyPairPassed; j++) {
      if (validateCues([allValid[i], allValid[j]], p, problems).valid) anyPairPassed = true;
    }
  }
  if (!anyPairPassed) { legitimateFailures++; failedProblems.push(p.id); }
}
console.log(`Legitimate cue failures: ${legitimateFailures}/${problems.length}`);
if (failedProblems.length > 0) console.log(`Failed IDs: ${failedProblems.join(', ')}`);
console.log(legitimateFailures === 0 ? 'LEGITIMATE TEST: PASS' : 'LEGITIMATE TEST: FAIL');

// ── SUMMARY ──
const pass = garbageRate < 0.05 && adversarialAllPass && legitimateFailures === 0;
console.log(`\n═══ OVERALL (Tests 1, 2, 4): ${pass ? 'ALL PASS' : 'FAIL'} ═══`);
console.log('(Test 3 exhaustive skipped by request)');
process.exit(pass ? 0 : 1);
