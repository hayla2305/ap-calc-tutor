import { useMemo, useCallback } from 'react';
import { getMasteryPercent } from '../utils/scoring';
import { getGlobalTopConfusions } from '../utils/confusion';

const CLUSTER_NAMES = {
  1: 'Limits & Continuity',
  2: 'Differentiation Basics',
  3: 'Applications of Derivatives',
  4: 'Integration',
  5: 'Applications of Integration',
  6: 'Differential Equations & More',
};

/**
 * Mode 3 — Concept Map
 *
 * Visual progress dashboard showing mastery across all concepts, organized by cluster.
 */
export default function Mode3({ concepts, onDrillConcept }) {
  const clusters = useMemo(() => {
    const map = new Map();
    for (const c of concepts) {
      const cluster = c.cluster;
      if (!map.has(cluster)) map.set(cluster, []);
      map.get(cluster).push(c);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [concepts]);

  const topConfusions = useMemo(() => getGlobalTopConfusions(5), []);

  const getConceptLabel = useCallback((conceptId) => {
    const c = concepts.find((x) => x.id === conceptId);
    return c ? c.label : conceptId;
  }, [concepts]);

  return (
    <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-4 py-6">
      <h2 className="text-lg font-semibold mb-6">Concept Map</h2>

      {/* Clusters */}
      {clusters.map(([clusterId, clusterConcepts]) => (
        <div key={clusterId} className="mb-8">
          <h3 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-3">
            {CLUSTER_NAMES[clusterId] || `Cluster ${clusterId}`}
          </h3>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {clusterConcepts.map((concept) => (
              <ConceptTile
                key={concept.id}
                concept={concept}
                onDrill={() => onDrillConcept?.(concept.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Confusion Pairs */}
      {topConfusions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-3">
            Top Confusion Pairs
          </h3>
          <div className="space-y-2">
            {topConfusions.map((pair, i) => (
              <button
                key={i}
                onClick={() => onDrillConcept?.(pair.true)}
                className="w-full text-left card p-3 hover:border-[var(--color-accent)] transition-colors cursor-pointer"
              >
                <p className="text-sm">
                  <span className="text-[var(--color-wrong)]">You often confuse </span>
                  <span className="font-medium">{getConceptLabel(pair.true)}</span>
                  <span className="text-[var(--color-wrong)]"> with </span>
                  <span className="font-medium">{getConceptLabel(pair.chosen)}</span>
                  <span className="text-[var(--color-text-dim)]"> ({pair.count} times)</span>
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConceptTile({ concept, onDrill }) {
  const mastery = concept.scored ? getMasteryPercent(concept.id) : null;

  let colorVar;
  if (!concept.scored || mastery === null) {
    colorVar = 'var(--color-text-dim)';
  } else if (mastery >= 80) {
    colorVar = 'var(--color-correct)';
  } else if (mastery >= 50) {
    colorVar = 'var(--color-warning)';
  } else {
    colorVar = 'var(--color-wrong)';
  }

  return (
    <button
      onClick={onDrill}
      className="card p-3 min-h-24 text-left hover:border-[var(--color-accent)] transition-colors cursor-pointer"
    >
      <p className="text-sm font-medium mb-1 leading-tight">{concept.label}</p>
      {concept.scored ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${mastery ?? 0}%`,
                backgroundColor: colorVar,
              }}
            />
          </div>
          <span
            className="text-xs font-mono"
            style={{ color: colorVar }}
          >
            {mastery ?? 0}%
          </span>
        </div>
      ) : (
        <span className="text-xs text-[var(--color-text-dim)]">Practice Only</span>
      )}
    </button>
  );
}
