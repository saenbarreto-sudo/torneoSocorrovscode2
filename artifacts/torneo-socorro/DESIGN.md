# Design System — Torneo Socorro

This document formalizes the design system that already exists in the app. It does not
introduce a redesign — brand colors, component visuals, and the Tailwind v4 CSS-first
architecture are unchanged.

## Brand

- **Palette:** morado `#5b2a86` (purple) / rojo `#7a1235` (red), on white. See `src/index.css`
  for the full HSL token set (light + dark).
- **Typography:** Plus Jakarta Sans (body/UI, 400–800) + Space Mono (tabular figures — scores,
  currency, `.tabular-nums`), loaded via Google Fonts `@import` in `src/index.css`.
- **Components:** shadcn/ui, `"new-york"` style (`components.json`), Radix UI primitives,
  `cva` + `cn()` (`src/lib/utils.ts`) variant pattern.
- **Stack:** Tailwind CSS v4, CSS-first config (`@theme inline { }` block in `src/index.css`,
  no `tailwind.config.ts`).

## Token architecture

| File | Role |
|---|---|
| `src/index.css` | **Single build-time source of truth.** The `@theme inline` block maps Tailwind utilities to CSS variables; `:root`/`.dark` define the actual HSL values. |
| `design-system/design-tokens.json` | Formalized 3-layer mirror (primitive → semantic, plus a `dark` override layer) of the exact values in `index.css`, for documentation/tooling purposes. |
| `design-system/tokens.generated.css` | Derived reference CSS generated from the JSON above, for eyeballing/diffing only. |

**`tokens.generated.css` is never imported into the build.** The generator that produces it
resolves token references into flat literal values, which collapses the raw-var +
`@theme inline` indirection that `index.css` relies on for its `.dark`-class theme switch
(`@custom-variant dark (&:is(.dark *));`). Importing it would fight or duplicate that
mechanism. Treat `design-tokens.json` as the documented reference and `index.css` as the only
thing that actually ships.

A `component`-layer (button/card/input token mappings) was deliberately skipped — shadcn
components already read the semantic CSS variables directly via `cva`, so a component layer
would be documentation-only with no code consumer today.

## Dark mode

Dark-mode CSS (`.dark { }` in `index.css`) existed but was unreachable — `next-themes` was a
dependency with no `ThemeProvider` mounted anywhere. This is now wired up:

- `src/components/theme-provider.tsx` — thin wrapper around `next-themes`'s `ThemeProvider`.
- Mounted in `src/App.tsx`, wrapping the whole app: `attribute="class"` (matches the
  `.dark`-class selector `index.css` expects), `defaultTheme="light"` (the app is
  print/scoresheet-heavy — `@media print` already forces a white background — so light is the
  safer default), `enableSystem`.
- `src/components/mode-toggle.tsx` — Light/Dark/System dropdown, reusing the existing
  `dropdown-menu`/`button` primitives.
- Placed in `src/components/layout/app-layout.tsx`: desktop sidebar footer (above "Cerrar
  sesión") and the mobile header (next to the logout icon).
- `src/components/ui/sonner.tsx`'s existing `useTheme()` call now reflects real theme state.

## Accepted hardcoded-value exceptions

`design-system/scripts/validate-tokens.cjs` was run against `src/`. All 5 flags are
intentional, not violations:

- `src/index.css:94` (`--radius: 0.4rem`) — this *is* the token's own primitive definition.
- `src/components/ui/calendar.tsx:31` (`[--cell-size:2rem]`) — unmodified shadcn vendor
  component sizing, not a brand token.
- `src/components/ui/chart.tsx:52` (`#ccc`, `#fff` ×3) — unmodified shadcn chart wrapper:
  these are CSS attribute selectors matching Recharts' own hardcoded inline `stroke`
  attributes (e.g. `[stroke='#ccc']`) so they can be overridden with `stroke-border` /
  `stroke-transparent` tokens. Not rendered colors themselves.

No source changes were needed from this pass.

## Palette review (informational, not applied)

Ran `ui-ux-pro-max`'s design-system search (`sports tournament management dashboard`) to
sanity-check the palette. It matched its dataset to a generic marketing/landing-page "sports"
template (hero-CTA layout, Bebas Neue, red/gold) — not applicable to a dense internal admin
dashboard, so no findings from it were adopted.

Independently, `--secondary` (`340 74% 27%`) and `--destructive` (`340 74% 35%`) were checked
for distinguishability, since they're both dark, similarly-saturated reds. Computed contrast
between the two colors themselves is only **~1.35:1** — they're differentiated mainly by ~8
points of lightness. This is not a WCAG text-contrast failure (each still contrasts fine
against its own white foreground text), but the two roles could read as visually similar next
to each other (e.g. a "secondary" action button next to a "destructive" one). Flagged here for
awareness; **no color values were changed** — that's a deliberate call for the user to make.

## Known gap (observed, not fixed)

`src/index.css`'s `@theme inline` block references `--primary-border`, `--secondary-border`,
`--muted-border`, `--accent-border`, `--destructive-border`, `--sidebar-primary-border`, and
`--sidebar-accent-border` (e.g. `--color-primary-border: var(--primary-border);`), but none of
these are ever defined in `:root` or `.dark`. Any Tailwind utility relying on them (e.g. a
`border-primary-border` class) would resolve to an empty/invalid value. Left as-is since it's
outside this task's scope (no color/token value changes) — worth a follow-up.
