import { lazy, Suspense } from 'react';
import MediaFallback from './MediaFallback';

// Lazy-load renderers by kind for code splitting
const GraphRenderer = lazy(() => import('./GraphRenderer'));
const TableRenderer = lazy(() => import('./TableRenderer'));
const ImageRenderer = lazy(() => import('./ImageRenderer'));
const DiagramRenderer = lazy(() => import('./DiagramRenderer'));

/**
 * MediaRenderer — dispatcher that routes media items by `kind`.
 *
 * Usage: <MediaRenderer media={problem.media} />
 * No-op if media is absent or empty.
 */
export default function MediaRenderer({ media }) {
  if (!media || !Array.isArray(media) || media.length === 0) return null;

  return (
    <div className="space-y-4 mb-4">
      {media.map((item) => (
        <Suspense key={item.id} fallback={<div className="card p-4 text-center text-sm text-[var(--color-text-dim)]">Loading...</div>}>
          <MediaItem item={item} />
        </Suspense>
      ))}
    </div>
  );
}

function MediaItem({ item }) {
  if (!item?.kind) {
    return <MediaFallback alt="" label="[invalid media item]" />;
  }

  switch (item.kind) {
    case 'graph':
      return <GraphRenderer item={item} />;
    case 'table':
      return <TableRenderer item={item} />;
    case 'image':
      return <ImageRenderer item={item} />;
    case 'diagram':
      return <DiagramRenderer item={item} />;
    default:
      return <MediaFallback alt={item.alt || ''} label={`[unsupported media type: ${item.kind}]`} />;
  }
}
