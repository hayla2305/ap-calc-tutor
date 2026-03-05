import coachingData from '../data/coaching.json';
import { getConfusion, markCoachingBaseline } from '../hooks/useStorage';

// Session-level tracking: which pairs have already shown coaching this session
const shownThisSession = new Set();

// Build lookup map from coaching data
const coachingMap = new Map();
for (const entry of coachingData) {
  coachingMap.set(entry.key, entry);
}

/**
 * Check if coaching should trigger for a confusion pair.
 * Returns the coaching entry or null.
 */
export function getCoachingForPair(trueConcept, chosenConcept) {
  const key = `${trueConcept}:${chosenConcept}`;

  // Already shown this session?
  if (shownThisSession.has(key)) return null;

  // Template exists?
  const template = coachingMap.get(key);
  if (!template) return null;

  // Check confusion count
  const data = getConfusion(trueConcept, chosenConcept);
  if (data.count < template.trigger_count) return null;

  // Determine message level: escalate only if count >= escalation_count
  // AND at least 3 additional confusions since last coaching baseline
  const baseline = data.coaching_baseline_count ?? data.count;
  const additionalSinceCoaching = Math.max(0, data.count - baseline);
  const isEscalated = data.count >= template.escalation_count && additionalSinceCoaching >= 3;

  return {
    ...template,
    isEscalated,
    message: isEscalated ? template.escalated_message : template.initial_message,
    confusionCount: data.count,
  };
}

/**
 * Mark a coaching pair as shown this session.
 */
export function markCoachingShown(trueConcept, chosenConcept) {
  shownThisSession.add(`${trueConcept}:${chosenConcept}`);
  markCoachingBaseline(trueConcept, chosenConcept);
}

/**
 * Reset session coaching tracking (for new sessions).
 */
export function resetCoachingSession() {
  shownThisSession.clear();
}
