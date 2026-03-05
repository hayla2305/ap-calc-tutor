import { getAllConceptIds, getConfusion } from '../hooks/useStorage';

/**
 * Get all confusion pairs for a concept, sorted by frequency.
 * Returns: [{ chosen: string, count: number, lastSeen: number }]
 */
export function getConfusionPairs(trueConcept) {
  const concepts = getAllConceptIds();
  const pairs = [];

  for (const chosen of concepts) {
    if (chosen === trueConcept) continue;
    const data = getConfusion(trueConcept, chosen);
    if (data.count > 0) {
      pairs.push({ chosen, count: data.count, lastSeen: data.lastSeen });
    }
  }

  pairs.sort((a, b) => b.count - a.count);
  return pairs;
}

/**
 * Get top confusion pairs across ALL concepts.
 * Returns: [{ true: string, chosen: string, count: number }]
 */
export function getGlobalTopConfusions(limit = 10) {
  const concepts = getAllConceptIds();
  const all = [];

  for (const trueConcept of concepts) {
    for (const chosen of concepts) {
      if (chosen === trueConcept) continue;
      const data = getConfusion(trueConcept, chosen);
      if (data.count > 0) {
        all.push({ true: trueConcept, chosen, count: data.count });
      }
    }
  }

  all.sort((a, b) => b.count - a.count);
  return all.slice(0, limit);
}

/**
 * Build technique options for a problem per spec rules:
 * 1 correct + 2 from historical confusion + 1 same-cluster
 * Enforces 3 UNIQUE distractor concepts.
 * Falls back through confusion priors → common_misidentification → same-cluster → adjacent-cluster.
 */
export function buildTechniqueOptions(problem, allProblems, concepts) {
  const correct = problem.correct_technique;
  const cluster = problem.cluster;
  const distractors = new Set();

  // Build implausible set for this concept (used to filter fallback distractors)
  const conceptData = concepts.find((c) => c.id === correct);
  const implausible = new Set(conceptData?.implausible_with || []);

  // Step 1: Top 2 historical confusion pairs
  // Historical data is trusted — don't filter by implausible
  const confusions = getConfusionPairs(correct);
  for (const c of confusions) {
    if (distractors.size >= 2) break;
    if (c.chosen !== correct) distractors.add(c.chosen);
  }

  // Step 2: Fall back to problem metadata if not enough from history
  // Problem metadata is curated — don't filter by implausible
  if (distractors.size < 2 && problem.common_misidentification) {
    distractors.add(problem.common_misidentification);
  }
  if (distractors.size < 2 && problem.distractors) {
    for (const d of problem.distractors) {
      if (d.concept !== correct && !distractors.has(d.concept)) {
        distractors.add(d.concept);
        if (distractors.size >= 2) break;
      }
    }
  }

  // Step 3: Same-cluster distractor (different from the 2 above)
  // Filter by implausible for fallback selections
  const sameCluster = concepts
    .filter((c) => c.cluster === cluster && c.id !== correct && !distractors.has(c.id) && !implausible.has(c.id))
    .map((c) => c.id);

  if (sameCluster.length > 0) {
    distractors.add(sameCluster[Math.floor(Math.random() * sameCluster.length)]);
  }

  // Step 4: If still need more, pull from adjacent clusters
  if (distractors.size < 3) {
    const adjacent = concepts
      .filter(
        (c) =>
          Math.abs(c.cluster - cluster) <= 1 &&
          c.id !== correct &&
          !distractors.has(c.id) &&
          !implausible.has(c.id)
      )
      .map((c) => c.id);

    for (const id of adjacent) {
      distractors.add(id);
      if (distractors.size >= 3) break;
    }
  }

  // Step 5: Last resort — any concept (still filter implausible)
  if (distractors.size < 3) {
    const any = concepts.filter((c) => c.id !== correct && !distractors.has(c.id) && !implausible.has(c.id));
    for (const c of any) {
      distractors.add(c.id);
      if (distractors.size >= 3) break;
    }
  }

  // Step 6: If STILL not enough after implausible filter, allow implausible as absolute last resort
  if (distractors.size < 3) {
    const remaining = concepts.filter((c) => c.id !== correct && !distractors.has(c.id));
    for (const c of remaining) {
      distractors.add(c.id);
      if (distractors.size >= 3) break;
    }
  }

  // Build options array and shuffle
  const options = [correct, ...Array.from(distractors).slice(0, 3)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return options;
}

/**
 * Get distractor explanation for a chosen wrong answer.
 */
export function getDistractorExplanation(problem, chosenConcept) {
  if (!problem.distractors) return null;
  return problem.distractors.find((d) => d.concept === chosenConcept) || null;
}
