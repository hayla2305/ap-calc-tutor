import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_WARNING_KEY = '__storage_mode__';

function getStorageBackend() {
  // Try window.storage (Claude artifact environment)
  if (typeof window !== 'undefined' && window.storage && typeof window.storage.getItem === 'function') {
    return { type: 'window.storage', backend: window.storage };
  }
  // Try localStorage
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return { type: 'localStorage', backend: localStorage };
  } catch {
    // Fall back to in-memory
    return { type: 'memory', backend: createMemoryStorage() };
  }
}

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

const { type: storageType, backend: storage } = getStorageBackend();

export function getStorageType() {
  return storageType;
}

export function isStoragePersistent() {
  return storageType !== 'memory';
}

function safeGet(key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('apcalc:storage-write-failed'));
    }
    return false;
  }
}

// ─── Progress Storage ───

const DEFAULT_RECOGNITION = {
  correct: 0,
  attempts: 0,
  streak: 0,
  currentLevel: 1,
  firstTriesByLevel: {},
  lastSeen: null,
};

const DEFAULT_SOLVE = {
  correct: 0,
  attempts: 0,
  lastSeen: null,
};

export function getProgress(concept) {
  return safeGet(`progress:${concept}`, {
    recognition: { ...DEFAULT_RECOGNITION },
    solve: { ...DEFAULT_SOLVE },
  });
}

export function setProgress(concept, data) {
  return safeSet(`progress:${concept}`, data);
}

export function updateRecognition(concept, updater) {
  const progress = getProgress(concept);
  progress.recognition = updater(progress.recognition);
  return setProgress(concept, progress);
}

export function updateSolve(concept, updater) {
  const progress = getProgress(concept);
  progress.solve = updater(progress.solve);
  return setProgress(concept, progress);
}

// ─── Confusion Storage ───

export function getConfusion(trueConcept, chosenConcept) {
  return safeGet(`confusions:${trueConcept}:${chosenConcept}`, {
    count: 0,
    lastSeen: null,
    coaching_baseline_count: null,
    coaching_shown_ts: null,
  });
}

export function markCoachingBaseline(trueConcept, chosenConcept) {
  const data = getConfusion(trueConcept, chosenConcept);
  if (data.coaching_baseline_count == null) {
    data.coaching_baseline_count = data.count;
  }
  data.coaching_shown_ts = Date.now();
  return safeSet(`confusions:${trueConcept}:${chosenConcept}`, data);
}

export function incrementConfusion(trueConcept, chosenConcept) {
  const data = getConfusion(trueConcept, chosenConcept);
  data.count += 1;
  data.lastSeen = Date.now();
  return safeSet(`confusions:${trueConcept}:${chosenConcept}`, data);
}

export function getTopConfusions(trueConcept, limit = 2) {
  // Scan all confusion keys for this trueConcept
  const confusions = [];
  // We need to check known concepts — pass them in or scan storage
  // For efficiency, we'll use a known-concepts approach
  const concepts = getAllConceptIds();
  for (const chosen of concepts) {
    if (chosen === trueConcept) continue;
    const data = getConfusion(trueConcept, chosen);
    if (data.count > 0) {
      confusions.push({ chosen, ...data });
    }
  }
  confusions.sort((a, b) => b.count - a.count);
  return confusions.slice(0, limit);
}

// Concept IDs cache — set once from concepts.json
let _conceptIds = null;
export function setConceptIds(ids) {
  _conceptIds = ids;
}
export function getAllConceptIds() {
  return _conceptIds || [];
}

// ─── Attempts Log ───

export function getAttempts() {
  return safeGet('attempts', []);
}

export function addAttempt(attempt) {
  const attempts = getAttempts();
  attempts.push(attempt);
  // Keep last 2000 attempts to prevent storage bloat
  if (attempts.length > 2000) {
    attempts.splice(0, attempts.length - 2000);
  }
  return safeSet('attempts', attempts);
}

// ─── Session Storage ───

export function getSessions() {
  return safeGet('sessions', []);
}

export function addSession(session) {
  const sessions = getSessions();
  sessions.push(session);
  return safeSet('sessions', sessions);
}

export function updateLastSession(updater) {
  const sessions = getSessions();
  if (sessions.length === 0) return false;
  sessions[sessions.length - 1] = updater(sessions[sessions.length - 1]);
  return safeSet('sessions', sessions);
}

export function getLastInteractionTs() {
  return safeGet('lastInteractionTs', null);
}

export function setLastInteractionTs(ts) {
  return safeSet('lastInteractionTs', ts);
}

export function recordActivity() {
  return setLastInteractionTs(Date.now());
}

// ─── Settings ───

export function getSettings() {
  return safeGet('settings', { theme: 'dark' });
}

export function setSettings(settings) {
  return safeSet('settings', settings);
}

// ─── React Hook ───

export function useStorage(key, initialValue) {
  const [value, setValue] = useState(() => safeGet(key, initialValue));
  const keyRef = useRef(key);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const set = useCallback((newValue) => {
    setValue((prev) => {
      const resolved = typeof newValue === 'function' ? newValue(prev) : newValue;
      safeSet(keyRef.current, resolved);
      return resolved;
    });
  }, []);

  return [value, set];
}

// ─── Reset ───

export function resetAllProgress() {
  // Only clear app-specific keys, not all storage
  const concepts = getAllConceptIds();
  for (const c of concepts) {
    storage.removeItem(`progress:${c}`);
    for (const c2 of concepts) {
      if (c !== c2) storage.removeItem(`confusions:${c}:${c2}`);
    }
  }
  storage.removeItem('attempts');
  storage.removeItem('sessions');
  storage.removeItem('lastInteractionTs');
}
