# CC Handover — AP Calc Tutor

> Last updated: 2026-03-07
> Deployed at: https://calc.joshuajchang.com (Cloudflare Pages)

---

## What's Working

| Feature | Entry Point | Notes |
|---------|-------------|-------|
| **Mode 1 — Recognition** | `Mode1.jsx` | Concept-identification with exit-ticket gating, UID fields on all attempts |
| **Mode 2 — Guided Solve** | `Mode2.jsx` | Full step-by-step hint reveal, StepCard, student text input, Mark Complete |
| **Mode 3 — Concept Map** | `Mode3.jsx` | Cluster-organized tiles, mastery progress bars, confusion pair visualization |
| **AI Tutor** | `TutorChat.jsx` → `useTutor.js` → `functions/api/tutor.js` | Anthropic proxy with HMAC attemptToken, server-side turn counting (max 10), rate limiting |
| **Adaptive Difficulty** | `difficulty.js` | Promote (>=80% at >=5), Hold (50-79%), Remediate (<50% at >=6). Confusion drill injection, mastery interleaving |
| **Session Management** | `useSession.js` | Auto-start, 20-min inactivity timeout, summary stats |
| **MediaRenderer** | `MediaRenderer.jsx` → `CartesianPlot.jsx` → 8 layer types | SVG rendering with CSS custom properties, lazy code-split by media kind, ResizeObserver tick thinning, unknown-layer fallback |
| **Media Content** | `problems-media.json` | 16 graphical problem entries across all 8 layer types |
| **Media Validation** | `migration/validate-media.mjs` | Per-layer allowlists, nested key checks, color validation, viewport containment, alt-text quality guard |
| **Storage v2** | `useStorage.js` | localStorage migration v1->v2 with UID namespacing via `resolveUid()` |
| **Problem Bank** | `problems_cluster*.json` | Subject-namespaced lazy loading via `mediaLoader.js` |

## Media Placement

Media renders **below the problem stem**, inline in the problem card. The `useMedia` hook loads media by `problem.id` from `problems-media.json`. Expand-to-fullscreen is handled by `MediaExpand.jsx` (Escape key dismisses, safe-area-inset padding for notched devices).

## Color Token System

Six named color tokens are defined in `src/components/media/layers/colorTokens.js`:

| Token | Hex | Usage |
|-------|-----|-------|
| `blue` | `#60a5fa` | Default curve/point color |
| `red` | `#f87171` | Alternate curves, emphasis |
| `green` | `#4ade80` | Correct/positive regions |
| `orange` | `#fb923c` | Warnings, highlights |
| `purple` | `#c084fc` | Special curves |
| `gray` | `#9ca3af` | De-emphasized elements |

`resolveColor(color, fallback)` accepts hex (`#rrggbb` / `#rrggbbaa`) or named tokens. Used by CurveLayer, PointLayer, RegionLayer, RiemannLayer. Remaining layers (AsymptoteLayer, DiscontinuityLayer, AnnotationLayer, VectorFieldLayer) use CSS custom properties (`--color-text`, `--color-text-dim`, `--color-bg`) directly.

The validator (`validate-media.mjs`) enforces color validity via `isValidColor()` — rejects anything that isn't a valid hex or one of the 6 named tokens.

## Key Files

### Frontend (React 19 + Vite 7 + Tailwind v4)

