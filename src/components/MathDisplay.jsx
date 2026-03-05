import { useMemo } from 'react';
import katex from 'katex';

/**
 * Renders text with inline ($...$) and display ($$...$$) KaTeX math.
 * Handles mixed text + math content safely.
 */
export default function MathDisplay({ text, className = '' }) {
  const html = useMemo(() => renderMathText(text || ''), [text]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Block-level math display component for solution steps etc.
 */
export function MathBlock({ text, className = '' }) {
  const html = useMemo(() => renderMathText(text || ''), [text]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMathText(text) {
  if (!text) return '';

  // Split on display math first ($$...$$), then inline ($...$)
  const parts = [];
  let remaining = text;

  // Process display math: $$...$$
  while (remaining.length > 0) {
    const displayStart = remaining.indexOf('$$');
    if (displayStart === -1) {
      parts.push({ type: 'text', content: remaining });
      break;
    }

    // Text before display math
    if (displayStart > 0) {
      parts.push({ type: 'text', content: remaining.slice(0, displayStart) });
    }

    const displayEnd = remaining.indexOf('$$', displayStart + 2);
    if (displayEnd === -1) {
      // Unclosed display math — treat as text
      parts.push({ type: 'text', content: remaining.slice(displayStart) });
      break;
    }

    parts.push({
      type: 'display',
      content: remaining.slice(displayStart + 2, displayEnd),
    });
    remaining = remaining.slice(displayEnd + 2);
  }

  // Now process inline math within text parts
  const finalParts = [];
  for (const part of parts) {
    if (part.type !== 'text') {
      finalParts.push(part);
      continue;
    }

    let textRemaining = part.content;
    while (textRemaining.length > 0) {
      const inlineStart = textRemaining.indexOf('$');
      if (inlineStart === -1) {
        finalParts.push({ type: 'text', content: textRemaining });
        break;
      }

      // Text before inline math
      if (inlineStart > 0) {
        finalParts.push({ type: 'text', content: textRemaining.slice(0, inlineStart) });
      }

      const inlineEnd = textRemaining.indexOf('$', inlineStart + 1);
      if (inlineEnd === -1) {
        finalParts.push({ type: 'text', content: textRemaining.slice(inlineStart) });
        break;
      }

      finalParts.push({
        type: 'inline',
        content: textRemaining.slice(inlineStart + 1, inlineEnd),
      });
      textRemaining = textRemaining.slice(inlineEnd + 1);
    }
  }

  // Render all parts to HTML
  return finalParts
    .map((part) => {
      if (part.type === 'text') {
        return escapeHtml(part.content);
      }
      try {
        return katex.renderToString(part.content, {
          displayMode: part.type === 'display',
          throwOnError: false,
          strict: false,
          trust: true,
        });
      } catch {
        // Fallback: show raw LaTeX in a code block
        return `<code class="text-red-400">${escapeHtml(part.content)}</code>`;
      }
    })
    .join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
