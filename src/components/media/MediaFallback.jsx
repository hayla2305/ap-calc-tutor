/**
 * MediaFallback — graceful degradation for unsupported media types.
 * Shown for unknown kinds, unsupported versions, BC stubs, invalid layers.
 */
export default function MediaFallback({ alt, label }) {
  return (
    <div
      className="card p-4 text-center text-sm text-[var(--color-text-dim)] border-dashed"
      role="img"
      aria-label={alt || label}
    >
      {label}
    </div>
  );
}
