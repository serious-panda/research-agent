# Plan 10: Auth Page Design

> Source PRD: `docs/milestones/auth-and-server/prd-auth-and-server.md`

## Context

The login and signup pages are functional but unstyled. This plan:

1. Migrates `consumer-web` from plain global CSS to **Tailwind CSS v4**
2. Wires in **Untitled UI** component patterns (inputs, buttons, labels) via copy-paste from their HTML/Tailwind implementation
3. Redesigns `LoginPage` and `SignupPage` with a minimalistic editorial aesthetic — landing page and login are the same screen

---

## Design direction

**"Editorial Monochrome"** — warm off-white background, near-black text, one muted-gold accent for focus states. The app name is the hero: large, spaced, serif. Form inputs have no box — only an underline. Everything has generous whitespace.

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  RESEARCH                    ← wordmark top-left │
│                                                  │
│                                                  │
│        What would you like to know?              │
│                                                  │
│        ──────────────────────────────            │
│        Email address                             │  ← underline input (Untitled UI)
│        ──────────────────────────────            │
│        Password                                  │  ← underline input (Untitled UI)
│        ──────────────────────────────            │
│                                                  │
│                   [ Sign in ]                    │  ← full-width button (Untitled UI)
│                                                  │
│        Don't have an account?  Sign up           │  ← low-contrast link
│                                                  │
└──────────────────────────────────────────────────┘
```

Signup is the same layout — tagline becomes "Create your account", name field is added above email, toggle link says "Already have an account? Sign in".

---

## Phase 1 — Install Tailwind CSS v4

Tailwind v4 ships as a Vite plugin; there is no `tailwind.config.js`.

### 1.1 Install packages

```bash
cd apps/consumer-web
npm install tailwindcss @tailwindcss/vite
```

### 1.2 `vite.config.ts` — add plugin

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: { '/api': 'http://localhost:3333' },
  },
})
```

### 1.3 `src/index.css` — replace existing content

Replace the entire file with a Tailwind entry point followed by the custom design tokens and the existing research-UI rules migrated to plain CSS (research UI is **not** converted to Tailwind in this plan — only auth pages use Tailwind utilities).

```css
@import "tailwindcss";

/* ── design tokens (used by Tailwind theme and auth pages) ── */
@theme {
  --color-surface:    #faf9f7;
  --color-ink:        #1a1a1a;
  --color-muted:      #9a9a8e;
  --color-accent:     #c8a96e;
  --color-border:     #d4d2cc;

  --font-serif:       'Playfair Display', Georgia, serif;
  --font-sans:        system-ui, -apple-system, sans-serif;
}

/* Google Font */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&display=swap');

/* ── existing research-UI styles unchanged below this line ── */
/* ... (keep all existing .app, .progress-feed, etc. rules as-is) */
```

> **Why not convert the research UI?** Tailwind migration of existing components is risky churn with no user-visible benefit. Auth pages are greenfield — only they use Tailwind utilities.

---

## Phase 2 — Untitled UI component patterns

Untitled UI (untitledui.com) provides copy-pasteable HTML + Tailwind components. Pull the following patterns from the **Forms** and **Buttons** sections of their component library:

| Untitled UI component | Used in |
|---|---|
| **Input field — underline variant** (label + input + hint/error) | Both auth pages |
| **Button — primary, full-width** | Both auth pages |
| **Button — link variant** (no border, low contrast) | Toggle link (Sign in ↔ Sign up) |

### What to extract

These are not installed as a package — copy the Tailwind markup and adapt to React/TSX. Key class patterns from Untitled UI inputs:

```tsx
// Input field wrapper (Untitled UI "Input / Underline")
<div className="flex flex-col gap-1.5">
  <label className="text-sm font-medium text-[--color-ink]">{label}</label>
  <input
    className="
      border-0 border-b border-[--color-border] bg-transparent
      py-2.5 text-sm text-[--color-ink] placeholder:text-[--color-muted]
      outline-none transition-colors
      focus:border-[--color-accent]
    "
    {...props}
  />
  {error && <p className="text-xs text-red-500">{error}</p>}
</div>

// Primary button (Untitled UI "Button / Primary")
<button
  className="
    w-full py-2.5 px-4 text-sm font-medium tracking-widest uppercase
    bg-[--color-ink] text-[--color-surface]
    transition-opacity hover:opacity-70
    disabled:opacity-40 disabled:cursor-not-allowed
  "
>
  {children}
</button>
```

