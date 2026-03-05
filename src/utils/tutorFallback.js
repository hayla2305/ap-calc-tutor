import coachingData from '../data/coaching.json';

const coachingMap = new Map(coachingData.map((x) => [x.key, x]));

/**
 * Build a deterministic fallback tutor message using coaching.json templates.
 * Used when the tutor API is unreachable.
 *
 * Handles both flat context (ctx.concept) and nested context (ctx.problem.concept).
 *
 * @param {object} ctx - Tutor context
 * @returns {string}
 */
export function buildDeterministicFallback(ctx = {}) {
  const problem = ctx.problem || ctx;
  const attempt = ctx.attempt || {};
  const trueConcept = problem.concept;
  const chosen =
    attempt.chosenTechnique ||
    ctx.selectedTechnique ||
    problem.common_misidentification;
  const key = trueConcept && chosen ? `${trueConcept}:${chosen}` : null;
  const template = key ? coachingMap.get(key) : null;

  if (template) {
    return `Tutor unavailable — here's what to focus on:\n\n${template.initial_message}\n\nSelf-check: ${template.discriminator_tip}`;
  }

  const cues = (problem.cue_tokens || []).slice(0, 2);
  const cueText = cues.length ? cues.join(', ') : 'rate/time wording, target quantity, and representation clues';
  return `Tutor unavailable — here's what to focus on:\n\nPick 2 concrete cues from the stem. Start with: ${cueText}.`;
}
