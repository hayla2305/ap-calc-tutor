import { useState, useCallback, useRef } from 'react';
import { buildDeterministicFallback } from '../utils/tutorFallback';
import { recordActivity } from './useStorage';

const MAX_TURNS = 10;
const API_BASE = '/api';

/**
 * useTutor hook — manages tutor conversation lifecycle.
 *
 * On open: calls /api/tutor-init to get attemptToken.
 * On each message: calls /api/tutor with token + message + context.
 * Server is authoritative for turnIndex.
 */
export default function useTutor() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [turnIndex, setTurnIndex] = useState(0);
  const [conversationEnded, setConversationEnded] = useState(false);
  const tokenRef = useRef(null);
  const contextRef = useRef(null);

  const initConversation = useCallback(async (problemId, context) => {
    setMessages([]);
    setTurnIndex(0);
    setError(null);
    setConversationEnded(false);
    contextRef.current = context;
    tokenRef.current = null;

    try {
      const res = await fetch(`${API_BASE}/tutor-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId }),
      });

      if (res.status === 429) {
        setError("You've reached today's tutor limit. Try again tomorrow.");
        return false;
      }

      if (!res.ok) {
        setError('Failed to start tutor session.');
        return false;
      }

      const data = await res.json();
      tokenRef.current = data.token;
      return true;
    } catch {
      setError('Could not connect to tutor. Review the problem stem for cues.');
      return false;
    }
  }, []);

  // Push a deterministic fallback message when API is unreachable
  const pushDeterministicFallback = useCallback(() => {
    const text = buildDeterministicFallback(contextRef.current || {});
    setMessages((prev) => [...prev, { role: 'tutor', text, mode: 'micro_hint', checksCue: true, usedConfusionPair: false }]);
    setError(null);
    setLoading(false);
    return { mode: 'micro_hint', message: text };
  }, []);

  const sendMessage = useCallback(async (text) => {
    if (!tokenRef.current || conversationEnded || turnIndex >= MAX_TURNS) return null;

    const studentMsg = { role: 'student', text };
    setMessages((prev) => [...prev, studentMsg]);
    setLoading(true);
    setError(null);
    recordActivity();

    try {
      const res = await fetch(`${API_BASE}/tutor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenRef.current,
          requestId: crypto.randomUUID(),
          message: text,
          context: contextRef.current,
        }),
      });

      if (res.status === 429) {
        setError("You've reached today's tutor limit. Try again tomorrow.");
        setLoading(false);
        return null;
      }

      if (res.status === 401) {
        setError('Session expired. Please start a new conversation.');
        setConversationEnded(true);
        setLoading(false);
        return null;
      }

      if (!res.ok) {
        // Use deterministic fallback instead of just showing an error
        return pushDeterministicFallback();
      }

      const data = await res.json();
      const tutorMsg = {
        role: 'tutor',
        text: data.message,
        mode: data.mode,
        checksCue: data.checksCue,
        usedConfusionPair: data.usedConfusionPair,
      };

      setMessages((prev) => [...prev, tutorMsg]);
      setTurnIndex(data.turnIndex || turnIndex + 1);

      if (data.turnIndex >= MAX_TURNS) {
        setConversationEnded(true);
      }

      setLoading(false);
      return data;
    } catch {
      // Network error — use deterministic fallback
      return pushDeterministicFallback();
    }
  }, [turnIndex, conversationEnded, pushDeterministicFallback]);

  const endConversation = useCallback(() => {
    setConversationEnded(true);
  }, []);

  return {
    messages,
    loading,
    error,
    turnIndex,
    conversationEnded,
    maxTurns: MAX_TURNS,
    initConversation,
    sendMessage,
    endConversation,
  };
}
