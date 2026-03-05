import {
  getProgress,
  updateRecognition,
  getAttempts,
  getTopConfusions,
} from '../hooks/useStorage';
import { getFirstTryAccuracyAtLevel, getAttemptsAtLevel } from './scoring';
import conceptsData from '../data/concepts.json';

const SCORED_CONCEPTS = new Set(conceptsData.filter((c) => c.scored).map((c) => c.id));

/**
 * Adaptive difficulty engine.
 *
 * Promotion: Advance to next disguise level when:
 *   attempts_at_current_level >= 5 AND first_try_accuracy_last_10 >= 80%
 *
 * Hold: Stay at current level when:
 *   first_try_accuracy_last_10 is 50-79%
 *
 * Remediate: When first_try_accuracy < 50% after >= 6 attempts:
 *   - Inject 3-item targeted confusion drill
 *   - Drop back to L1 if currently at L3+
 */

export function evaluateAdaptive(concept) {
  const progress = getProgress(concept);
  const currentLevel = progress.recognition.currentLevel;
  const attemptsAtLevel = getAttemptsAtLevel(concept, currentLevel);
  const { accuracy, count } = getFirstTryAccuracyAtLevel(concept, currentLevel, 10);

  if (accuracy === null || count < 5) {
    return { action: 'hold', level: currentLevel, reason: 'insufficient_data' };
  }

  // Promotion
  if (attemptsAtLevel >= 5 && accuracy >= 0.8) {
    if (currentLevel < 4) {
      return { action: 'promote', level: currentLevel + 1, reason: 'mastered_level' };
    }
    return { action: 'hold', level: 4, reason: 'max_level' };
  }

  // Remediate
  if (accuracy < 0.5 && attemptsAtLevel >= 6) {
    const topConfusions = getTopConfusions(concept, 5).filter((c) => SCORED_CONCEPTS.has(c.chosen));
    const confusionPair = topConfusions[0]?.chosen ?? null;
    const dropLevel = currentLevel >= 3 ? 1 : currentLevel;
    return {
      action: 'remediate',
      level: dropLevel,
      reason: 'low_accuracy',
      confusionPair,
      drillCount: 3,
    };
  }

  // Hold
  return { action: 'hold', level: currentLevel, reason: 'progressing' };
}

/**
 * Apply adaptive result to storage.
 */
export function applyAdaptive(concept) {
  const result = evaluateAdaptive(concept);

  if (result.action === 'promote' || result.action === 'remediate') {
    updateRecognition(concept, (rec) => ({
      ...rec,
      currentLevel: result.level,
    }));
  }

  return result;
}

/**
 * Determine if this question should be an interleaved review.
 * Every 5th question pulls from a previously mastered concept.
 */
export function shouldInterleave(totalQuestionsThisSession) {
  return totalQuestionsThisSession > 0 && totalQuestionsThisSession % 5 === 0;
}

/**
 * Get a mastered concept for interleaved review.
 * "Mastered" = ≥80% first-try accuracy at current level.
 * Returns the concept ID least recently seen, or null if none mastered.
 */
export function getMasteredConceptForReview(excludeConcept, scoredConcepts) {
  const candidates = [];

  for (const concept of scoredConcepts) {
    if (concept.id === excludeConcept) continue;
    const progress = getProgress(concept.id);
    const rec = progress.recognition;
    if (rec.attempts === 0) continue;

    const { accuracy } = getFirstTryAccuracyAtLevel(concept.id, rec.currentLevel, 10);
    if (accuracy !== null && accuracy >= 0.8) {
      candidates.push({
        id: concept.id,
        lastSeen: rec.lastSeen || 0,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Return least recently seen
  candidates.sort((a, b) => a.lastSeen - b.lastSeen);
  return candidates[0].id;
}

/**
 * Select the next problem for a concept at the appropriate level.
 * Avoids recently shown problems.
 */
export function selectProblem(concept, problems) {
  const progress = getProgress(concept);
  const level = progress.recognition.currentLevel;

  // Get recent problem IDs to avoid repetition
  const attempts = getAttempts();
  const recentIds = new Set(
    attempts
      .filter((a) => a.trueConcept === concept)
      .slice(-8)
      .map((a) => a.problemId)
  );

  // Filter problems for this concept at current level
  let candidates = problems.filter(
    (p) => p.concept === concept && p.disguise_level === level
  );

  // Prefer unseen problems
  const unseen = candidates.filter((p) => !recentIds.has(p.id));
  if (unseen.length > 0) candidates = unseen;

  if (candidates.length === 0) {
    // Fall back to any level for this concept
    candidates = problems.filter((p) => p.concept === concept);
    const unseenFallback = candidates.filter((p) => !recentIds.has(p.id));
    if (unseenFallback.length > 0) candidates = unseenFallback;
  }

  if (candidates.length === 0) return null;

  // Random selection from candidates
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Build confusion drill: 3 problems mixing the concept with its top confusion pair.
 */
export function buildConfusionDrill(concept, confusionPair, problems) {
  if (!confusionPair) return [];
  if (!SCORED_CONCEPTS.has(concept) || !SCORED_CONCEPTS.has(confusionPair)) return [];

  const conceptProblems = problems.filter(
    (p) => p.concept === concept && p.disguise_level <= 2
  );
  const confusionProblems = problems.filter(
    (p) => p.concept === confusionPair && p.disguise_level <= 2
  );

  const drill = [];

  // 2 from the concept, 1 from the confusion pair (or vice versa)
  if (conceptProblems.length >= 2 && confusionProblems.length >= 1) {
    drill.push(conceptProblems[Math.floor(Math.random() * conceptProblems.length)]);
    drill.push(confusionProblems[Math.floor(Math.random() * confusionProblems.length)]);
    const remaining = conceptProblems.filter((p) => p.id !== drill[0].id);
    if (remaining.length > 0) {
      drill.push(remaining[Math.floor(Math.random() * remaining.length)]);
    } else {
      drill.push(conceptProblems[0]);
    }
  }

  // Shuffle
  for (let i = drill.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [drill[i], drill[j]] = [drill[j], drill[i]];
  }

  return drill.slice(0, 3);
}
