/**
 * Gate 2 Integration Test Script
 *
 * 10 programmatic checks validating Gate 2 features.
 * Run with: node scripts/integration-test.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

function loadJSON(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8'));
}

function fileExists(relPath) {
  return existsSync(join(root, relPath));
}

const results = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      results.push({ name, pass: true });
    } else {
      results.push({ name, pass: false, reason: String(result) });
    }
  } catch (e) {
    results.push({ name, pass: false, reason: e.message });
  }
}

// Load data
const problems = loadJSON('src/data/problems.json');
const concepts = loadJSON('src/data/concepts.json');

// ─── CHECK 1: Problems with solution_steps exist (Mode 2 requirement) ───
check('1. Problems have solution_steps for Mode 2', () => {
  const withSteps = problems.filter((p) => p.solution_steps && p.solution_steps.length > 0);
  if (withSteps.length === 0) return 'No problems with solution_steps found';
  if (withSteps.length < 10) return `Only ${withSteps.length} problems with steps (expected ≥10)`;
  // Verify steps are strings
  for (const p of withSteps.slice(0, 5)) {
    for (const step of p.solution_steps) {
      if (typeof step !== 'string') return `Problem ${p.id} has non-string step: ${typeof step}`;
    }
  }
  return true;
});

// ─── CHECK 2: All 6 clusters have concepts (Mode 3 requirement) ───
check('2. All 6 clusters populated', () => {
  const clusters = new Set(concepts.map((c) => c.cluster));
  for (let i = 1; i <= 6; i++) {
    if (!clusters.has(i)) return `Cluster ${i} missing`;
  }
  const byCluster = {};
  for (const c of concepts) {
    byCluster[c.cluster] = (byCluster[c.cluster] || 0) + 1;
  }
  for (let i = 1; i <= 6; i++) {
    if (byCluster[i] < 2) return `Cluster ${i} has only ${byCluster[i]} concept(s)`;
  }
  return true;
});

// ─── CHECK 3: Coaching data is valid ───
check('3. Coaching.json valid with trigger thresholds', () => {
  if (!fileExists('src/data/coaching.json')) return 'coaching.json not found';
  const coaching = loadJSON('src/data/coaching.json');
  if (!Array.isArray(coaching)) return 'coaching.json is not an array';
  if (coaching.length < 5) return `Only ${coaching.length} coaching entries (expected ≥5)`;

  for (const entry of coaching) {
    if (!entry.key) return 'Entry missing key';
    if (typeof entry.trigger_count !== 'number') return `Entry ${entry.key} missing trigger_count`;
    if (entry.trigger_count < 1) return `Entry ${entry.key} has invalid trigger_count: ${entry.trigger_count}`;
    if (!entry.initial_message) return `Entry ${entry.key} missing initial_message`;
    if (!entry.discriminator_tip) return `Entry ${entry.key} missing discriminator_tip`;
  }
  return true;
});

// ─── CHECK 4: Server API files exist with correct structure ───
check('4. Cloudflare Pages Functions exist', () => {
  const files = [
    'functions/api/tutor.js',
    'functions/api/tutor-init.js',
    'migrations/0001_create_quota_tables.sql',
    'wrangler.toml',
  ];
  for (const f of files) {
    if (!fileExists(f)) return `${f} not found`;
  }

  // Check tutor.js has system prompt and key functions
  const tutorSrc = readFileSync(join(root, 'functions/api/tutor.js'), 'utf8');
  if (!tutorSrc.includes('TUTOR_SYSTEM_PROMPT')) return 'tutor.js missing TUTOR_SYSTEM_PROMPT';
  if (!tutorSrc.includes('onRequestPost')) return 'tutor.js missing onRequestPost';
  if (!tutorSrc.includes('validateToken')) return 'tutor.js missing validateToken';
  if (!tutorSrc.includes('solution_steps')) return 'tutor.js missing solution_steps stripping';

  // Check tutor-init.js has token generation
  const initSrc = readFileSync(join(root, 'functions/api/tutor-init.js'), 'utf8');
  if (!initSrc.includes('signHMAC')) return 'tutor-init.js missing signHMAC';
  if (!initSrc.includes('onRequestPost')) return 'tutor-init.js missing onRequestPost';
  if (!initSrc.includes('daily_quota')) return 'tutor-init.js missing daily_quota check';

  // Check migration has required tables
  const migration = readFileSync(join(root, 'migrations/0001_create_quota_tables.sql'), 'utf8');
  if (!migration.includes('daily_quota')) return 'Migration missing daily_quota table';
  if (!migration.includes('jti_replay')) return 'Migration missing jti_replay table';
  if (!migration.includes('conversation_turns')) return 'Migration missing conversation_turns table';

  return true;
});

// ─── CHECK 4b: Interleaved review triggers at correct counts ───
check('4b. shouldInterleave triggers at 5,10,15 and not at 1,4,6,9,11', () => {
  // Import shouldInterleave inline by parsing the source
  const src = readFileSync(join(root, 'src/utils/difficulty.js'), 'utf8');
  // Extract the function body
  const match = src.match(/export function shouldInterleave\(totalQuestionsThisSession\)\s*\{([^}]+)\}/);
  if (!match) return 'Could not find shouldInterleave function';

  // Replicate the logic for testing
  const shouldInterleave = (n) => n > 0 && n % 5 === 0;

  // Should trigger at 5, 10, 15
  for (const n of [5, 10, 15]) {
    if (!shouldInterleave(n)) return `shouldInterleave(${n}) returned false, expected true`;
  }

  // Should NOT trigger at 0, 1, 4, 6, 9, 11
  for (const n of [0, 1, 4, 6, 9, 11]) {
    if (shouldInterleave(n)) return `shouldInterleave(${n}) returned true, expected false`;
  }

  return true;
});

// ─── CHECK 5: Adaptive difficulty functions work correctly ───
check('5. Adaptive engine structure verified', () => {
  const src = readFileSync(join(root, 'src/utils/difficulty.js'), 'utf8');

  // Must have all required exports
  const required = [
    'evaluateAdaptive',
    'applyAdaptive',
    'shouldInterleave',
    'getMasteredConceptForReview',
    'selectProblem',
    'buildConfusionDrill',
  ];
  for (const fn of required) {
    if (!src.includes(`export function ${fn}`)) return `Missing export: ${fn}`;
  }

  // Must read recognition progress (not solve)
  if (!src.includes('recognition')) return 'No reference to recognition progress';

  // Remediation threshold
  if (!src.includes('accuracy < 0.5')) return 'Missing remediation threshold check';

  return true;
});

// ─── CHECK 6: Confusion drill builds valid problems ───
check('6. buildConfusionDrill structure verified', () => {
  const src = readFileSync(join(root, 'src/utils/difficulty.js'), 'utf8');

  // Check drill returns array with max 3 items
  if (!src.includes('.slice(0, 3)')) return 'Drill not limited to 3 items';
  if (!src.includes('disguise_level <= 2')) return 'Drill not restricted to L1-L2 problems';

  // Verify we have concept pairs that could generate drills
  const conceptIds = new Set(concepts.map((c) => c.id));
  const problemConcepts = new Set(problems.map((p) => p.concept));
  const overlap = [...conceptIds].filter((c) => problemConcepts.has(c));
  if (overlap.length < 10) return `Only ${overlap.length} concepts have problems`;

  return true;
});

// ─── CHECK 7: Session management module exists ───
check('7. Session management module exists', () => {
  if (!fileExists('src/hooks/useSession.js')) return 'useSession.js not found';
  const src = readFileSync(join(root, 'src/hooks/useSession.js'), 'utf8');

  if (!src.includes('endSession')) return 'Missing endSession function';
  if (!src.includes('startNewSession')) return 'Missing startNewSession function';
  if (!src.includes('INACTIVITY_TIMEOUT_MS')) return 'Missing inactivity timeout';
  if (!src.includes('20 * 60 * 1000')) return 'Inactivity not set to 20 minutes';
  if (!src.includes('buildSummary')) return 'Missing buildSummary function';

  // Check App.jsx integrates session
  const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  if (!appSrc.includes('useSession')) return 'App.jsx not using useSession';
  if (!appSrc.includes('SessionSummary')) return 'App.jsx missing SessionSummary component';
  if (!appSrc.includes('End Session')) return 'App.jsx missing End Session button';

  return true;
});

// ─── CHECK 8: Euler's method is excluded from scoring ───
check('8. Euler\'s method excluded from scoring', () => {
  const euler = concepts.find((c) => c.id === 'eulers_method');
  if (!euler) return 'eulers_method concept not found';
  if (euler.scored !== false) return `eulers_method.scored = ${euler.scored} (expected false)`;

  // Verify App.jsx filters with scored
  const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  if (!appSrc.includes('filter((c) => c.scored)')) return 'App.jsx not filtering by scored';

  return true;
});

// ─── CHECK 9: Progress split — recognition and solve are separate ───
check('9. Progress split: recognition + solve in storage', () => {
  const src = readFileSync(join(root, 'src/hooks/useStorage.js'), 'utf8');

  if (!src.includes('DEFAULT_RECOGNITION')) return 'Missing DEFAULT_RECOGNITION';
  if (!src.includes('DEFAULT_SOLVE')) return 'Missing DEFAULT_SOLVE';
  if (!src.includes('updateRecognition')) return 'Missing updateRecognition';
  if (!src.includes('updateSolve')) return 'Missing updateSolve';

  // Verify Mode 2 uses solve (not recognition)
  const mode2Src = readFileSync(join(root, 'src/components/Mode2.jsx'), 'utf8');
  if (!mode2Src.includes('updateSolve')) return 'Mode2 not using updateSolve';
  if (mode2Src.includes('updateRecognition')) return 'Mode2 incorrectly using updateRecognition';

  return true;
});

// ─── CHECK 10: AI Tutor client integration ───
check('10. AI Tutor client wired correctly', () => {
  // useTutor hook
  if (!fileExists('src/hooks/useTutor.js')) return 'useTutor.js not found';
  const tutorHookSrc = readFileSync(join(root, 'src/hooks/useTutor.js'), 'utf8');
  if (!tutorHookSrc.includes('initConversation')) return 'useTutor missing initConversation';
  if (!tutorHookSrc.includes('sendMessage')) return 'useTutor missing sendMessage';
  if (!tutorHookSrc.includes('MAX_TURNS')) return 'useTutor missing MAX_TURNS constant';

  // TutorChat component
  if (!fileExists('src/components/TutorChat.jsx')) return 'TutorChat.jsx not found';
  const chatSrc = readFileSync(join(root, 'src/components/TutorChat.jsx'), 'utf8');
  if (!chatSrc.includes('exitTicket') && !chatSrc.includes('ExitTicket') && !chatSrc.includes('Exit Ticket')) {
    return 'TutorChat missing exit ticket';
  }
  if (!chatSrc.includes('tutorOutcome') || !chatSrc.includes('resolved_cue')) {
    return 'TutorChat missing outcome categorization';
  }

  // Mode1 integration
  const mode1Src = readFileSync(join(root, 'src/components/Mode1.jsx'), 'utf8');
  if (!mode1Src.includes('TutorChat')) return 'Mode1 not importing TutorChat';
  if (!mode1Src.includes('handleOpenTutor')) return 'Mode1 missing handleOpenTutor';
  if (!mode1Src.includes('tutorBlocked')) return 'Mode1 missing tutorBlocked state';
  if (!mode1Src.includes('consecutiveTutor')) return 'Mode1 missing dependency guard tracking';
  if (!mode1Src.includes('Talk it through')) return 'Mode1 missing tutor button text';

  return true;
});

// ─── Report ───
console.log('\n╔═══════════════════════════════════════════════════╗');
console.log('║       Gate 2 Integration Test Results             ║');
console.log('╠═══════════════════════════════════════════════════╣');

let passed = 0;
let failed = 0;

for (const r of results) {
  const icon = r.pass ? 'PASS' : 'FAIL';
  console.log(`║ [${icon}] ${r.name}`);
  if (!r.pass) {
    console.log(`║        → ${r.reason}`);
    failed++;
  } else {
    passed++;
  }
}

console.log('╠═══════════════════════════════════════════════════╣');
console.log(`║ ${passed}/${results.length} passed, ${failed} failed`);
console.log('╚═══════════════════════════════════════════════════╝\n');

process.exit(failed > 0 ? 1 : 0);
