<script lang="ts">
  import type { PlanResult } from '../lib/planner/planner';
  import { fmt } from '../lib/utils/format';

  let { plan }: { plan: PlanResult } = $props();

  const done = $derived(plan.finishedAtLevel !== null);
</script>

<div class="panel">
  <div class="panel-title">Summary</div>
  <div class="stats">
    <div class="stat">
      <div class="num" class:gold={done}>{done ? `LVL ${fmt(plan.finishedAtLevel!)}` : '—'}</div>
      <div class="cap">{done ? 'all cards at 4★' : 'not finished'}</div>
    </div>
    <div class="stat">
      <div class="num">{fmt(plan.totalCoinsNeeded)}</div>
      <div class="cap">coins needed</div>
    </div>
    <div class="stat">
      <div class="num">{fmt(plan.coinsEarnedTotal)}</div>
      <div class="cap">coins earned on the way</div>
    </div>
    <div class="stat">
      <div class="num" class:warn={plan.coinsWastedToCap > 0}>{plan.coinsWastedToCap > 0 ? fmt(plan.coinsWastedToCap) : '0'}</div>
      <div class="cap">wasted at 5000 cap</div>
    </div>
  </div>
</div>

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 10px;
  }
  .stat {
    background: var(--bg-inset);
    border: 1px solid var(--border-dim);
    border-radius: 4px;
    padding: 8px 10px;
  }
  .num {
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 20px;
    letter-spacing: 0.04em;
    color: var(--text);
  }
  .num.gold {
    color: var(--accent);
    text-shadow: 0 0 8px rgba(255, 210, 0, 0.4);
  }
  .num.warn {
    color: var(--danger);
  }
  .cap {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-faint);
    margin-top: 2px;
  }
</style>
