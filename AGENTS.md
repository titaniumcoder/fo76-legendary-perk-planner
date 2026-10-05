# AGENTS.md — FO76 Legendary Perk Planner

## What this is

Single-screen webapp (Svelte 5 + TypeScript + Vite) that optimizes Fallout 76
legendary perk card leveling. No server, no localStorage — all state lives in
the URL hash (`#s=...`), encoded via `src/lib/utils/codec.ts`.

## Commands

```sh
npm install
npm run dev       # start dev server
npm run build     # production build to dist/
npm run preview   # serve the build
npm run check     # svelte-check + tsc (typecheck)
npm test          # vitest run (planner + URL codec)
npm run art       # re-download card art from the wiki into public/cards/
```

Before finishing any change: run `npm run check` and `npm test` and make both pass.

## Architecture map

- `src/lib/planner/rules.ts` — game constants (slot unlock levels 50/75/100/150/200/300,
  rank-up costs 50/100/150, coin income per level/perk pack). All game-model
  numbers live here, nowhere else.
- `src/lib/planner/planner.ts` — scheduling logic: first rank-up for all stat-boost
  cards in priority order, then finish each card to 4★ one after another.
- `src/lib/data/legendaryPerks.ts` — card definitions (names, art, ordering).
- `src/lib/state/urlState.svelte.ts` — URL-hash state encoding/decoding, plus the
  session-only undo/redo action log (sessionStorage, never in the URL hash).
- `src/lib/utils/codec.ts` — compact string codec for the hash.
- `src/components/` — UI pieces: `InputPanel`, `SlotBoard`, `CardPicker`,
  `CardTile`, `StarPips`, `PlanTimeline`, `ProjectionPanel`.
- `src/App.svelte` — single-screen composition root.

## Conventions and rules of engagement

- Svelte 5 runes (`$state`, `$derived`, `*.svelte.ts` modules) — don't write legacy
  `export let` / store-based code.
- Keep the game model in `rules.ts` and `planner.ts` framework-free so tests can
  import it directly (`src/lib/planner/planner.test.ts`, `src/lib/utils/codec.test.ts`).
  Add tests when changing planner or codec behavior.
- Plausible but unverified game data must be checked against Bethesda's Update 22
  patch notes and the Nukapedia legendary perks article before merging.
- The Vite `base` path in `vite.config.ts` must match the repo name
  (`fo76-legendary-perk-planner`) for GitHub Pages — update it if the repo is renamed.
- Fan project: no Bethesda/ZeniMax assets beyond card art fetched by `npm run art`
  (non-commercial fan use, art from Nukapedia).
- Do not commit without the user asking; do not push to `main` unless told (pushes
  trigger the GitHub Pages deploy via `.github/workflows/deploy-pages.yml`).
