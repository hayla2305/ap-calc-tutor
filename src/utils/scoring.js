import { getProgress, getAttempts } from '../hooks/useStorage';

/**
 * Calculate mastery percentage for a concept in recognition mode.
 * Based on first-try accuracy across all levels.
 */
export function getMasteryPercent(concept) {
  const progress = getProgress(concept);
  const rec = progress.recognition;
  if (rec.attempts === 0) return 0;

  // Use first-try data across all levels
  let totalCorrect = 0;
  let totalAttempts = 0;
  for (const level of Object.values(rec.firstTriesByLevel)) {
    totalCorrect += level.correct;
    totalAttempts += level.total;
  }
  if (totalAttempts === 0) return 0;
  return Math.round((totalCorrect / totalAttempts) * 100);
}

/**
 * Get mastery color class based on percentage.
 */
export function getMasteryColor(percent) {
  if (percent >= 80) return 'correct';
  if (percent >= 50) return 'warning';
  return 'wrong';
}

/**
 * Get first-try accuracy for the last N attempts at a given level.
 */
export function getFirstTryAccuracyAtLevel(concept, level, lastN = 10) {
  const attempts = getAttempts();
  const relevant = attempts
    .filter(
      (a) =>
        a.trueConcept === concept &&
        a.mode === 'recognition' &&
        a.firstTry === true &&
        a.disguiseLevel === level
    )
    .slice(-lastN);

  if (relevant.length === 0) return { accuracy: null, count: 0 };
  const correct = relevant.filter((a) => a.correct).length;
  return {
    accuracy: correct / relevant.length,
    count: relevant.length,
  };
}

/**
 * Get overall first-try accuracy for last N recognition attempts.
 */
export function getRecentFirstTryAccuracy(concept, lastN = 10) {
  const attempts = getAttempts();
  const relevant = attempts
    .filter(
      (a) =>
        a.trueConcept === concept &&
        a.mode === 'recognition' &&
        a.firstTry === true
    )
    .slice(-lastN);

  if (relevant.length === 0) return { accuracy: null, count: 0 };
  const correct = relevant.filter((a) => a.correct).length;
  return {
    accuracy: correct / relevant.length,
    count: relevant.length,
  };
}

/**
 * Count total first-try attempts at a specific level.
 */
export function getAttemptsAtLevel(concept, level) {
  const progress = getProgress(concept);
  const levelData = progress.recognition.firstTriesByLevel[level];
  return levelData ? levelData.total : 0;
}
