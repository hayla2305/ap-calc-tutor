import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_WARNING_KEY = '__storage_mode__';
const CURRENT_SCHEMA_VERSION = 2;

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

// ─── UID Resolution ───
// Maps legacy concept id → uid (e.g. "mvt" → "ap.calc_ab.mvt")
let _idToUid = null;
let _uidSet = null;

export function setIdToUidMap(concepts) {
  _idToUid = {};
  _uidSet = new Set();
  for (const c of concepts) {
    _idToUid[c.id] = c.uid;
    _uidSet.add(c.uid);
  }
}

// Resolve a concept identifier to its UID.
// Accepts either legacy id or uid — always returns uid.
export function resolveUid(identifier) {
  if (!identifier) return identifier;
  // Already a uid
  if (_uidSet && _uidSet.has(identifier)) return identifier;
  // Legacy id → uid
  if (_idToUid && _idToUid[identifier]) return _idToUid[identifier];
  // Unknown — return as-is (defensive)
  return identifier;
}

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

/**
 * Normalize a progress object to ensure it has recognition/solve structure.
 * Handles legacy flat format {correct, attempts, streak, ...} that lacks the wrapper.
 */
function normalizeProgress(data) {
  if (!data || typeof data !== 'object') {
    return {
      recognition: { ...DEFAULT_RECOGNITION },
      solve: { ...DEFAULT_SOLVE },
    };
  }
  // Already has recognition wrapper — patch any missing fields
  if (data.recognition && typeof data.recognition === 'object') {
    data.recognition = { ...DEFAULT_RECOGNITION, ...data.recognition };
    if (!data.recognition.firstTriesByLevel || typeof data.recognition.firstTriesByLevel !== 'object') {
      data.recognition.firstTriesByLevel = {};
    }
    data.solve = data.solve && typeof data.solve === 'object'
      ? { ...DEFAULT_SOLVE, ...data.solve }
      : { ...DEFAULT_SOLVE };
    return data;
  }
  // Legacy flat format: {correct, total/attempts, streak, ...} → wrap into recognition
  const correct = data.correct || 0;
  const attempts = data.attempts || data.total || 0;
  const streak = data.streak || 0;
  const lastSeen = data.lastSeen || null;
  const currentLevel = data.currentLevel || 1;
  const firstTriesByLevel = data.firstTriesByLevel && typeof data.firstTriesByLevel === 'object'
    ? data.firstTriesByLevel
    : (attempts > 0 ? { '1': { correct, total: attempts } } : {});
  return {
    recognition: {
      correct,
      attempts,
      streak,
      currentLevel,
      firstTriesByLevel,
      lastSeen,
    },
    solve: data.solve && typeof data.solve === 'object'
      ? { ...DEFAULT_SOLVE, ...data.solve }
      : { ...DEFAULT_SOLVE },
  };
}

export function getProgress(concept) {
  const uid = resolveUid(concept);
  const defaultProgress = {
    recognition: { ...DEFAULT_RECOGNITION },
    solve: { ...DEFAULT_SOLVE },
  };
  const data = safeGet(`progress:${uid}`, null);
  if (data !== null) return normalizeProgress(data);
  // Fallback: try legacy key if UID key has no data (pre-migration)
  if (uid !== concept && _idToUid) {
    const legacy = safeGet(`progress:${concept}`, null);
    if (legacy !== null) return normalizeProgress(legacy);
  }
  return defaultProgress;
}

export function setProgress(concept, data) {
  const uid = resolveUid(concept);
  return safeSet(`progress:${uid}`, data);
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
  const trueUid = resolveUid(trueConcept);
  const chosenUid = resolveUid(chosenConcept);
  const defaultConfusion = {
    count: 0,
    lastSeen: null,
    coaching_baseline_count: null,
    coaching_shown_ts: null,
  };
  const data = safeGet(`confusions:${trueUid}:${chosenUid}`, null);
  if (data !== null) return data;
  // Fallback: try legacy key if UID key has no data (pre-migration)
  if ((trueUid !== trueConcept || chosenUid !== chosenConcept) && _idToUid) {
    const legacy = safeGet(`confusions:${trueConcept}:${chosenConcept}`, null);
    if (legacy !== null) return legacy;
  }
  return defaultConfusion;
}