```
src/
  App.jsx                       — App shell, tab routing (Mode1/Mode2/Mode3)
  main.jsx                      — React entry point

  components/
    Mode1.jsx                   — Recognition mode (concept ID + exit ticket)
    Mode2.jsx                   — Guided solve (step-by-step hints)
    Mode3.jsx                   — Concept map (cluster tiles + mastery)
    TutorChat.jsx               — AI tutor UI (bottom sheet mobile / side panel desktop)
    CoachingCard.jsx            — Coaching hint display
    MathDisplay.jsx             — KaTeX math rendering

    media/
      MediaRenderer.jsx         — Dispatcher: routes media.kind to sub-renderers
      MediaExpand.jsx            — Fullscreen overlay (Escape key, safe-area padding)
      MediaFallback.jsx          — Error/loading fallback
      GraphRenderer.jsx          — Delegates to CartesianPlot (or future polar/parametric)
      ImageRenderer.jsx          — Static image rendering
      DiagramRenderer.jsx        — Diagram rendering
      TableRenderer.jsx          — Table rendering

      plots/
        CartesianPlot.jsx        — d3-scale axes + layer composition, ResizeObserver tick thinning

      layers/
        CurveLayer.jsx           — Parametric/function curves (resolveColor)
        PointLayer.jsx           — Labeled/styled points (resolveColor)
        RegionLayer.jsx          — Shaded areas: curve-to-axis, between-curves (resolveColor, d3-shape area)
        RiemannLayer.jsx         — Riemann sum rectangles: left/right/midpoint/trapezoidal (resolveColor)
        AsymptoteLayer.jsx       — Dashed vertical/horizontal asymptote lines (CSS vars)
        DiscontinuityLayer.jsx   — Removable/jump/infinite markers (CSS vars)
        AnnotationLayer.jsx      — Text/arrow annotations (CSS vars)
        VectorFieldLayer.jsx     — Slope/vector field arrows (CSS vars)
        colorTokens.js           — resolveColor() + 6 named tokens

  hooks/
    useMedia.js                  — Loads media by problem ID, .catch() error handling
    useStorage.js                — localStorage persistence, v1->v2 migration, resolveUid()
    useSession.js                — Session lifecycle, 20-min inactivity timeout
    useTutor.js                  — Tutor conversation state, HMAC token, turn counting

  utils/
    difficulty.js                — Adaptive engine: evaluate/apply/interleave/confusionDrill
    scoring.js                   — Scoring logic
    confusion.js                 — Confusion pair detection
    coaching.js                  — Coaching strategy selection
    cueValidation.js             — Problem cue validation
    tutorFallback.js             — Offline tutor fallback responses

  data/
    problems.json                — Master problem index
    problems_cluster[1-6].json   — Lazy-loaded problem sets by cluster
    problems-media.json          — Media entries keyed by problem ID (16 entries)
    concepts.json                — Concept definitions and relationships
    coaching.json                — Coaching strategies
    mediaLoader.js               — Dynamic import for media JSON
    __tests__/
      media.test.js              — Vitest structural + snapshot tests (10 tests)
```

### Backend (Cloudflare Pages Functions)

```
functions/api/
  tutor-init.js                  — POST: creates HMAC attemptToken, returns system prompt context
  tutor.js                       — POST: Anthropic API proxy, validates HMAC, enforces turn limit + rate limit
```

### Database (Cloudflare D1)

```
wrangler.toml                    — D1 binding: ap-calc-tutor-quota (870fc911-...)
migrations/
  0001_create_quota_tables.sql   — Quota tracking schema
```

### Tooling

```
migration/
  validate-media.mjs             — Media schema validator (run: npm run validate:media)
  graphical_draft.json           — Draft graphical problem data

scripts/
  integration-test.mjs           — Integration test runner
  migrate-namespacing.mjs        — Storage namespace migration tool
  validate-cues.mjs              — Problem cue validator
  validate-cues-quick.mjs        — Quick cue validation
```

## Stack

| Layer | Tech | Version |
|-------|------|---------|
| UI | React | 19.2.0 |
| Build | Vite | 7.3.1 |
| Styles | Tailwind CSS | 4.2.1 |
| Math | KaTeX | 0.16.33 |
| Plots | d3-scale + d3-shape | 4.0.2 / 3.2.0 |
| Hosting | Cloudflare Pages | — |
| Functions | Cloudflare Workers (Pages Functions) | — |
| Database | Cloudflare D1 | — |
| Tests | Vitest | 4.0.18 |

## Build & Deploy

```bash
npm run dev                 # Vite dev server
npm run build               # Production build -> dist/
npm run test                # Vitest (10 tests)
npm run validate:media      # Media schema validation

# Deploy
npm run build && npx wrangler pages deploy dist --project-name ap-calc-tutor
```

## Known Gaps

- **Polar/parametric renderers**: Validator accepts `polar:polar` and `cartesian:parametric` but no renderer implementation exists yet
- **SRS / spaced repetition**: No cross-session scheduler; `difficulty.js` handles within-session adaptive logic only
- **Progress export**: Data lives in localStorage only; no export or analytics dashboard
- **Multi-subject content**: Infrastructure is in place (namespaced storage, lazy loading) but only AP Calc AB content exists
