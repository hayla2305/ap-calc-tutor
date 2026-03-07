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
    setLoading(true);

    loadProblemMedia(problem.id).then((result) => {
      if (!cancelled) {
        setMedia(result);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [problem?.id]);

  return { media, loading };
}