Wrap these into two small components in `src/components/ui/`:

- `src/components/ui/InputField.tsx` — label + underline input + error slot
- `src/components/ui/PrimaryButton.tsx` — full-width primary button

No external package is installed; these are local adaptations of the Untitled UI patterns.

---

## Phase 3 — Redesign LoginPage and SignupPage

### 3.1 `src/components/LoginPage.tsx` — full rewrite

```tsx
import { useState } from 'react'
import { InputField } from './ui/InputField'
import { PrimaryButton } from './ui/PrimaryButton'

interface Props {
  onLogin: (email: string, password: string) => Promise<void>
  onShowSignup: () => void
}

export function LoginPage({ onLogin, onShowSignup }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin(email, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[--color-surface] flex flex-col px-8 py-10">
      {/* Wordmark */}
      <p className="font-[--font-serif] text-sm tracking-[0.3em] uppercase text-[--color-muted]">
        Research
      </p>

      {/* Centered form area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm flex flex-col gap-10 animate-[fadeUp_0.4s_ease_both]">
          <div className="flex flex-col gap-1">
            <h1 className="font-[--font-serif] text-3xl text-[--color-ink] font-normal">
              Welcome back
            </h1>
            <p className="text-sm text-[--color-muted]">Sign in to continue your research</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <InputField
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <InputField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              error={error}
            />
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </PrimaryButton>
          </form>

          <p className="text-sm text-[--color-muted] text-center">
            Don't have an account?{' '}
            <button
              onClick={onShowSignup}
              className="text-[--color-ink] underline underline-offset-2 hover:text-[--color-accent] transition-colors"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
```

### 3.2 `src/components/SignupPage.tsx` — full rewrite

Same layout as `LoginPage`. Differences:
- Heading: "Create your account"
- Subtitle: "Start researching in seconds"
- Adds a `name` field above email (passed to `onSignup`)
- Toggle link: "Already have an account? Sign in"
- Calls `onSignup(name, email, password)`

> **Note:** `useAuth.register()` and `src/api/auth.ts` `register()` will need to accept a `name` param and pass it to `POST /api/auth/register`. Verify the AdonisJS endpoint accepts `name`; if not, omit the field for now.

### 3.3 Fade-up animation

Add to `index.css` (alongside the `@theme` block):

```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Tailwind's `animate-[fadeUp_0.4s_ease_both]` references this keyframe directly via the arbitrary value syntax.

---

## Files created / modified

| File | Action |
|---|---|
| `apps/consumer-web/package.json` | Add `tailwindcss`, `@tailwindcss/vite` |
| `apps/consumer-web/vite.config.ts` | Add `tailwindcss()` plugin |
| `apps/consumer-web/src/index.css` | Replace with Tailwind entry + `@theme` + existing research-UI rules |
| `apps/consumer-web/src/components/ui/InputField.tsx` | Created — Untitled UI underline input |
| `apps/consumer-web/src/components/ui/PrimaryButton.tsx` | Created — Untitled UI primary button |
| `apps/consumer-web/src/components/LoginPage.tsx` | Full rewrite |
| `apps/consumer-web/src/components/SignupPage.tsx` | Full rewrite |

`App.tsx`, `useAuth.ts`, `api/auth.ts`, and all research-UI components are **not modified**.

---

## Verification

```bash
cd apps/consumer-web && npm install && npm run dev

# Browser: localhost:5173
# → Full-viewport auth page with wordmark + "Welcome back" heading
# → Underline inputs, no box styling
# → Sign in button full-width, dark background
# → "Sign up" link toggles to signup form with name field
# → Error message appears inline below password field
# → After login, research UI appears unchanged
# → Sign out → returns to login page
```

Check that the research UI (progress feed, answer card, source list) is visually identical to before — no Tailwind purge should affect the existing `.app`, `.progress-feed`, etc. classes since they remain in `index.css`.
