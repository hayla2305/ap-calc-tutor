/**
 * Cue validation test script.
 * Tests that garbage cues fail, generic pairs fail, and legitimate cues pass.
 * Uses dynamic generic word detection (threshold 3) and exhaustive candidate-word testing.
 * Run with: node scripts/validate-cues.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const problems = JSON.parse(readFileSync(join(__dirname, '../src/data/problems.json'), 'utf-8'));

// ═══ Inline validation logic (can't import JSX module directly in Node) ═══

function stem(word) {
  let w = word.toLowerCase().trim();
  const suffixes = ['ing', 'tion', 'sion', 'ment', 'ness', 'ous', 'ive', 'ful', 'less', 'ly', 'ed', 'er', 'est', 'es', 's'];
  for (const suffix of suffixes) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function tokenize(str) {
  return normalize(str).split(' ').map(stem).filter(Boolean);
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when',
  'where', 'which', 'find', 'solve', 'compute', 'apply', 'use', 'given',
  'determine', 'calculate', 'show', 'let', 'suppose', 'assume', 'consider',
  'are', 'was', 'been', 'being', 'have', 'has', 'had', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'not', 'but', 'yet', 'also', 'just', 'than', 'then', 'now', 'how',
]);

function meaningfulTokens(str) {
  return tokenize(str).filter(t => t.length >= 4 && !STOPWORDS.has(t));
}

function isMathNotation(str) {
  return /[\\^{}']|^[a-z]{1,3}$|^d\/d[a-z]$/i.test(str.trim());
}

function normalizeMath(str) {
  return str.toLowerCase().replace(/\s+/g, '').trim();
}

const GENERIC_CUE_PHRASES = new Set([
  'rate of change',
  'maximum value',
  'minimum value',
  'increasing function',
  'decreasing function',
  'concave up',
  'concave down',
  'integral',
  'derivative',
  'antiderivative',
  'differentiate',
  'integrate',
  'continuous function',
  'area under',
]);

const FALLBACK_GENERIC_CUE_WORDS = new Set([
  'rate', 'change', 'maximum', 'minimum', 'increasing', 'decreasing',
  'integral', 'derivative', 'antiderivative', 'differentiate', 'integrate',
  'slope', 'tangent', 'continuous', 'limit', 'function', 'interval',
]);

function buildGenericCueWords(allProblems, minConcepts = 3) {
  if (!allProblems || allProblems.length === 0) return FALLBACK_GENERIC_CUE_WORDS;

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

  return new Set(
    [...wordToConcepts.entries()]
      .filter(([, s]) => s.size >= minConcepts)
      .map(([w]) => w)
  );
}

function isGenericCue(cue, genericWords) {
  const n = normalize(cue);
  if (GENERIC_CUE_PHRASES.has(n)) return true;
  const tokens = meaningfulTokens(cue);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return genericWords.has(tokens[0]);
  // Multi-word: generic only if ALL meaningful tokens are generic
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

    if (studentTokens.length === 0) continue;
    if (validTokens.length === 0) continue;

    let tokenMatch = false;
    if (validTokens.length === 1) {
      tokenMatch = studentTokens.includes(validTokens[0]);
    } else {
      const overlap = studentTokens.filter(t => validTokens.includes(t));
      tokenMatch = overlap.length >= 2;
    }

    if (tokenMatch) {
      if (!isGenericCue(validCue, genericWords)) return { matched: true, validCue };
      if (!firstGenericMatch) firstGenericMatch = validCue;
    }
  }

  if (firstGenericMatch) return { matched: true, validCue: firstGenericMatch };
  return { matched: false, validCue: null };
}

function validateCues(studentCues, problem, allProblems = []) {
  if (!studentCues || studentCues.length !== 2) {
    return { valid: false, matchCount: 0, feedback: 'Need 2 cues.' };
  }
  const nonEmpty = studentCues.filter(c => c.trim().length > 0);
  if (nonEmpty.length < 2) {
    return { valid: false, matchCount: 0, feedback: 'Both must be non-empty.' };
  }
  const unique = new Set(nonEmpty.map(c =>
    isMathNotation(c) ? normalizeMath(c) : normalize(c)
  ));
  if (unique.size !== 2) {
    return { valid: false, matchCount: 0, feedback: 'Choose 2 different cues.' };
  }

  const genericWords = buildGenericCueWords(allProblems, 3);
  const validCues = [...(problem.cue_tokens || []), ...(problem.cue_aliases || [])];

  const hasNonGenericValidCue = validCues.some(vc => !isGenericCue(vc, genericWords));

  let matchCount = 0;
  let nonGenericMatchCount = 0;

  for (const cue of nonEmpty) {
    const result = cueMatches(cue, validCues, genericWords);
    if (result.matched) {
      matchCount++;
      if (!isGenericCue(cue, genericWords) && !isGenericCue(result.validCue, genericWords)) {
        nonGenericMatchCount++;
      }
    }
  }

  const needsNonGeneric = hasNonGenericValidCue;

  if (matchCount >= 1 && (!needsNonGeneric || nonGenericMatchCount >= 1)) {
    return { valid: true, matchCount, feedback: null };
  }

  if (matchCount >= 1 && nonGenericMatchCount === 0) {
    return { valid: false, matchCount, feedback: 'Too generic.' };
  }

  return { valid: false, matchCount: 0, feedback: 'No match.' };
}

// ═══ Build dynamic generic words and report ═══
const genericWords = buildGenericCueWords(problems, 3);
console.log(`═══ Generic Words Report (threshold=3) ═══`);
console.log(`Count: ${genericWords.size}`);
console.log(`Words: ${[...genericWords].sort().join(', ')}\n`);

// ═══ TEST 1: Garbage inputs ═══
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
  let passCount = 0;
  const passedIds = [];
  for (const p of problems) {
    const result = validateCues(garbage, p, problems);
    if (result.valid) {
      passCount++;
      passedIds.push(p.id);
    }
  }
  console.log(`"${garbage.join('", "')}" passed ${passCount}/${problems.length}${passCount > 0 ? ` [${passedIds.slice(0, 5).join(', ')}${passedIds.length > 5 ? '...' : ''}]` : ''}`);
  totalGarbagePasses += passCount;
}

const totalGarbageTests = garbageInputs.length * problems.length;
const garbageRate = totalGarbagePasses / totalGarbageTests;
console.log(`\nTotal garbage passes: ${totalGarbagePasses}/${totalGarbageTests} (${(garbageRate * 100).toFixed(1)}%)`);
console.log(garbageRate < 0.05 ? 'GARBAGE TEST: PASS' : 'GARBAGE TEST: FAIL — still too loose');

// ═══ TEST 2: Named adversarial generic pairs ═══
console.log('\n═══ TEST 2: Named Adversarial Generic Pairs ═══\n');

const adversarialPairs = [
  ['rate of change', 'maximum value'],
  ['integral', 'derivative'],
  ['increasing function', 'concave up'],
  ['volume', 'velocity'],
];

const perPairPassRates = [];
let adversarialAllPass = true;
for (const pair of adversarialPairs) {
  let passCount = 0;
  const passedIds = [];
  for (const p of problems) {
    const result = validateCues(pair, p, problems);
    if (result.valid) {
      passCount++;
      passedIds.push(p.id);
    }
  }
  const pairRate = passCount / problems.length;
  perPairPassRates.push(pairRate);
  const pairPass = pairRate <= 0.10;
  if (!pairPass) adversarialAllPass = false;
  console.log(`"${pair.join('", "')}" passed ${passCount}/${problems.length} (${(pairRate * 100).toFixed(1)}%) ${pairPass ? 'PASS' : 'FAIL'}`);
  if (passCount > 0) {
    console.log(`  IDs: ${passedIds.slice(0, 10).join(', ')}${passedIds.length > 10 ? '...' : ''}`);
  }
}
console.log(adversarialAllPass ? '\nNAMED ADVERSARIAL TEST: PASS' : '\nNAMED ADVERSARIAL TEST: FAIL — per-pair rate exceeds 10%');

// ═══ TEST 3: Exhaustive candidate-word pair test ═══
console.log('\n═══ TEST 3: Exhaustive Candidate-Word Pair Test ═══\n');

// Build candidate word list: any cue word appearing in >=2 concepts
function buildCandidateWords(allProblems, minConcepts = 2) {
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
  return new Set(
    [...wordToConcepts.entries()]
      .filter(([, s]) => s.size >= minConcepts)
      .map(([w]) => w)
  );
}

const candidateWords = buildCandidateWords(problems, 2);
console.log(`Candidate words (appearing in >=2 concepts): ${candidateWords.size}`);
console.log(`Words: ${[...candidateWords].sort().join(', ')}\n`);

const candidateList = [...candidateWords];
let worst = { pair: null, pass: 0 };
let overThreshold = 0;

for (let i = 0; i < candidateList.length; i++) {
  for (let j = i + 1; j < candidateList.length; j++) {
    const pair = [candidateList[i], candidateList[j]];
    let pass = 0;
    for (const p of problems) {
      if (validateCues(pair, p, problems).valid) pass++;
    }
    if (pass > worst.pass) worst = { pair, pass };
    if (pass / problems.length > 0.10) {
      overThreshold++;
      console.log(`  FAIL: ["${pair[0]}", "${pair[1]}"] passed ${pass}/${problems.length} (${(pass * 100 / problems.length).toFixed(1)}%)`);
    }
  }
}

console.log(`\nWorst candidate pair: ${worst.pair ? worst.pair.join(' + ') : 'none'} => ${worst.pass}/${problems.length} (${(worst.pass * 100 / problems.length).toFixed(1)}%)`);
console.log(overThreshold === 0 ? 'EXHAUSTIVE CANDIDATE TEST: PASS' : `EXHAUSTIVE CANDIDATE TEST: FAIL (${overThreshold} pairs >10%)`);

// ═══ TEST 4: Legitimate cues ═══
console.log('\n═══ TEST 4: Legitimate Cue Acceptance ═══\n');

let legitimateFailures = 0;
const failedProblems = [];
for (const p of problems) {
  const allValid = [...(p.cue_tokens || []), ...(p.cue_aliases || [])];
  if (allValid.length < 2) {
    console.warn(`${p.id} has < 2 valid cues — skipping`);
    continue;
  }

  // Try all distinct pairs of valid cues; pass if ANY pair validates.
  let anyPairPassed = false;
  for (let i = 0; i < allValid.length && !anyPairPassed; i++) {
    for (let j = i + 1; j < allValid.length && !anyPairPassed; j++) {
      const pair = [allValid[i], allValid[j]];
      const result = validateCues(pair, p, problems);
      if (result.valid) {
        anyPairPassed = true;
      }
    }
  }

  if (!anyPairPassed) {
    console.error(`LEGIT FAIL: ${p.id} — no valid cue pair accepted`);
    legitimateFailures++;
    failedProblems.push({ id: p.id, allValid, tokens: p.cue_tokens });
  }
}
console.log(`\nLegitimate cue failures: ${legitimateFailures}/${problems.length}`);
console.log(legitimateFailures === 0 ? 'LEGITIMATE TEST: PASS' : 'LEGITIMATE TEST: FAIL — matching too tight');

if (failedProblems.length > 0) {
  console.log('\nFailed problems detail:');
  for (const fp of failedProblems) {
    console.log(`  ${fp.id}: all valid cues: [${fp.allValid.join(', ')}]`);
    for (const c of fp.allValid) {
      console.log(`    "${c}" -> meaningful: [${meaningfulTokens(c).join(', ')}], generic: ${isGenericCue(c, genericWords)}`);
    }
  }
}

// ═══ SUMMARY ═══
console.log('\n═══ OVERALL RESULT ═══');
const pass =
  garbageRate < 0.05 &&
  perPairPassRates.every(r => r <= 0.10) &&
  overThreshold === 0 &&
  legitimateFailures === 0;
console.log(pass ? 'ALL TESTS PASSED' : 'TESTS FAILED — see details above');
process.exit(pass ? 0 : 1);
