import { useState, useCallback, useMemo, useRef, useEffect, lazy, Suspense } from 'react';
import { v4 as uuid } from 'uuid';
import MathDisplay, { MathBlock } from './MathDisplay';
import useMedia from '../hooks/useMedia';
import {
  updateRecognition,
  addAttempt,
  incrementConfusion,
  recordActivity,
} from '../hooks/useStorage';
import { validateCues, extractCueChips } from '../utils/cueValidation';
import { buildTechniqueOptions, getDistractorExplanation } from '../utils/confusion';
import { selectProblem, applyAdaptive, shouldInterleave, getMasteredConceptForReview, buildConfusionDrill } from '../utils/difficulty';
import TutorChat from './TutorChat';
import CoachingCard from './CoachingCard';
import { getConfusionPairs } from '../utils/confusion';

const MediaRenderer = lazy(() => import('./media/MediaRenderer'));

// Dynamically import all problem files and merge
import problemsRaw from '../data/problems.json';

const PHASES = {
  CUE_SELECT: 'cue_select',
  CONFIDENCE: 'confidence',
  TECHNIQUE: 'technique',
  RESULT: 'result',
};

// Pick the first problem eagerly so we don't need a setState-in-effect
function pickInitialProblem(scoredConcepts) {
  const idx = Math.floor(Math.random() * scoredConcepts.length);
  const concept = scoredConcepts[idx].id;
  return selectProblem(concept, problemsRaw) || null;
}

