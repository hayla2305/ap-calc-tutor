import { useState, useCallback, useRef, lazy, Suspense } from 'react';
import { v4 as uuid } from 'uuid';
import MathDisplay, { MathBlock } from './MathDisplay';
import useMedia from '../hooks/useMedia';
import {
  updateSolve,
  addAttempt,
  recordActivity,
  getAttempts,
  resolveUid,
} from '../hooks/useStorage';
import problemsRaw from '../data/problems.json';

const MediaRenderer = lazy(() => import('./media/MediaRenderer'));

/**
 * Mode 2 — "Solve It"
 *
 * Step-by-step guided solving. Student works through solution_steps one at a time.
 * Uses its own solve progress (NOT recognition progress).
 */

function selectSolveProblem(concept, problems) {
  // Get recent problem IDs to avoid repetition
  const attempts = getAttempts();
  const recentIds = new Set(
    attempts
      .filter((a) => a.trueConcept === concept && a.mode === 'solve')
      .slice(-6)
      .map((a) => a.problemId)
  );

  // Filter problems that have solution_steps
  let candidates = problems.filter(
    (p) => p.concept === concept && p.solution_steps && p.solution_steps.length > 0
  );

  // Prefer unseen problems
  const unseen = candidates.filter((p) => !recentIds.has(p.id));
  if (unseen.length > 0) candidates = unseen;

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickInitialSolveProblem(scoredConcepts) {
  // Random scored concept with solution steps
  const shuffled = [...scoredConcepts].sort(() => Math.random() - 0.5);
  for (const concept of shuffled) {
    const problem = selectSolveProblem(concept.id, problemsRaw);
    if (problem) return problem;
  }
  return null;
}

export default function Mode2({ concepts, scoredConcepts, onNavigate }) {
  const [problems] = useState(() => problemsRaw);
  const [currentProblem, setCurrentProblem] = useState(() => pickInitialSolveProblem(scoredConcepts));
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [revealedSteps, setRevealedSteps] = useState(new Set());
  const [studentAnswers, setStudentAnswers] = useState({});
  const [completed, setCompleted] = useState(false);
  const startTimeRef = useRef(null);

  // Async media loading for graph-representation problems
  const { media } = useMedia(currentProblem);

  const totalSteps = currentProblem?.solution_steps?.length || 0;

  // Show next step prompt
  const showNextStep = useCallback(() => {
    if (visibleSteps < totalSteps) {
      setVisibleSteps((v) => v + 1);
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      recordActivity();
    }
  }, [visibleSteps, totalSteps]);

  // Reveal the answer for a step
  const revealStep = useCallback((stepIndex) => {
    setRevealedSteps((prev) => new Set([...prev, stepIndex]));
    recordActivity();
  }, []);

  // Handle student typing for a step
  const updateStudentAnswer = useCallback((stepIndex, value) => {
    setStudentAnswers((prev) => ({ ...prev, [stepIndex]: value }));
  }, []);

  // Mark the problem as completed
  const finishProblem = useCallback(() => {
    if (!currentProblem || completed) return;
    setCompleted(true);

    const responseTimeMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    const stepsRevealed = revealedSteps.size;
    const stepsAttempted = Object.keys(studentAnswers).length;

    const attempt = {
      id: uuid(),
      ts: Date.now(),
      mode: 'solve',
      problemId: currentProblem.id,
      trueConcept: currentProblem.concept,
      trueConceptUid: resolveUid(currentProblem.concept),
      totalSteps,
      stepsRevealed,
      stepsAttempted,
      responseTimeMs,
      correct: stepsAttempted > 0,
      firstTry: true,
    };
    addAttempt(attempt);

    // Update solve progress (NOT recognition)
    updateSolve(currentProblem.concept, (solve) => ({
      ...solve,
      correct: solve.correct + (stepsAttempted > 0 ? 1 : 0),
      attempts: solve.attempts + 1,
      lastSeen: Date.now(),
    }));

    recordActivity();
  }, [currentProblem, completed, revealedSteps, studentAnswers, totalSteps]);

  // Load next problem
  const loadNextProblem = useCallback(() => {
    recordActivity();
    const idx = Math.floor(Math.random() * scoredConcepts.length);
    const concept = scoredConcepts[idx].id;
    const problem = selectSolveProblem(concept, problems);
    if (!problem) return;

    setCurrentProblem(problem);
    setVisibleSteps(0);
    setRevealedSteps(new Set());
    setStudentAnswers({});
    setCompleted(false);
    startTimeRef.current = null;
  }, [problems, scoredConcepts]);

  const getConceptLabel = useCallback((conceptId) => {
    const c = concepts.find((x) => x.id === conceptId);
    return c ? c.label : conceptId;
  }, [concepts]);

  if (!currentProblem) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)]">
        No problems with solution steps available.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2 py-1 rounded bg-[var(--color-bg-card)] text-[var(--color-text-dim)]">
            Solve It
          </span>
          <span className="text-xs text-[var(--color-text-dim)]">
            {getConceptLabel(currentProblem.concept)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {onNavigate && (
            <button
              onClick={() => onNavigate('recognition')}
              className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
            >
              Back to Menu
            </button>
          )}
          <button
            onClick={loadNextProblem}
            className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
          >
            Skip
          </button>
        </div>
      </div>

      {/* Problem stem */}
      <div className="card p-4 sm:p-6 mb-6">
        <div className="problem-stem leading-relaxed">
          <MathDisplay text={currentProblem.stem} />
        </div>
      </div>

      {/* Problem media (graphs, etc.) */}
      {media && (
        <Suspense fallback={<div className="card p-4 mb-6 text-center text-sm text-[var(--color-text-dim)]">Loading graph...</div>}>
          <div className="mb-6">
            <MediaRenderer media={media} />
          </div>
        </Suspense>
      )}

      {/* Steps */}
      <div className="space-y-4 mb-6">
        {visibleSteps === 0 && !completed && (
          <div className="text-center">
            <p className="text-sm sm:text-base text-[var(--color-text-dim)] mb-4">
              Work through this problem step by step. Press &ldquo;Show Step&rdquo; to reveal each step.
            </p>
            <button
              onClick={showNextStep}
              className="px-6 py-3 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Start ({totalSteps} steps)
            </button>
          </div>
        )}

        {currentProblem.solution_steps.slice(0, visibleSteps).map((step, i) => (
          <StepCard
            key={i}
            stepNumber={i + 1}
            stepText={step}
            revealed={revealedSteps.has(i)}
            studentAnswer={studentAnswers[i] || ''}
            onReveal={() => revealStep(i)}
            onAnswerChange={(val) => updateStudentAnswer(i, val)}
          />
        ))}

        {visibleSteps > 0 && visibleSteps < totalSteps && !completed && (
          <button
            onClick={showNextStep}
            className="w-full py-3 rounded-lg text-sm font-semibold bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors"
          >
            Next Step ({visibleSteps}/{totalSteps})
          </button>
        )}

        {visibleSteps >= totalSteps && !completed && (
          <div className="space-y-3">
            {/* Final answer */}
            {currentProblem.answer && (
              <div className="card p-3 sm:p-4">
                <p className="text-sm font-medium text-[var(--color-text-dim)] mb-1">Final Answer:</p>
                <div className="text-sm sm:text-base">
                  <MathDisplay text={currentProblem.answer} />
                </div>
              </div>
            )}
            <button
              onClick={finishProblem}
              className="w-full py-3 rounded-lg text-sm font-semibold bg-[var(--color-correct)] text-white hover:opacity-90 transition-opacity"
            >
              Mark Complete
            </button>
          </div>
        )}
      </div>

      {/* Completed state */}
      {completed && (
        <div className="space-y-4">
          <div className="card p-3 sm:p-4 bg-[var(--color-correct-bg)] border-[var(--color-correct)]">
            <p className="text-sm font-semibold text-[var(--color-correct)]">Problem completed</p>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              Steps revealed: {revealedSteps.size}/{totalSteps} | Steps attempted: {Object.keys(studentAnswers).length}/{totalSteps}
            </p>
          </div>
          <button
            onClick={loadNextProblem}
            className="w-full py-3 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Next Problem
          </button>
        </div>
      )}
    </div>
  );
}

function StepCard({ stepNumber, stepText, revealed, studentAnswer, onReveal, onAnswerChange }) {
  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="text-xs font-mono text-[var(--color-text-dim)] mt-1 shrink-0">
          {stepNumber}.
        </span>
        <div className="flex-1">
          {!revealed ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-dim)]">
                Try this step on your own first, then reveal to check.
              </p>
              <textarea
                value={studentAnswer}
                onChange={(e) => onAnswerChange(e.target.value)}
                placeholder="Your work for this step..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] resize-y"
              />
              <button
                onClick={onReveal}
                className="text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
              >
                Reveal Step
              </button>
            </div>
          ) : (
            <div>
              <MathBlock text={stepText} />
              {studentAnswer && (
                <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
                  <p className="text-xs text-[var(--color-text-dim)] mb-1">Your attempt:</p>
                  <p className="text-sm text-[var(--color-text)]">{studentAnswer}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
