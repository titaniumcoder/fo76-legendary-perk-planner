<script lang="ts">
  import { fullPoolProjection, type PlanResult } from '../lib/planner/planner';
  import { urlState } from '../lib/state/urlState.svelte';
  import { LEGENDARY_PERKS } from '../lib/data/legendaryPerks';
  import { fmt } from '../lib/utils/format';

  let { plan }: { plan: PlanResult } = $props();

  const poolSize = $derived(
    LEGENDARY_PERKS.filter((p) => (urlState.faction === 'human' ? !p.ghoulOnly : !p.humanOnly)).length,
  );

  const projection = $derived(
    fullPoolProjection(
      {
        level: urlState.level,
        slotsUnlocked: urlState.slots,
        coinsOwned: urlState.coins,
        cards: urlState.plannerCards(),
        assumptions: urlState.assumptions,
        rememberedRanks: urlState.ranks,
      },
      urlState.faction,
    ),
  );
</script>

<div class="panel">
  <div class="panel-title">Projection</div>
  <div class="line">
    <span class="k">Selected 4★</span>
    <span class="v" class:gold={plan.finishedAtLevel !== null}>
      {plan.finishedAtLevel !== null ? `LVL ${fmt(plan.finishedAtLevel)}` : '—'}
    </span>
  </div>
  <div class="line">
    <span class="k">All {poolSize} cards 4★</span>
    <span class="v" class:gold={projection.finishedAtLevel !== null}>
      {projection.finishedAtLevel !== null ? `LVL ${fmt(projection.finishedAtLevel)}` : '—'}
    </span>
    <button
      class="switch"
      onclick={() => (urlState.faction = urlState.faction === 'human' ? 'ghoul' : 'human')}
      title="Switch the full-pool projection between human and ghoul usable cards"
    >{urlState.faction === 'human' ? 'HUMAN' : 'GHOUL'}</button>
  </div>
  <div class="line">
    <span class="k">Coins needed</span>
    <span class="v dim">{fmt(plan.totalCoinsNeeded)}</span>
  </div>
</div>

<style>
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .k {
    flex: 1;
    font-size: 13px;
    color: var(--text-dim);
  }
  .v {
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 15px;
    color: var(--text);
    white-space: nowrap;
  }
  .v.gold {
    color: var(--accent);
    text-shadow: 0 0 8px rgba(255, 210, 0, 0.35);
  }
  .v.dim {
    color: var(--text-dim);
  }
  .switch {
    flex: none;
    font-size: 10px;
    padding: 3px 8px;
    letter-spacing: 0.1em;
  }
</style>
