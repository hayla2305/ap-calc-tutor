import { useState, useEffect, useCallback, useRef } from 'react';
import { setConceptIds, setConceptUids, setIdToUidMap, runStorageMigrationV2, getSettings, setSettings, isStoragePersistent, recordActivity } from './hooks/useStorage';
import useSession from './hooks/useSession';
import conceptsData from './data/concepts.json';
import Mode1 from './components/Mode1';
import Mode2 from './components/Mode2';
import Mode3 from './components/Mode3';
import MediaTestHarness from './components/media/MediaTestHarness';

const scoredConcepts = conceptsData.filter((c) => c.scored);
const conceptIds = conceptsData.map((c) => c.id);
const conceptUids = conceptsData.map((c) => c.uid);

// Initialize UID resolution map (must come before migration)
setIdToUidMap(conceptsData);

// Run storage migration v1→v2 (idempotent, non-blocking)
runStorageMigrationV2(conceptsData);

// Register concept IDs and UIDs for confusion tracking
setConceptIds(conceptIds);
setConceptUids(conceptUids);

// Dev-only: #media-test hash shows the media test harness
const IS_MEDIA_TEST = typeof window !== 'undefined' && window.location.hash === '#media-test';

export default function App() {
  if (IS_MEDIA_TEST) {
    return (
      <div className="min-h-screen flex flex-col">
        <MediaTestHarness />
      </div>
    );
  }

  return <AppMain />;
}

