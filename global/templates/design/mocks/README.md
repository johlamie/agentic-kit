# Rendered mocks
Mocks are written in the product's idiom so builders copy markup, not guess it:

- HTML with the Tailwind v4 browser build, pinned:
  `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>`
- shadcn tokens declared in `<style type="text/tailwindcss">` (`:root` variables
  + `@theme inline`), and shadcn component markup/classes (button, card, input…)
  copied from the current registry. Fonts from Google Fonts are allowed.
- Real French copy, real states. Mocks are design artifacts, never shipped.

Minimal skeleton (copy the full variable set from the current shadcn theming docs):

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<style type="text/tailwindcss">
  :root { --radius: 0.625rem; --background: oklch(…); --foreground: oklch(…);
          --primary: oklch(…); --primary-foreground: oklch(…); --border: oklch(…); /* … */ }
  @theme inline { --color-background: var(--background); --color-primary: var(--primary);
                  --color-border: var(--border); --radius-md: calc(var(--radius) - 2px); /* … */ }
  @layer base { * { @apply border-border outline-ring/50; } body { @apply bg-background text-foreground; } }
</style>
```

Without the `@layer base` rule, Tailwind v4 borders fall back to `currentColor`
and every card gets a black outline.

Files:
- `direction-a.html`, `direction-b.html` — the core screen in each direction, for G3.
  Same baseline, different structure (navigation, entry, layout, imagery).
- `core.html` — the chosen direction with final tokens. Builders reproduce it.

Screenshots at 390×844 and 1440×900 go in `shots/<mock>-<width>.png`; they are
what the user sees at G3. ASCII alone is not a direction.
