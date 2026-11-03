# HOOKS KNOWLEDGE BASE

**Generated:** 2026-04-30
**Directory:** `src/hooks/` (repo root)

## OVERVIEW
React hooks for AI Slides Generator. Contains critical authentication and state management logic.

## STRUCTURE
```
src/hooks/
└── useAuth.js          # Authentication hook
```

## WHERE TO LOOK

| Task | Hook | Notes |
|------|------|-------|
| Authentication | `useAuth.js` | OIDC flow, session management |

## CONVENTIONS

### Auth Patterns
- Single `fetchCurrentUser()` call on mount
- Global listener for `slideai:unauthorized` event
- Handles Replit Auth redirects via `returnTo` in localStorage
- Auto-refreshes expired access tokens once

### State Management
- No Redux/Zustand
- Local `useState` + callbacks
- State flows down, callbacks up

## ANTI-PATTERNS (HOOKS)

- **NEVER call the auth endpoints directly** → go through `useAuth.js` wrappers
- **DO NOT bypass auth checks** → always use `isAuthenticated`
- **NEVER hand-roll token storage** → `src/lib/api.js` owns the `slideai:token` key

## KEY HOOKS

| Hook | Purpose | Returns |
|------|---------|---------|
| `useAuth()` | Auth state + actions | `{user, loading, signIn, signOut}` |

## USAGE EXAMPLE

```javascript
import { useAuth } from './hooks/useAuth';

function ProtectedComponent() {
  const { user, loading, signIn } = useAuth();
  
  if (loading) return <Spinner />;
  if (!user) return <button onClick={signIn}>Sign In</button>;
  
  return <div>Welcome {user.email}</div>;
}
```

---

**Generated**: 2026-04-30
**Version**: 1.0
**Scope**: Hooks directory