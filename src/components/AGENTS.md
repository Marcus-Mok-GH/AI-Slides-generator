# COMPONENTS KNOWLEDGE BASE

**Generated:** 2026-04-30
**Directory:** /home/runner/workspace/src/components

## OVERVIEW
UI components for the AI Slides Generator frontend. Contains 26 React components that handle slide viewing, editing, navigation, and user interaction.

## STRUCTURE
```
src/components/
├── HtmlSlide.jsx       # Sandboxed slide renderer (iframe)
├── SlideViewer.jsx      # Deck editor UI (grid/full-screen)
├── SlideEditor.jsx      # Layout picker + inline editing
├── CreateHero.jsx       # Prompt input + template chips
├── RecentGallery.jsx   # Deck list with search
├── TopBar.jsx           # Logo, search, theme, user menu
├── Sidebar.jsx          # Navigation (New, My Decks, Trash)
└── ... (19 more components)
```

## WHERE TO LOOK

| Task | Component | Notes |
|------|-----------|-------|
| Render slides | `HtmlSlide.jsx` | Sandboxed iframe with slide HTML/CSS |
| Edit deck | `SlideViewer.jsx` | Grid/full-screen modes, drag-to-reorder |
| Change layout | `SlideEditor.jsx` | Right sidebar, layout picker, text editing |
| Create new deck | `CreateHero.jsx` | Prompt input, template chips, URL fetcher |
| View recent decks | `RecentGallery.jsx` | Search, open, delete actions |
| Top navigation | `TopBar.jsx` | Logo, search bar, theme toggle, user menu |
| Side navigation | `Sidebar.jsx` | New deck, My Decks, Trash, etc. |

## CONVENTIONS

### Component Patterns
- **No Redux/Zustand**: Uses local `useState` + callbacks with explicit prop drilling
- **BEM-like CSS**: Classes like `.slide-editor`, `.list-edit`, `.row-x`
- **Tailwind NOT used**: Standard CSS only
- **Mobile breakpoints**: `≤1024px`, `≤900px`, `≤720px`, `≤420px`
- **Dark mode**: CSS variables or conditional class (see `useTheme.js`)

### Prop Patterns
- Always pass callbacks explicitly (no prop drilling relay)
- State lives at highest common ancestor
- Children typically receive `onChange` callback
- Refs used sparingly (e.g., `heroRef` to focus input on nav click)

## ANTI-PATTERNS (COMPONENTS)

- **NEVER hardcode hex values** → always reference theme CSS variables
- **NEVER use Tailwind classes** → standard CSS only
- **Avoid deep prop drilling** → state at highest common ancestor
- **Do NOT use paragraphs** → one idea per slide, bullets/steps only

## UNIQUE PATTERNS

- **Sandboxed rendering**: `HtmlSlide.jsx` uses iframe for slide isolation
- **Debounced auto-save**: Integrated with `App.jsx` state machine
- **SSE streaming**: Real-time updates via `streamGenerateDeck()`
- **Theme system**: CSS variables + `useTheme.js` hook

## KEY COMPONENTS

| Component | Purpose | Lines |
|-----------|---------|-------|
| `HtmlSlide.jsx` | Sandboxed slide renderer | ~150 |
| `SlideViewer.jsx` | Deck editor UI | ~200 |
| `SlideEditor.jsx` | Layout/editing panel | ~180 |
| `CreateHero.jsx` | Prompt input | ~120 |
| `RecentGallery.jsx` | Deck list | ~100 |
| `TopBar.jsx` | Top navigation | ~80 |
| `Sidebar.jsx` | Side navigation | ~70 |

---

**Generated**: 2026-04-30
**Version**: 1.0
**Scope**: Components directory