# LIB KNOWLEDGE BASE

**Generated:** 2026-04-30
**Directory:** /home/runner/workspace/src/lib

## OVERVIEW
Shared utilities and API clients for the AI Slides Generator frontend. Contains 5 key modules for API communication, chart rendering, and theme management.

## STRUCTURE
```
src/lib/
├── api.js             # API client (fetch, SSE, auth)
├── charts.js          # SVG chart rendering
├── useTheme.js       # Theme hook (light/dark)
├── ... (2 more files)
└── (5 files total)
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| API calls | `api.js` | Fetch wrappers, SSE handlers |
| Charts | `charts.js` | Bar/line/pie SVG rendering |
| Theme | `useTheme.js` | Light/dark mode toggle |

## CONVENTIONS

### API Layer
- All fetch calls wrapped in `api.js`
- Handles 401s globally via `slideai:unauthorized` event
- `UnauthorizedError` thrown on 401 (not all errors)
- SSE parser: `streamGenerateDeck()` with event handlers

### Chart Patterns
- **Dependency-free**: Hand-rolled SVG (no Chart.js/Recharts)
- **Supported types**: bar, line, pie
- **Data format**: `{type, title, data: [{label, value}]}`

### Theme System
- CSS variables for colors
- `useTheme.js` hook for toggle
- Persists preference in localStorage

## ANTI-PATTERNS (LIB)

- **NEVER use external chart libraries** → dependency-free SVG only
- **DO NOT hardcode colors** → use theme CSS variables
- **Avoid direct fetch calls** → use `api.js` wrappers

## KEY EXPORTS

| Module | Exports | Purpose |
|--------|---------|---------|
| `api.js` | `streamGenerateDeck()`, `saveDeckApi()`, `fetchCurrentUser()` | API client |
| `charts.js` | `renderBarChart()`, `renderLineChart()`, `renderPieChart()` | SVG charts |
| `useTheme.js` | `useTheme()` | Theme hook |

## USAGE EXAMPLES

```javascript
// API call with SSE
import { streamGenerateDeck } from './lib/api';
streamGenerateDeck(prompt, {
  onSlide: (slide) => setSlides(prev => [...prev, slide]),
  onDone: () => setLoading(false)
});

// Chart rendering
import { renderBarChart } from './lib/charts';
const svg = renderBarChart({
  title: 'Metrics',
  data: [{label: 'A', value: 42}]
});

// Theme toggle
import { useTheme } from './lib/useTheme';
const [theme, toggleTheme] = useTheme();
```

---

**Generated**: 2026-04-30
**Version**: 1.0
**Scope**: Lib directory