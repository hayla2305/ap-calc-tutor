import { useState, useCallback } from 'react';

/**
 * MediaExpand — tap-to-expand full-screen modal wrapper for graphs.
 * On mobile: opens h-[100dvh] modal. On desktop: larger preview.
 */
export default function MediaExpand({ children }) {
  const [expanded, setExpanded] = useState(false);

  const open = useCallback(() => setExpanded(true), []);
  const close = useCallback(() => setExpanded(false), []);

  return (
    <>
      <div
        onClick={open}
        className="cursor-pointer"
        role="button"
        tabIndex={0}
        aria-label="Tap to expand graph"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(); }}
      >
        {children}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-[var(--color-bg)] flex flex-col"
          style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex justify-end p-3">
            <button
              onClick={close}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors"
            >
              Close
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {children}
          </div>
        </div>
      )}
    </>
  );
}
