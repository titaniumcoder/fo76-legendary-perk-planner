<script lang="ts">
  import type { PlanResult } from '../lib/planner/planner';
  import { urlState } from '../lib/state/urlState.svelte';
  import { fmt } from '../lib/utils/format';

  let { plan }: { plan: PlanResult } = $props();

  const summary = $derived(
    plan.finishedAtLevel !== null
      ? `all 4★ @ LVL ${fmt(plan.finishedAtLevel)}`
      : plan.stalled
        ? 'stalled'
        : 'in progress',
  );
</script>

<div class="panel">
  <div class="panel-title">
    Plan timeline
    <span class="sum">{summary} · need {fmt(plan.totalCoinsNeeded)}</span>
    <span class="didhint" title="Click ✓ on a step once you actually reached that level in game — the character state catches up (level, rank-ups, remaining coins)">✓ = I'm here</span>
  </div>
  {#if plan.events.length === 0}
    <div class="empty">
      {#if plan.stalled}
        Coin income is zero with the current assumptions.
      {:else if plan.allDone}
        All selected cards are already 4★.
      {:else}
        No affordable upgrades yet — keep leveling.
      {/if}
    </div>
  {:else}
    <div class="timeline">
      {#each plan.events as e, i (e.level + e.cardId + e.toRank)}
        <div class="ev" title="{e.cardName} → {e.toRank}★ at level {fmt(e.level)} (−{fmt(e.cost)} coins)">
          <button
            class="did"
            aria-label="Assume it happened: {e.cardName} → {e.toRank}★ at level {fmt(e.level)}"
            title="Assume this happened — jump to level {fmt(e.level)}, apply all rank-ups up to here and set coins to whatever remains after the level-ups"
            onclick={() => urlState.applyPlanUpTo(plan.events, i)}
          >✓</button>
          <span class="what">{e.cardName} <span class="stars">{'★'.repeat(e.toRank)}</span></span>
          <span class="lvl">{fmt(e.level)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .panel-title .sum {
    font-weight: 500;
    color: var(--text-dim);
    letter-spacing: 0.05em;
    font-size: 11px;
    margin-left: 6px;
    text-transform: none;
  }
  .didhint {
    margin-left: auto;
    font-size: 10px;
    color: var(--text-faint);
    letter-spacing: 0.05em;
    text-transform: none;
    cursor: help;
  }
  .did {
    flex: none;
    width: 20px;
    height: 20px;
    padding: 0;
    font-size: 11px;
    line-height: 1;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: rgba(10, 12, 13, 0.6);
    color: var(--text-dim);
  }
  .did:hover {
    color: var(--accent);
    border-color: var(--accent);
    background: rgba(10, 12, 13, 0.85);
  }
  .empty {
    color: var(--text-faint);
    font-style: italic;
    padding: 6px 0;
  }
  .timeline {
    max-height: 46vh;
    overflow-y: auto;
  }
  .ev {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0;
    font-size: 12.5px;
  }
  .what {
    color: var(--text);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stars {
    color: var(--accent);
    letter-spacing: 1px;
  }
  .lvl {
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
    color: var(--accent-dim);
    white-space: nowrap;
  }
</style>