function AppMain() {
  const [mode, setMode] = useState('recognition');
  const [settings, setSettingsState] = useState(() => getSettings());
  const [storageWarning, setStorageWarning] = useState(() => !isStoragePersistent());
  const session = useSession();

  // ── In-app history management ──
  const historyStackRef = useRef([]);
  const isPopRef = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);

  // Push initial state on mount
  useEffect(() => {
    window.history.replaceState({ appMode: 'recognition', overlay: null }, '');
  }, []);

  // Listen for browser back/forward
  useEffect(() => {
    const handlePop = (e) => {
      const state = e.state;
      if (state && state.appMode) {
        isPopRef.current = true;
        const popped = historyStackRef.current.pop();
        // When closing an overlay (popped entry is overlay), keep the back
        // button visible if there are any remaining entries in the stack.
        // When navigating back between modes, update normally.
        // Key rule: closing overlays must never hide the back button
        // unless the stack is truly empty.
        const hasModeEntries = historyStackRef.current.some((entry) => entry.overlay === null);
        if (popped?.overlay === 'open') {
          // Overlay closed — back button stays if any mode entries remain
          setCanGoBack(hasModeEntries);
        } else {
          setCanGoBack(historyStackRef.current.length > 0);
        }
        setMode(state.appMode);
        // Dispatch a custom event so Mode1 can close overlays
        if (state.overlay === null) {
          window.dispatchEvent(new CustomEvent('apcalc:close-overlays'));
        }
        // Let React settle, then reset the flag
        setTimeout(() => { isPopRef.current = false; }, 0);
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Wrapped setMode that pushes history
  const navigateMode = useCallback((newMode) => {
    if (isPopRef.current) return; // Already handled by popstate
    historyStackRef.current.push({ appMode: mode, overlay: null });
    setCanGoBack(true);
    window.history.pushState({ appMode: newMode, overlay: null }, '');
    setMode(newMode);
    recordActivity();
  }, [mode]);

  // Called by child overlays (tutor/coaching) to push overlay state
  const pushOverlayState = useCallback(() => {
    historyStackRef.current.push({ appMode: mode, overlay: 'open' });
    setCanGoBack(true);
    window.history.pushState({ appMode: mode, overlay: 'open' }, '');
  }, [mode]);

  // In-app back button handler
  const handleBack = useCallback(() => {
    if (historyStackRef.current.length > 0) {
      window.history.back();
    }
  }, []);

  useEffect(() => {
    const onFail = () => setStorageWarning(true);
    window.addEventListener('apcalc:storage-write-failed', onFail);
    return () => window.removeEventListener('apcalc:storage-write-failed', onFail);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('light', settings.theme === 'light');
  }, [settings.theme]);

  const toggleTheme = useCallback(() => {
    setSettingsState((prev) => {
      const next = { ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' };
      setSettings(next);
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {storageWarning && (
        <div className="bg-[var(--color-warning-bg)] text-[var(--color-warning)] text-center py-2 px-4 text-sm font-medium">
          Progress not saving — storage unavailable. Your work this session will be lost on refresh.
        </div>
      )}

      <header className="border-b border-[var(--color-border)]">
        {/* Row 1: logo + actions */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {canGoBack && (
              <button
                onClick={handleBack}
                className="p-2 -ml-2 rounded-lg hover:bg-[var(--color-bg-card)] transition-colors text-[var(--color-text-dim)]"
                aria-label="Go back"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h1 className="text-lg font-semibold tracking-tight">AP Calc AB</h1>
            <span className="hidden sm:inline text-xs text-[var(--color-text-dim)] font-medium uppercase tracking-wider">
              Concept Recognition
            </span>
          </div>

          <div className="flex items-center gap-2">
            {session.active && (
              <button
                onClick={session.endSession}
                className="text-[var(--color-text-dim)] hover:text-[var(--color-wrong)] transition-colors mr-1 p-2 rounded-lg"
                aria-label="End Session"
              >
                {/* X-circle icon on mobile, full text on sm+ */}
                <svg className="sm:hidden w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M15 9l-6 6M9 9l6 6" />
                </svg>
                <span className="hidden sm:inline text-xs">End Session</span>
              </button>
            )}

            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-[var(--color-bg-card)] transition-colors text-[var(--color-text-dim)]"
              aria-label="Toggle theme"
            >
              {settings.theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Row 2: mode tabs */}
        <nav className="grid grid-cols-3 px-2 pb-2 sm:flex sm:gap-1 sm:px-4 sm:pb-3">
          <ModeTab
            active={mode === 'recognition'}
            onClick={() => navigateMode('recognition')}
            label="What's the Play?"
            shortLabel="Recognize"
          />
          <ModeTab
            active={mode === 'solve'}
            onClick={() => navigateMode('solve')}
            label="Solve It"
            shortLabel="Solve"
          />
          <ModeTab
            active={mode === 'map'}
            onClick={() => navigateMode('map')}
            label="Concept Map"
            shortLabel="Map"
          />
        </nav>
      </header>

      <main className="flex-1 flex flex-col">
        {!session.active && session.summary ? (
          <SessionSummary summary={session.summary} onNewSession={session.startNewSession} />
        ) : (
          <>
            {mode === 'recognition' && (
              <Mode1
                concepts={conceptsData}
                scoredConcepts={scoredConcepts}
                onEndSession={session.endSession}
                pushOverlayState={pushOverlayState}
              />
            )}
            {mode === 'solve' && (
              <Mode2
                concepts={conceptsData}
                scoredConcepts={scoredConcepts}
                onNavigate={navigateMode}
              />
            )}
            {mode === 'map' && (
              <Mode3
                concepts={conceptsData}
                onDrillConcept={() => {
                  navigateMode('recognition');
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SessionSummary({ summary, onNewSession }) {
  const minutes = Math.round(summary.durationMs / 60_000);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-6 space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-1">Session Complete</h2>
          <p className="text-sm text-[var(--color-text-dim)]">
            {minutes} min study session
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 rounded-lg bg-[var(--color-bg)]">
            <p className="text-2xl font-bold">{summary.totalQuestions}</p>
            <p className="text-xs text-[var(--color-text-dim)]">Questions</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-[var(--color-bg)]">
            <p className="text-2xl font-bold">{summary.firstTryAccuracy}%</p>
            <p className="text-xs text-[var(--color-text-dim)]">First-try Accuracy</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-[var(--color-bg)]">
            <p className="text-2xl font-bold">{summary.solveProblems}</p>
            <p className="text-xs text-[var(--color-text-dim)]">Solve Problems</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-[var(--color-bg)]">
            <p className="text-2xl font-bold">{summary.tutorUses}</p>
            <p className="text-xs text-[var(--color-text-dim)]">Tutor Uses</p>
          </div>
        </div>

        <button
          onClick={onNewSession}
          className="w-full py-3 rounded-lg text-sm font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          Start New Session
        </button>
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, label, shortLabel, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors text-center min-h-11 sm:min-h-0 ${
        active
          ? 'bg-[var(--color-accent)] text-white'
          : disabled
          ? 'text-[var(--color-text-dim)] opacity-40 cursor-not-allowed'
          : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-card)]'
      }`}
    >
      <span className="sm:hidden">{shortLabel || label}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
