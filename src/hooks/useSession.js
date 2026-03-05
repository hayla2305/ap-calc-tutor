import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import {
  addSession,
  getAttempts,
  getLastInteractionTs,
  recordActivity,
} from './useStorage';
import { resetCoachingSession } from '../utils/coaching';

const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

/**
 * useSession hook — manages study session lifecycle.
 *
 * Auto-starts a session on mount. Ends on:
 *   - User clicks "End Session"
 *   - 20 minutes of inactivity
 *
 * Returns session state + controls.
 */
export default function useSession() {
  const [active, setActive] = useState(true);
  const [summary, setSummary] = useState(null);
  const sessionIdRef = useRef(null);
  const startTsRef = useRef(null);
  const startAttemptsRef = useRef(null);
  const timerRef = useRef(null);

  // Initialize refs on mount (avoids impure calls during render)
  useEffect(() => {
    if (sessionIdRef.current === null) {
      sessionIdRef.current = uuid();
      startTsRef.current = Date.now();
      startAttemptsRef.current = getAttempts().length;
      recordActivity();
      resetCoachingSession();
    }
  }, []);

  // Build summary from attempts made during this session
  const buildSummary = useCallback(() => {
    const allAttempts = getAttempts();
    const sessionAttempts = allAttempts.slice(startAttemptsRef.current || 0);

    // Filter out exit-ticket pseudo-attempts and non-primary attempts from recognition count
    const recognitionAttempts = sessionAttempts.filter(
      (a) => a.mode === 'recognition' && a.isExitTicket !== true && a.chosenConcept != null
    );
    const firstTryRecognition = recognitionAttempts.filter((a) => a.firstTry);
    const correctFirstTry = firstTryRecognition.filter((a) => a.correct).length;
    const solveAttempts = sessionAttempts.filter((a) => a.mode === 'solve');
    const tutorUses = sessionAttempts.filter((a) => a.tutorUsed).length;

    const durationMs = Date.now() - (startTsRef.current || Date.now());

    return {
      id: sessionIdRef.current,
      startTs: startTsRef.current,
      endTs: Date.now(),
      durationMs,
      totalQuestions: recognitionAttempts.length,
      firstTryCorrect: correctFirstTry,
      firstTryTotal: firstTryRecognition.length,
      firstTryAccuracy: firstTryRecognition.length > 0
        ? Math.round((correctFirstTry / firstTryRecognition.length) * 100)
        : 0,
      solveProblems: solveAttempts.length,
      tutorUses,
    };
  }, []);

  const endSession = useCallback(() => {
    if (!active) return;

    const sessionSummary = buildSummary();
    setSummary(sessionSummary);
    setActive(false);

    // Persist session record
    addSession({
      id: sessionSummary.id,
      startTs: sessionSummary.startTs,
      endTs: sessionSummary.endTs,
      durationMs: sessionSummary.durationMs,
      totalQuestions: sessionSummary.totalQuestions,
      firstTryAccuracy: sessionSummary.firstTryAccuracy,
    });

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [active, buildSummary]);

  const startNewSession = useCallback(() => {
    sessionIdRef.current = uuid();
    startTsRef.current = Date.now();
    startAttemptsRef.current = getAttempts().length;
    setSummary(null);
    setActive(true);
    recordActivity();
    resetCoachingSession();
  }, []);

  // Inactivity check every 60s
  useEffect(() => {
    if (!active) return;

    timerRef.current = setInterval(() => {
      const lastTs = getLastInteractionTs();
      if (lastTs && Date.now() - lastTs > INACTIVITY_TIMEOUT_MS) {
        endSession();
      }
    }, 60_000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active, endSession]);

  return {
    active,
    summary,
    endSession,
    startNewSession,
  };
}
