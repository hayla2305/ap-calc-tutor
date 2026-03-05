import { useState, useCallback, useRef, useEffect } from 'react';
import MathDisplay from './MathDisplay';
import useTutor from '../hooks/useTutor';

/**
 * TutorShell — Container that renders as a mobile bottom sheet (< sm)
 * or desktop side panel (sm+).
 *
 * Mobile: 55dvh bottom sheet with slide-up animation + drag handle.
 * Desktop: full-height side panel (unchanged from before).
 */
function TutorShell({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  return (
    <>
      {/* Mobile bottom sheet (< sm) */}
      <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/30" />
        {/* Sheet */}
        <div
          className={`relative h-[55dvh] bg-[var(--color-bg)] rounded-t-2xl flex flex-col transition-transform duration-300 ease-out ${
            mounted ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{
            paddingLeft: 'max(1rem, env(safe-area-inset-left))',
            paddingRight: 'max(1rem, env(safe-area-inset-right))',
            paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-[var(--color-border)]" />
          </div>
          {children}
        </div>
      </div>

      {/* Desktop/tablet panel (sm+) */}
      <div className="hidden sm:flex fixed inset-0 z-50 bg-black/50 lg:bg-transparent lg:left-auto lg:w-[35%] lg:max-w-[420px] lg:right-0 lg:top-0 lg:h-[100dvh] items-stretch lg:justify-end">
        <div
          className="w-full bg-[var(--color-bg)] flex flex-col h-[100dvh] lg:border-l lg:border-[var(--color-border)]"
          style={{
            paddingLeft: 'max(1rem, env(safe-area-inset-left))',
            paddingRight: 'max(1rem, env(safe-area-inset-right))',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * TutorChat — AI-assisted concept recognition coaching.
 *
 * After conversation ends (student clicks End or hits turn 10),
 * shows exit ticket: cue re-assessment + technique picker.
 */
export default function TutorChat({
  problem,
  selectedTechnique,
  concepts,
  confusionHistory,
  onClose,
  onExitTicketComplete,
  onEndSession,
}) {
  const tutor = useTutor();
  const [input, setInput] = useState('');
  const [showExitTicket, setShowExitTicket] = useState(false);
  const [exitCues, setExitCues] = useState(['', '']);
  const [exitTechnique, setExitTechnique] = useState(null);
  const [exitSubmitted, setExitSubmitted] = useState(false);
  const messagesEndRef = useRef(null);
  const initRef = useRef(false);

  // Initialize conversation on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const context = {
      problemId: problem.id,
      stem: problem.stem,
      concept: problem.concept,
      disguise_level: problem.disguise_level,
      cue_tokens: problem.cue_tokens,
      common_misidentification: problem.common_misidentification,
      selectedTechnique,
      confusionHistory: confusionHistory || [],
    };

    // Don't include solution_steps or answer — server decides when to include
    tutor.initConversation(problem.id, context);
  }, [problem, selectedTechnique, confusionHistory, tutor]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tutor.messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    tutor.sendMessage(text);
  }, [input, tutor]);

  const handleEnd = useCallback(() => {
    tutor.endConversation();
    setShowExitTicket(true);
  }, [tutor]);

  const handleExitTicketSubmit = useCallback(() => {
    const cueCorrect = exitCues.some((c) => {
      const lower = c.toLowerCase().trim();
      return problem.cue_tokens?.some((t) => t.toLowerCase().includes(lower) || lower.includes(t.toLowerCase()));
    });
    const techCorrect = exitTechnique === problem.correct_technique;

    let outcome = 'still_confused';
    if (cueCorrect && techCorrect) outcome = 'resolved_cue';
    else if (cueCorrect || techCorrect) outcome = 'partial';

    setExitSubmitted(true);

    onExitTicketComplete?.({
      postTutorCueCorrect: cueCorrect,
      postTutorTechniqueCorrect: techCorrect,
      tutorUsed: true,
      tutorTurns: tutor.turnIndex,
      tutorOutcome: outcome,
    });
  }, [exitCues, exitTechnique, problem, tutor.turnIndex, onExitTicketComplete]);

  const getConceptLabel = useCallback((id) => {
    const c = concepts?.find((x) => x.id === id);
    return c ? c.label : id;
  }, [concepts]);

  // Derive exit ticket visibility
  const shouldShowExitTicket = showExitTicket || (tutor.conversationEnded && tutor.messages.length > 0);

  if (shouldShowExitTicket) {

    return (
      <TutorShell>
        <div className="px-3 py-3 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold">Exit Ticket</h3>
          <div className="flex items-center gap-3">
            {onEndSession && (
              <button onClick={onEndSession} className="text-xs text-red-500 min-h-11 px-2">
                End Session
              </button>
            )}
            {exitSubmitted && (
              <button onClick={onClose} className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)] min-h-11 px-2">
                Close
              </button>
            )}
          </div>
        </div>

        {!exitSubmitted ? (
          <div className="px-3 py-4 space-y-6 flex-1 overflow-y-auto">
            <p className="text-sm text-[var(--color-text-dim)]">
              Now let's check your understanding. Answer these based on what you learned.
            </p>

            {/* Cue re-assessment */}
            <div>
              <p className="text-sm font-medium mb-2">What are the recognition cues? (Enter 2)</p>
              <div className="space-y-2">
                {exitCues.map((cue, i) => (
                  <input
                    key={i}
                    type="text"
                    value={cue}
                    onChange={(e) => setExitCues((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })}
                    placeholder={`Cue ${i + 1}`}
                    className="w-full px-3 py-2 rounded-lg text-sm min-h-11 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                ))}
              </div>
            </div>

            {/* Technique picker */}
            <div>
              <p className="text-sm font-medium mb-2">Which technique does this problem require?</p>
              <div className="grid grid-cols-1 gap-2">
                {problem.technique_options?.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setExitTechnique(opt)}
                    className={`card p-3 min-h-11 text-left text-sm transition-colors ${
                      exitTechnique === opt
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                        : 'hover:border-[var(--color-accent)]'
                    }`}
                  >
                    {getConceptLabel(opt)}
                  </button>
                )) || (
                  <input
                    type="text"
                    value={exitTechnique || ''}
                    onChange={(e) => setExitTechnique(e.target.value)}
                    placeholder="Type the technique..."
                    className="w-full px-3 py-2 rounded-lg text-sm min-h-11 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                )}
              </div>
            </div>

            <button
              onClick={handleExitTicketSubmit}
              disabled={!exitCues[0].trim() || !exitCues[1].trim() || !exitTechnique}
              className="w-full min-h-11 py-3 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        ) : (
          <div className="px-3 py-4 space-y-4 flex-1">
            <div className="card p-4">
              <p className="text-sm font-medium text-[var(--color-correct)]">Exit ticket submitted</p>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                Your tutor session has been recorded.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full min-h-11 py-3 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Continue
            </button>
          </div>
        )}
      </TutorShell>
    );
  }

  return (
    <TutorShell>
      {/* Header */}
      <div className="px-3 py-3 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-semibold">AI Tutor</h3>
          <p className="text-xs text-[var(--color-text-dim)]">
            Turn {tutor.turnIndex}/{tutor.maxTurns}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onEndSession && (
            <button onClick={onEndSession} className="text-xs text-red-500 min-h-11 px-2">
              End Session
            </button>
          )}
          <button
            onClick={handleEnd}
            className="text-xs text-[var(--color-wrong)] hover:opacity-80 transition-opacity min-h-11 px-2"
          >
            End conversation
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {tutor.messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'student'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-bg-card)] border border-[var(--color-border)]'
              }`}
            >
              {msg.role === 'tutor' ? (
                <MathDisplay text={msg.text} />
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
        {tutor.loading && (
          <div className="flex justify-start">
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-dim)]">
              Thinking...
            </div>
          </div>
        )}
        {tutor.error && (
          <div className="text-sm text-[var(--color-wrong)] p-2">
            {tutor.error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pt-3 pb-1 border-t border-[var(--color-border)] shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={tutor.loading || tutor.conversationEnded || tutor.turnIndex >= tutor.maxTurns}
            placeholder={
              tutor.turnIndex >= tutor.maxTurns
                ? 'Turn limit reached'
                : 'Type your response...'
            }
            className="flex-1 px-3 py-2 rounded-lg text-sm min-h-11 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={tutor.loading || !input.trim() || tutor.conversationEnded || tutor.turnIndex >= tutor.maxTurns}
            className="px-4 py-2 rounded-lg text-sm font-medium min-h-11 bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </TutorShell>
  );
}