export function markCoachingBaseline(trueConcept, chosenConcept) {
  const trueUid = resolveUid(trueConcept);
  const chosenUid = resolveUid(chosenConcept);
  const data = getConfusion(trueUid, chosenUid);
  if (data.coaching_baseline_count == null) {
    data.coaching_baseline_count = data.count;
  }
  data.coaching_shown_ts = Date.now();
  return safeSet(`confusions:${trueUid}:${chosenUid}`, data);
}

export function incrementConfusion(trueConcept, chosenConcept) {
  const trueUid = resolveUid(trueConcept);
  const chosenUid = resolveUid(chosenConcept);
  const data = getConfusion(trueUid, chosenUid);
  data.count += 1;
  data.lastSeen = Date.now();
  return safeSet(`confusions:${trueUid}:${chosenUid}`, data);
}

export function getTopConfusions(trueConcept, limit = 2) {
  const trueUid = resolveUid(trueConcept);
  const confusions = [];
  // Iterate legacy IDs so callers get legacy IDs back in `chosen`
  const ids = getAllConceptIds();
  for (const chosenId of ids) {
    const chosenUid = resolveUid(chosenId);
    if (chosenUid === trueUid) continue;
    // Try UID key first, fall back to legacy key (pre-migration)
    let data = safeGet(`confusions:${trueUid}:${chosenUid}`, null);
    if (data === null && _idToUid) {
      data = safeGet(`confusions:${trueConcept}:${chosenId}`, null);
    }
    if (data && data.count > 0) {
      confusions.push({ chosen: chosenId, ...data });
    }
  }
  confusions.sort((a, b) => b.count - a.count);
  return confusions.slice(0, limit);
}

// Concept UIDs cache — set once from concepts.json
let _conceptUids = null;
// Legacy: concept IDs cache (kept for backward compat during transition)
let _conceptIds = null;

export function setConceptIds(ids) {
  _conceptIds = ids;
}
export function getAllConceptIds() {
  return _conceptIds || [];
}
export function setConceptUids(uids) {
  _conceptUids = uids;
}
export function getAllConceptUids() {
  return _conceptUids || _conceptIds || [];
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
  // Clear uid-keyed progress and confusion entries
  const uids = getAllConceptUids();
  for (const c of uids) {
    storage.removeItem(`progress:${c}`);
    for (const c2 of uids) {
      if (c !== c2) storage.removeItem(`confusions:${c}:${c2}`);
    }
  }
  // Also clear any remaining legacy id-keyed entries
  const ids = getAllConceptIds();
  for (const c of ids) {
    storage.removeItem(`progress:${c}`);
    for (const c2 of ids) {
      if (c !== c2) storage.removeItem(`confusions:${c}:${c2}`);
    }
  }
  storage.removeItem('attempts');
  storage.removeItem('sessions');
  storage.removeItem('lastInteractionTs');
  storage.removeItem('storageSchemaVersion');
}

// ─── Storage Schema Migration (v1 → v2: UID namespacing) ───

function estimateStorageUsage() {
  if (storageType === 'memory') return { used: 0, quota: Infinity };
  try {
    let used = 0;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      used += key.length + (storage.getItem(key) || '').length;
    }
    // localStorage quota is typically ~5MB (5,242,880 chars)
    return { used: used * 2, quota: 5_242_880 };
  } catch {
    return { used: 0, quota: 5_242_880 };
  }
}