export default function Mode1({ concepts, scoredConcepts, onEndSession, pushOverlayState }) {
  const [problems] = useState(() => problemsRaw);
  const [currentProblem, setCurrentProblem] = useState(() => pickInitialProblem(scoredConcepts));
  const [phase, setPhase] = useState(PHASES.CUE_SELECT);
  const [selectedCues, setSelectedCues] = useState([]);
  const [cueError, setCueError] = useState(null);
  const [cueHintShown, setCueHintShown] = useState(false);
  const cueMatchPassedRef = useRef(true);
  const [confidence, setConfidence] = useState(null);
  const [techniqueOptions, setTechniqueOptions] = useState([]);
  const [selectedTechnique, setSelectedTechnique] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isFirstTry, setIsFirstTry] = useState(true);
  const [showSolution, setShowSolution] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [targetConcept, setTargetConcept] = useState(null);
  const [showTutor, setShowTutor] = useState(false);
  const [showCoaching, setShowCoaching] = useState(false);
  const [tutorBlocked, setTutorBlocked] = useState(false);
  const [exitTicketPending, setExitTicketPending] = useState(false);
  const consecutiveTutorRef = useRef(0);
  const tutorUsedThisProblemRef = useRef(false);
  const drillQueueRef = useRef([]);
  const startTimeRef = useRef(null);

  // Async media loading for graph-representation problems
  const { media } = useMedia(currentProblem);

  // Listen for close-overlays event from browser back
  useEffect(() => {
    const handleCloseOverlays = () => {
      setShowTutor(false);
      setShowCoaching(false);
    };
    window.addEventListener('apcalc:close-overlays', handleCloseOverlays);
    return () => window.removeEventListener('apcalc:close-overlays', handleCloseOverlays);
  }, []);

  const loadNextProblem = useCallback((forceConcept = null) => {
    recordActivity();
    // Check drill queue first
    if (!forceConcept && drillQueueRef.current.length > 0) {
      const drillProblem = drillQueueRef.current.shift();
      setTargetConcept(drillProblem.concept);
      setCurrentProblem(drillProblem);
      setPhase(PHASES.CUE_SELECT);
      setSelectedCues([]);
      setCueError(null);
      setCueHintShown(false);
      cueMatchPassedRef.current = true;
      setConfidence(null);
      setTechniqueOptions([]);
      setSelectedTechnique(null);
      setIsCorrect(null);
      setIsFirstTry(true);
      setShowSolution(false);
      setVisibleSteps(0);
      setShowTutor(false);
      setExitTicketPending(false);
      tutorUsedThisProblemRef.current = false;
      startTimeRef.current = Date.now();
      return;
    }

    let concept = forceConcept;

    // Check for interleaved review
    if (!concept && shouldInterleave(questionCount)) {
      const reviewConcept = getMasteredConceptForReview(
        targetConcept,
        scoredConcepts
      );
      if (reviewConcept) concept = reviewConcept;
    }

    // Default: pick a random scored concept if none specified
    if (!concept) {
      const idx = Math.floor(Math.random() * scoredConcepts.length);
      concept = scoredConcepts[idx].id;
    }

    const problem = selectProblem(concept, problems);
    if (!problem) return;

    setTargetConcept(concept);
    setCurrentProblem(problem);
    setPhase(PHASES.CUE_SELECT);
    setSelectedCues([]);
    setCueError(null);
    setCueHintShown(false);
    cueMatchPassedRef.current = true;
    setConfidence(null);
    setTechniqueOptions([]);
    setSelectedTechnique(null);
    setIsCorrect(null);
    setIsFirstTry(true);
    setShowSolution(false);
    setVisibleSteps(0);
    setShowTutor(false);
    setExitTicketPending(false);
    tutorUsedThisProblemRef.current = false;
    startTimeRef.current = Date.now();
  }, [problems, scoredConcepts, questionCount, targetConcept]);

  // Toggle a cue chip
  const toggleCue = useCallback((cue) => {
    setSelectedCues((prev) => {
      if (prev.includes(cue)) return prev.filter((c) => c !== cue);
      return [...prev, cue];
    });
    setCueError(null);
    recordActivity();
  }, []);

  // Submit cues for validation
  const submitCues = useCallback(() => {
    if (!currentProblem) return;
    if (selectedCues.length === 0) {
      setCueError('Select at least one recognition cue before continuing.');
      return;
    }

    const result = validateCues(selectedCues, currentProblem, problems);
    if (!result.valid) {
      if (cueHintShown) {
        // Second attempt — advance anyway, record cue mismatch
        cueMatchPassedRef.current = false;
        setCueError(null);
        setPhase(PHASES.CONFIDENCE);
        recordActivity();
        return;
      }
      // First attempt — show hint, block advancement
      setCueError(result.feedback);
      setCueHintShown(true);
      return;
    }

    cueMatchPassedRef.current = true;
    setCueError(null);
    setPhase(PHASES.CONFIDENCE);
    recordActivity();
  }, [selectedCues, currentProblem, problems, cueHintShown]);

  // Set confidence and show technique options
  const submitConfidence = useCallback((level) => {
    setConfidence(level);
    // Build technique options
    const options = buildTechniqueOptions(currentProblem, problems, concepts);
    setTechniqueOptions(options);
    setPhase(PHASES.TECHNIQUE);
    recordActivity();
  }, [currentProblem, problems, concepts]);

  // Select technique — first answer is locked
  const submitTechnique = useCallback((technique) => {
    if (selectedTechnique !== null) return; // Already locked

    setSelectedTechnique(technique);
    const correct = technique === currentProblem.correct_technique;
    setIsCorrect(correct);
    setPhase(PHASES.RESULT);

    const responseTimeMs = Date.now() - startTimeRef.current;

    // Record attempt
    const attempt = {
      id: uuid(),
      ts: Date.now(),
      mode: 'recognition',
      problemId: currentProblem.id,
      trueConcept: currentProblem.concept,
      chosenConcept: technique,
      disguiseLevel: currentProblem.disguise_level,
      firstTry: isFirstTry,
      correct,
      responseTimeMs,
      confidence,
      cuesSelected: selectedCues,
      cueMatchPassed: cueMatchPassedRef.current,
    };
    addAttempt(attempt);

    // Update progress — recognition mode
    updateRecognition(currentProblem.concept, (rec) => {
      const newRec = { ...rec };
      newRec.attempts += 1;
      newRec.lastSeen = Date.now();

      if (correct) {
        newRec.correct += 1;
        newRec.streak += 1;
      } else {
        newRec.streak = 0;
      }

      // Track first-try data by level
      if (isFirstTry) {
        const level = currentProblem.disguise_level;
        const levelData = newRec.firstTriesByLevel[level] || { correct: 0, total: 0 };
        levelData.total += 1;
        if (correct) levelData.correct += 1;
        newRec.firstTriesByLevel = { ...newRec.firstTriesByLevel, [level]: levelData };
      }

      return newRec;
    });

    // Update confusion counter: ONLY on mode=recognition, firstTry=true, correct=false
    if (isFirstTry && !correct && technique) {
      incrementConfusion(currentProblem.concept, technique);
      // Trigger coaching card check
      pushOverlayState?.();
      setShowCoaching(true);
    }

    // Apply adaptive difficulty + inject drill on remediation
    if (isFirstTry) {
      const adaptiveResult = applyAdaptive(currentProblem.concept);
      if (adaptiveResult.action === 'remediate' && adaptiveResult.confusionPair) {
        const drill = buildConfusionDrill(
          currentProblem.concept,
          adaptiveResult.confusionPair,
          problems
        );
        if (drill.length > 0) {
          drillQueueRef.current = drill;
        }
      }
    }

    // Dependency guard: correct answer WITHOUT tutor resets consecutive counter
    if (correct && !tutorUsedThisProblemRef.current) {
      consecutiveTutorRef.current = 0;
      setTutorBlocked(false);
    }

    recordActivity();
    setQuestionCount((n) => n + 1);
  }, [selectedTechnique, currentProblem, isFirstTry, confidence, selectedCues, problems, pushOverlayState]);

  // Retry (practice only — not scored toward mastery)
  const handleRetry = useCallback(() => {
    setSelectedTechnique(null);
    setIsCorrect(null);
    setIsFirstTry(false);
    setPhase(PHASES.TECHNIQUE);
    recordActivity();
  }, []);

  // Open tutor chat — increment dependency guard on open, not exit
  const handleOpenTutor = useCallback(() => {
    if (tutorBlocked) return;
    pushOverlayState?.();
    setShowTutor(true);
    setExitTicketPending(true);
    tutorUsedThisProblemRef.current = true;
    consecutiveTutorRef.current += 1;
    if (consecutiveTutorRef.current >= 3) {
      setTutorBlocked(true);
    }
    recordActivity();
  }, [tutorBlocked, pushOverlayState]);

  // Handle exit ticket from tutor
  const handleExitTicketComplete = useCallback((result) => {
    // Record exit ticket in the attempt log
    addAttempt({
      id: uuid(),
      ts: Date.now(),
      mode: 'recognition',
      problemId: currentProblem?.id,
      trueConcept: currentProblem?.concept,
      isExitTicket: true,
      ...result,
    });

    setExitTicketPending(false);
    recordActivity();
  }, [currentProblem]);

  // Get confusion history for current concept
  const confusionHistory = useMemo(() => {
    if (!currentProblem) return [];
    return getConfusionPairs(currentProblem.concept).slice(0, 3);
  }, [currentProblem]);

  // Extract cue chips from problem
  const cueChips = useMemo(() => {
    if (!currentProblem) return [];
    return extractCueChips(currentProblem, problems);
  }, [currentProblem, problems]);

  // Get concept label
  const getConceptLabel = useCallback((conceptId) => {
    const c = concepts.find((x) => x.id === conceptId);
    return c ? c.label : conceptId;
  }, [concepts]);

  if (!currentProblem) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)]">
        Loading problems...
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-6${showTutor ? ' lg:mr-[420px]' : ''}`}>
      {/* Problem header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2 py-1 rounded bg-[var(--color-bg-card)] text-[var(--color-text-dim)]">
            L{currentProblem.disguise_level}
          </span>
          <span className="text-xs text-[var(--color-text-dim)]">
            #{questionCount + 1}
          </span>
        </div>
        <button
          onClick={() => loadNextProblem()}
          className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
        >
          Skip
        </button>
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

      {/* Phase: Cue Selection */}
      {phase === PHASES.CUE_SELECT && (
        <CueSelection
          cueChips={cueChips}
          selectedCues={selectedCues}
          toggleCue={toggleCue}
          submitCues={submitCues}
          cueError={cueError}
        />
      )}

      {/* Phase: Confidence Rating */}
      {phase === PHASES.CONFIDENCE && (
        <ConfidenceRating onSelect={submitConfidence} selectedCues={selectedCues} />
      )}

      {/* Phase: Technique Selection */}
      {phase === PHASES.TECHNIQUE && (
        <TechniqueSelection
          options={techniqueOptions}
          getConceptLabel={getConceptLabel}
          onSelect={submitTechnique}
          locked={selectedTechnique !== null}
        />
      )}

      {/* Phase: Result */}
      {phase === PHASES.RESULT && (
        <ResultDisplay
          problem={currentProblem}
          isCorrect={isCorrect}
          selectedTechnique={selectedTechnique}
          isFirstTry={isFirstTry}
          getConceptLabel={getConceptLabel}
          onRetry={handleRetry}
          onNext={() => loadNextProblem()}
          showSolution={showSolution}
          setShowSolution={setShowSolution}
          visibleSteps={visibleSteps}
          setVisibleSteps={setVisibleSteps}
          onOpenTutor={handleOpenTutor}
          tutorBlocked={tutorBlocked}
          exitTicketPending={exitTicketPending}
        />
      )}

      {/* Tutor Chat overlay */}
      {showTutor && currentProblem && (
        <TutorChat
          problem={currentProblem}
          selectedTechnique={selectedTechnique}
          concepts={concepts}
          confusionHistory={confusionHistory}
          onClose={() => setShowTutor(false)}
          onExitTicketComplete={handleExitTicketComplete}
          onEndSession={onEndSession}
        />
      )}

      {/* Coaching Card overlay */}
      {showCoaching && !isCorrect && selectedTechnique && (
        <CoachingCard
          trueConcept={currentProblem.concept}
          chosenConcept={selectedTechnique}
          getConceptLabel={getConceptLabel}
          onEndSession={onEndSession}
          onDismiss={() => setShowCoaching(false)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───

function CueSelection({
  cueChips,
  selectedCues,
  toggleCue,
  submitCues,
  cueError,
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          Step 1: Identify Recognition Cues
        </h3>
        <p className="text-sm text-[var(--color-text-dim)] mb-3">
          What signals in this problem tell you which technique to use? Tap the cues that apply to this problem.
        </p>
      </div>

      {/* Cue chips — tap to toggle */}
      <div className="flex flex-wrap gap-2">
        {cueChips.map((chip) => (
          <button
            key={chip}
            onClick={() => toggleCue(chip)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors border ${
              selectedCues.includes(chip)
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Error feedback */}
      {cueError && (
        <div className="p-3 rounded-lg bg-[var(--color-wrong-bg)] text-[var(--color-wrong)] text-sm">
          {cueError}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={submitCues}
        disabled={selectedCues.length === 0}
        className="w-full min-h-11 py-3 rounded-lg text-sm font-semibold transition-colors bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Confirm Cues ({selectedCues.length})
      </button>
    </div>
  );
}

function ConfidenceRating({ onSelect, selectedCues }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          Step 2: Rate Your Confidence
        </h3>
        <p className="text-sm text-[var(--color-text-dim)] mb-1">
          Your cues: <span className="text-[var(--color-text)]">{selectedCues.join(', ')}</span>
        </p>
        <p className="text-sm text-[var(--color-text-dim)]">
          How confident are you that you know the right technique?
        </p>
      </div>

      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { value: 'high', label: 'High', desc: 'I know exactly what to do' },
          { value: 'med', label: 'Medium', desc: 'I have a strong guess' },
          { value: 'low', label: 'Low', desc: 'I\'m not sure' },
        ].map(({ value, label, desc }) => (
          <button
            key={value}
            onClick={() => onSelect(value)}
            className="card p-4 min-h-11 text-center hover:border-[var(--color-accent)] transition-colors cursor-pointer"
          >
            <div className="text-base font-semibold mb-1">{label}</div>
            <div className="text-xs text-[var(--color-text-dim)]">{desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TechniqueSelection({ options, getConceptLabel, onSelect, locked }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
          Step 3: Choose the Technique
        </h3>
        <p className="text-sm text-[var(--color-text-dim)]">
          Which technique does this problem require? Your first answer is locked.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            disabled={locked}
            className="card p-4 text-left hover:border-[var(--color-accent)] transition-colors cursor-pointer disabled:cursor-not-allowed min-h-[3.5rem] flex items-center"
          >
            <span className="text-sm font-medium">{getConceptLabel(option)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultDisplay({
  problem,
  isCorrect,
  selectedTechnique,
  isFirstTry,
  getConceptLabel,
  onRetry,
  onNext,
  showSolution,
  setShowSolution,
  visibleSteps,
  setVisibleSteps,
  onOpenTutor,
  tutorBlocked,
  exitTicketPending,
}) {
  const distractor = !isCorrect
    ? getDistractorExplanation(problem, selectedTechnique)
    : null;

  return (
    <div className="space-y-4">
      {/* Result banner */}
      <div
        className={`p-4 rounded-lg ${
          isCorrect
            ? 'bg-[var(--color-correct-bg)] border border-[var(--color-correct)]'
            : 'bg-[var(--color-wrong-bg)] border border-[var(--color-wrong)]'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-lg font-bold ${isCorrect ? 'text-[var(--color-correct)]' : 'text-[var(--color-wrong)]'}`}>
            {isCorrect ? 'Correct' : 'Not quite'}
          </span>
          {!isFirstTry && (
            <span className="text-xs text-[var(--color-text-dim)]">(practice attempt — not scored)</span>
          )}
        </div>

        {isCorrect ? (
          <p className="text-sm text-[var(--color-text)]">
            <MathDisplay text={problem.recognition_cue} />
          </p>
        ) : (
          <div className="space-y-3">
            {/* Why chosen is wrong */}
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-1">
                You chose: {getConceptLabel(selectedTechnique)}
              </p>
              {distractor && (
                <>
                  <p className="text-sm text-[var(--color-text-dim)]">
                    <strong>Why tempting:</strong> {distractor.why_tempting}
                  </p>
                  <p className="text-sm text-[var(--color-text-dim)]">
                    <strong>Why wrong:</strong> {distractor.why_wrong}
                  </p>
                </>
              )}
            </div>

            {/* Correct answer */}
            <div>
              <p className="text-sm font-medium text-[var(--color-correct)]">
                Correct technique: {getConceptLabel(problem.correct_technique)}
              </p>
              <p className="text-sm text-[var(--color-text)]">
                <MathDisplay text={problem.recognition_cue} />
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Solution walkthrough */}
      {problem.solution_steps && problem.solution_steps.length > 0 && (
        <div className="card p-3 sm:p-4">
          <button
            onClick={() => setShowSolution(!showSolution)}
            className="text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
          >
            {showSolution ? 'Hide Solution' : 'Show Solution Path'}
          </button>

          {showSolution && (
            <div className="mt-3 space-y-2">
              {problem.solution_steps.slice(0, visibleSteps || 1).map((step, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-[var(--color-text-dim)] font-mono text-xs mt-0.5 shrink-0">
                    {i + 1}.
                  </span>
                  <MathBlock text={step} />
                </div>
              ))}

              {(visibleSteps || 1) < problem.solution_steps.length && (
                <button
                  onClick={() => setVisibleSteps((v) => (v || 1) + 1)}
                  className="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors mt-2"
                >
                  Show next step
                </button>
              )}

              {/* Answer */}
              {(visibleSteps || 1) >= problem.solution_steps.length && (
                <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    Answer: <MathDisplay text={problem.answer} />
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tutor button — shown after wrong answers */}
      {!isCorrect && onOpenTutor && (
        <div>
          <button
            onClick={onOpenTutor}
            disabled={tutorBlocked}
            className="w-full min-h-11 py-3 rounded-lg text-sm font-semibold transition-colors border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {tutorBlocked ? 'Tutor locked — answer one correctly first' : 'Talk it through?'}
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {!isCorrect && (
          <button
            onClick={onRetry}
            className="flex-1 min-h-11 py-3 rounded-lg text-sm font-semibold bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors"
          >
            Try Again (practice)
          </button>
        )}
        <button
          onClick={onNext}
          disabled={exitTicketPending}
          className="flex-1 min-h-11 py-3 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exitTicketPending ? 'Complete exit ticket first' : 'Next Problem'}
        </button>
      </div>
    </div>
  );
}
