import { useState, useCallback } from 'react';
import { getCoachingForPair, markCoachingShown } from '../utils/coaching';

/**
 * CoachingCard component — dismissible overlay that shows coaching for a confusion pair.
 */
export default function CoachingCard({ trueConcept, chosenConcept, getConceptLabel, onDismiss, onEndSession }) {
  const [coaching] = useState(() => getCoachingForPair(trueConcept, chosenConcept));
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    markCoachingShown(trueConcept, chosenConcept);
    setDismissed(true);
    onDismiss?.();
  }, [trueConcept, chosenConcept, onDismiss]);

  if (!coaching || dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="card max-w-lg w-full p-4 sm:p-6 space-y-4 bg-[var(--color-bg-card)] border-[var(--color-accent)] max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Row 1: title + actions */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-accent)] uppercase tracking-wider">
            {coaching.isEscalated ? 'Coaching (Repeated Pattern)' : 'Coaching'}
          </h3>
          {onEndSession && (
            <button onClick={onEndSession} className="text-xs text-red-500 min-h-11 px-2">End Session</button>
          )}
        </div>
        {/* Row 2: pair meta */}
        <p className="text-xs text-[var(--color-text-dim)]">
          {getConceptLabel(trueConcept)} vs {getConceptLabel(chosenConcept)}
          <span className="ml-2">({coaching.confusionCount} times)</span>
        </p>

        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          {coaching.message}
        </p>

        <div className="p-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]">
          <p className="text-xs font-semibold text-[var(--color-accent)] uppercase tracking-wider mb-1">
            Key Difference
          </p>
          <p className="text-sm text-[var(--color-text)]">
            {coaching.discriminator_tip}
          </p>
        </div>

        <button
          onClick={handleDismiss}
          className="w-full min-h-11 py-2.5 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