export function runStorageMigrationV2(concepts) {
  try {
    const currentVersion = safeGet('storageSchemaVersion', 1);
    if (currentVersion >= CURRENT_SCHEMA_VERSION) return;

    // Build id → uid map
    const idToUid = {};
    for (const c of concepts) {
      if (c.id && c.uid) idToUid[c.id] = c.uid;
    }
    const legacyIds = Object.keys(idToUid);
    if (legacyIds.length === 0) return;

    // ── Best-effort backup ──
    const { used, quota } = estimateStorageUsage();
    const projectedAfterBackup = used * 2; // backup roughly doubles usage
    if (projectedAfterBackup < quota * 0.8) {
      // Full backup: store all v1 keys
      const backup = {};
      for (const id of legacyIds) {
        const progressRaw = storage.getItem(`progress:${id}`);
        if (progressRaw !== null) backup[`progress:${id}`] = progressRaw;
        for (const id2 of legacyIds) {
          if (id === id2) continue;
          const confRaw = storage.getItem(`confusions:${id}:${id2}`);
          if (confRaw !== null) backup[`confusions:${id}:${id2}`] = confRaw;
        }
      }
      const attemptsRaw = storage.getItem('attempts');
      if (attemptsRaw !== null) backup['attempts'] = attemptsRaw;
      safeSet('__v1_backup__', backup);
    } else {
      // Manifest-only backup: store key map only
      safeSet('__v1_backup_manifest__', {
        idToUid,
        migratedAt: Date.now(),
        note: 'Full backup skipped — storage quota > 80%',
      });
    }

    // ── Migrate progress keys ──
    let progressMigrated = 0;
    for (const id of legacyIds) {
      const uid = idToUid[id];
      const v1Raw = storage.getItem(`progress:${id}`);
      if (v1Raw === null) continue;
      // Only write v2 key if it doesn't already exist (idempotent)
      const v2Raw = storage.getItem(`progress:${uid}`);
      if (v2Raw === null) {
        const ok = safeSet(`progress:${uid}`, JSON.parse(v1Raw));
        // Only delete v1 after confirming v2 write
        if (ok && storage.getItem(`progress:${uid}`) !== null) {
          storage.removeItem(`progress:${id}`);
          progressMigrated++;
        }
      } else {
        // v2 key already exists — just clean up v1
        storage.removeItem(`progress:${id}`);
      }
    }

    // ── Migrate confusion keys ──
    let confusionMigrated = 0;
    for (const id1 of legacyIds) {
      const uid1 = idToUid[id1];
      for (const id2 of legacyIds) {
        if (id1 === id2) continue;
        const uid2 = idToUid[id2];
        const v1Key = `confusions:${id1}:${id2}`;
        const v2Key = `confusions:${uid1}:${uid2}`;
        const v1Raw = storage.getItem(v1Key);
        if (v1Raw === null) continue;
        const v2Raw = storage.getItem(v2Key);
        if (v2Raw === null) {
          const ok = safeSet(v2Key, JSON.parse(v1Raw));
          if (ok && storage.getItem(v2Key) !== null) {
            storage.removeItem(v1Key);
            confusionMigrated++;
          }
        } else {
          storage.removeItem(v1Key);
        }
      }
    }

    // ── Migrate attempts log (trueConcept / chosenConcept fields) ──
    const attempts = safeGet('attempts', []);
    let attemptsChanged = false;
    for (const a of attempts) {
      if (a.trueConcept && idToUid[a.trueConcept]) {
        a.trueConceptUid = idToUid[a.trueConcept];
        attemptsChanged = true;
      } else if (a.trueConceptUid) {
        // Already migrated
      } else if (a.trueConcept) {
        // Unknown concept — keep as-is, add uid field matching
        a.trueConceptUid = a.trueConcept;
      }
      if (a.chosenConcept && idToUid[a.chosenConcept]) {
        a.chosenConceptUid = idToUid[a.chosenConcept];
        attemptsChanged = true;
      } else if (a.chosenConceptUid) {
        // Already migrated
      } else if (a.chosenConcept) {
        a.chosenConceptUid = a.chosenConcept;
      }
    }
    if (attemptsChanged) {
      safeSet('attempts', attempts);
    }

    // ── Mark migration complete ──
    safeSet('storageSchemaVersion', CURRENT_SCHEMA_VERSION);
  } catch (err) {
    console.error('[migration] runStorageMigrationV2 failed:', err);
  }
}
