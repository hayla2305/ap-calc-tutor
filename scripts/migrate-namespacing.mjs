#!/usr/bin/env node
/**
 * Phase 1B: Subject namespacing migration
 * Adds subject/exam/domain to problems.json and subject/exam/uid to concepts.json
 *
 * Run: node scripts/migrate-namespacing.mjs
 * Dry run: node scripts/migrate-namespacing.mjs --dry-run
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../src/data');

const dryRun = process.argv.includes('--dry-run');

// ─── Domain mapping by concept ID ───
const DOMAIN_MAP = {
  // Limits (CB Unit 1)
  limit_evaluation: 'limits',
  continuity_types: 'limits',
  squeeze_theorem: 'limits',

  // Derivatives — rates, rules, techniques (CB Units 2–4)
  derivative_as_rate: 'derivatives',
  product_rule: 'derivatives',
  quotient_rule: 'derivatives',
  chain_rule: 'derivatives',
  implicit_differentiation: 'derivatives',
  inverse_function_derivatives: 'derivatives',
  related_rates: 'derivatives',
  linear_approximation: 'derivatives',
  lhopitals_rule: 'derivatives',

  // Derivatives — analysis & theorems (CB Unit 5)
  f_fprime_fdoubleprime: 'derivatives',
  increasing_decreasing: 'derivatives',
  concavity: 'derivatives',
  relative_extrema: 'derivatives',
  absolute_extrema: 'derivatives',
  inflection_points: 'derivatives',
  evt: 'derivatives',
  mvt: 'derivatives',
  optimization: 'derivatives',

  // Integrals (CB Unit 6)
  integral_as_accumulation: 'integrals',
  ftc_part1: 'integrals',
  ftc_part2: 'integrals',
  riemann_sums: 'integrals',
  u_substitution: 'integrals',

  // Applications of integration (CB Unit 8) + particle motion (CB Unit 4)
  area_between_curves: 'applications',
  volume_cross_sections: 'applications',
  volume_disk_washer: 'applications',
  average_value: 'applications',
  particle_motion: 'applications',

  // Differential equations (CB Unit 7)
  separation_of_variables: 'differential_equations',
  slope_fields: 'differential_equations',
  eulers_method: 'differential_equations',
};

// ─── Migrate concepts.json ───
function migrateConcepts() {
  const conceptsPath = resolve(DATA_DIR, 'concepts.json');
  const concepts = JSON.parse(readFileSync(conceptsPath, 'utf-8'));
  let changed = 0;

  for (const concept of concepts) {
    const updates = {};

    if (!concept.subject) updates.subject = 'ap';
    if (!concept.exam) updates.exam = 'calc_ab';
    if (!concept.uid) updates.uid = `ap.calc_ab.${concept.id}`;

    if (Object.keys(updates).length > 0) {
      Object.assign(concept, updates);
      changed++;
    }
  }

  if (!dryRun) {
    writeFileSync(conceptsPath, JSON.stringify(concepts, null, 2) + '\n', 'utf-8');
  }

  console.log(`concepts.json: ${changed}/${concepts.length} concepts updated`);
  return concepts;
}

// ─── Migrate problems.json ───
function migrateProblems() {
  const problemsPath = resolve(DATA_DIR, 'problems.json');
  const problems = JSON.parse(readFileSync(problemsPath, 'utf-8'));
  let changed = 0;
  const missing = [];

  for (const problem of problems) {
    const updates = {};

    if (!problem.subject) updates.subject = 'ap';
    if (!problem.exam) updates.exam = 'calc_ab';

    if (!problem.domain) {
      const domain = DOMAIN_MAP[problem.concept];
      if (domain) {
        updates.domain = domain;
      } else {
        missing.push({ id: problem.id, concept: problem.concept });
      }
    }

    if (Object.keys(updates).length > 0) {
      // Insert after exam field position for readability
      // We just assign — JSON field order is preserved by V8 for non-numeric keys
      Object.assign(problem, updates);
      changed++;
    }
  }

  if (missing.length > 0) {
    console.error(`\nWARNING: ${missing.length} problems have unmapped concepts:`);
    for (const m of missing) {
      console.error(`  ${m.id} → concept: "${m.concept}"`);
    }
  }

  if (!dryRun) {
    writeFileSync(problemsPath, JSON.stringify(problems, null, 2) + '\n', 'utf-8');
  }

  console.log(`problems.json: ${changed}/${problems.length} problems updated`);
  return problems;
}

// ─── Validate ───
function validate(concepts, problems) {
  const errors = [];

  // Check all concepts have required fields
  for (const c of concepts) {
    if (!c.subject) errors.push(`concept ${c.id}: missing subject`);
    if (!c.exam) errors.push(`concept ${c.id}: missing exam`);
    if (!c.uid) errors.push(`concept ${c.id}: missing uid`);
    if (c.uid && c.uid !== `ap.calc_ab.${c.id}`) {
      errors.push(`concept ${c.id}: uid mismatch (expected ap.calc_ab.${c.id}, got ${c.uid})`);
    }
  }

  // Check all problems have required fields
  for (const p of problems) {
    if (!p.subject) errors.push(`problem ${p.id}: missing subject`);
    if (!p.exam) errors.push(`problem ${p.id}: missing exam`);
    if (!p.domain) errors.push(`problem ${p.id}: missing domain`);
  }

  // Check domain values are valid
  const validDomains = new Set(['limits', 'derivatives', 'integrals', 'differential_equations', 'applications']);
  for (const p of problems) {
    if (p.domain && !validDomains.has(p.domain)) {
      errors.push(`problem ${p.id}: invalid domain "${p.domain}"`);
    }
  }

  // Check referential integrity: every problem concept maps to a known concept uid
  const conceptIds = new Set(concepts.map(c => c.id));
  for (const p of problems) {
    if (!conceptIds.has(p.concept)) {
      errors.push(`problem ${p.id}: concept "${p.concept}" not found in concepts.json`);
    }
  }

  if (errors.length > 0) {
    console.error(`\nVALIDATION ERRORS (${errors.length}):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
  } else {
    console.log('\nValidation: all checks passed ✓');
  }

  return errors;
}

// ─── Run ───
console.log(dryRun ? '=== DRY RUN ===' : '=== MIGRATING ===');
console.log();

const concepts = migrateConcepts();
const problems = migrateProblems();
const errors = validate(concepts, problems);

console.log();
console.log(dryRun ? 'No files written (dry run)' : 'Migration complete');

if (errors.length > 0) {
  process.exit(1);
}
