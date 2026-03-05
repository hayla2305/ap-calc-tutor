import { readFileSync, writeFileSync } from 'fs';

const draft = JSON.parse(readFileSync('generated_problems_draft.json', 'utf8'));

// ── Fix 1: sq_008 [P0] ──
// Codex says: BC-only sequence → function-based sin(x)/x at infinity
// BUT sq_006 already has sin(x)/x stem! → Use cos(x)/x² variant to avoid duplicate
const sq008 = draft.find(p => p.id === 'sq_008');
if (!sq008) throw new Error('sq_008 not found');

sq008.stem = "Evaluate $\\displaystyle\\lim_{x \\to \\infty} \\frac{\\cos x}{x^2}$.";
sq008.cue_tokens = [
  "bounded oscillating numerator",
  "growing polynomial denominator"
];
sq008.cue_aliases = [
  "oscillating function over polynomial",
  "squeeze on cos(x)/x²",
  "bounded trig over unbounded denominator"
];
sq008.recognition_cue = "Bounded function ($\\cos x$) divided by unbounded function ($x^2$) → squeeze between $\\pm 1/x^2$.";
sq008.solution_steps = [
  "$-1 \\leq \\cos x \\leq 1$ for all $x$",
  "For $x > 0$: $-\\frac{1}{x^2} \\leq \\frac{\\cos x}{x^2} \\leq \\frac{1}{x^2}$",
  "Both $-1/x^2$ and $1/x^2 \\to 0$ as $x \\to \\infty$",
  "By the Squeeze Theorem, the limit is $0$"
];
sq008.distractors = [
  {
    concept: "limit_evaluation",
    why_tempting: "Looks like a simple rational function limit",
    why_wrong: "$\\cos x$ oscillates, so standard rational function techniques don't directly apply"
  },
  {
    concept: "lhopitals_rule",
    why_tempting: "Might try derivatives since it looks indeterminate",
    why_wrong: "$\\cos x$ doesn't approach infinity, so it's not $\\infty/\\infty$ form"
  }
];
console.log('✓ sq_008 fixed (cos(x)/x² variant to avoid sq_006 duplicate)');

// ── Fix 2: opt_010 [P1] ──
// Arc-length approximation not AB-realistic → fencing optimization
const opt010 = draft.find(p => p.id === 'opt_010');
if (!opt010) throw new Error('opt_010 not found');

opt010.stem = "A farmer has 120 m of fencing and wants to enclose a rectangular pen against a barn wall (no fence needed on the barn side). What dimensions maximize the area of the pen?";
opt010.cue_tokens = [
  "fixed perimeter fencing",
  "maximize enclosed area"
];
opt010.cue_aliases = [
  "fencing optimization",
  "maximize rectangle against wall",
  "perimeter constraint area maximization"
];
opt010.solution_steps = [
  "Let $x$ = side perpendicular to barn, $y$ = side parallel. Constraint: $2x + y = 120$, so $y = 120 - 2x$.",
  "$A(x) = x(120 - 2x) = 120x - 2x^2$",
  "$A'(x) = 120 - 4x = 0 \\Rightarrow x = 30$",
  "$y = 120 - 2(30) = 60$. Max area = $30 \\times 60 = 1800$ m²"
];
opt010.answer = "$30$ m $\\times$ $60$ m (area $= 1800$ m²)";
console.log('✓ opt_010 fixed (fencing optimization)');

// ── Fix 3: lhr_007 [P2] ──
// Replace cue_alias "Taylor-like limit" with "higher-order 0/0 limit"
const lhr007 = draft.find(p => p.id === 'lhr_007');
if (!lhr007) throw new Error('lhr_007 not found');

const taylorIdx = lhr007.cue_aliases.indexOf("Taylor-like limit");
if (taylorIdx !== -1) {
  lhr007.cue_aliases[taylorIdx] = "higher-order 0/0 limit";
  console.log('✓ lhr_007 fixed (Taylor-like → higher-order 0/0)');
} else {
  // Search for partial match
  const partialIdx = lhr007.cue_aliases.findIndex(a => a.toLowerCase().includes('taylor'));
  if (partialIdx !== -1) {
    lhr007.cue_aliases[partialIdx] = "higher-order 0/0 limit";
    console.log('✓ lhr_007 fixed (found Taylor alias at index ' + partialIdx + ')');
  } else {
    console.log('⚠ lhr_007: "Taylor-like limit" alias not found. Current aliases:', lhr007.cue_aliases);
  }
}

// ── Fix 4: le_009 [P1] ──
// "profit per item" → "profit" (remove per-item inconsistency)
const le009 = draft.find(p => p.id === 'le_009');
if (!le009) throw new Error('le_009 not found');

// Fix stem
le009.stem = le009.stem.replace(/profit per item/gi, 'profit').replace(/Profit per item/gi, 'Profit');

// Fix cue_tokens
le009.cue_tokens = le009.cue_tokens.map(t => t.replace(/profit per item/gi, 'profit'));

// Fix cue_aliases
le009.cue_aliases = le009.cue_aliases.map(a => a.replace(/profit per item/gi, 'profit'));

console.log('✓ le_009 fixed (profit per item → profit)');

// ── Write back ──
writeFileSync('generated_problems_draft.json', JSON.stringify(draft, null, 2) + '\n');
console.log('\n✅ All 4 corrections applied. Draft saved.');

// ── Verify ──
const verify = JSON.parse(readFileSync('generated_problems_draft.json', 'utf8'));
console.log('\nVerification:');
console.log('  sq_008 stem:', verify.find(p=>p.id==='sq_008').stem.substring(0,60) + '...');
console.log('  opt_010 stem:', verify.find(p=>p.id==='opt_010').stem.substring(0,60) + '...');
console.log('  lhr_007 aliases:', verify.find(p=>p.id==='lhr_007').cue_aliases);
console.log('  le_009 stem:', verify.find(p=>p.id==='le_009').stem.substring(0,60) + '...');

// Check no sq_006/sq_008 duplicate
const sq006 = verify.find(p=>p.id==='sq_006');
const sq008v = verify.find(p=>p.id==='sq_008');
console.log('\n  sq_006 stem:', sq006.stem.substring(0,60) + '...');
console.log('  sq_008 stem:', sq008v.stem.substring(0,60) + '...');
console.log('  Stems identical?', sq006.stem === sq008v.stem);

console.log('\nTotal problems:', verify.length);
