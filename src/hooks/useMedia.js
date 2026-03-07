import { useState, useEffect } from 'react';
import { loadProblemMedia, problemHasMedia } from '../data/mediaLoader';

/**
 * useMedia — loads media for a problem asynchronously.
 *
 * Returns { media: Array|null, loading: boolean }.
 * No-op (returns null immediately) for text-only problems.
 */
export default function useMedia(problem) {
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!problem || !problemHasMedia(problem)) {
      setMedia(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Clear stale media immediately to prevent flash of previous graph
    setMedia(null);
    setLoading(true);

    loadProblemMedia(problem.id)
      .then((result) => {
        if (!cancelled) {
          setMedia(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(`[useMedia] Failed to load media for ${problem.id}:`, err);
          setMedia(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [problem?.id]);

  return { media, loading };
}
