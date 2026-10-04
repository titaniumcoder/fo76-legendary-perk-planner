# FO76 Legendary Perk Planner

Single-screen webapp (Svelte 5 + TypeScript + Vite) that optimizes Fallout 76 legendary perk card leveling.

## Inputs

- Current character level
- Legendary slots unlocked (account-wide, 0–6)
- Perk coins on hand
- Priority-ordered legendary cards with current rank (1–4★)

## Model (verified against Update 22 patch notes + Nukapedia)

- 6 legendary slots, unlocked at character level **50 / 75 / 100 / 150 / 200 / 300**, account-wide
- Rank-up costs: **50 / 100 / 150** perk coins (300 total per card)
- Coin income: 2 coins per level (scrapped perk pick, continues past 50) + 8 coins per perk pack
  (levels 4, 6, 8, 10, then every 5th level) + one-time +50 at level 50
- Coins capped at 5,000; pack size and other constants live in `src/lib/planner/rules.ts`
- Planner rules: stat-boost cards (Legendary S.P.E.C.I.A.L.) all get their first rank-up (50 coins)
  before any card is finished; then every card is finished to 4★ strictly one after another in
  priority order; rank progress is remembered per card even when swapped or removed

State lives in the URL hash (`#s=...`) — no server, no localStorage; bookmark or share the link.

## Commands

```sh
npm install
npm run dev       # start dev server
npm run build     # production build to dist/
npm run preview   # serve the build
npm run check     # svelte-check + tsc
npm test          # vitest (planner + URL codec)
npm run art       # re-download card art from the wiki into public/cards/
```

Fan project, not affiliated with Bethesda or ZeniMax. Card art from Nukapedia, used as non-commercial fan content.

## Deployment

The site deploys automatically to GitHub Pages on every push to `main` via `.github/workflows/deploy-pages.yml`:

https://titaniumcoder.github.io/fo76-legendary-perk-planner/

The Vite `base` path in `vite.config.ts` must match the repo name — update it if the repo is renamed.
