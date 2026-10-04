<script lang="ts">
  import { urlState } from '../lib/state/urlState.svelte';
  import type { PlanResult, PlanEvent } from '../lib/planner/planner';
  import { fmt, stars } from '../lib/utils/format';

  let { plan }: { plan: PlanResult } = $props();

  const grouped = $derived.by(() => {
    const groups: Array<{ level: number; events: PlanEvent[] }> = [];
    for (const e of plan.events) {
      const last = groups[groups.length - 1];
      if (last && last.level === e.level) last.events.push(e);
      else groups.push({ level: e.level, events: [e] });
    }
    return groups;
  });
</script>

<div class="panel">
  <div class="panel-title">Plan timeline</div>
  {#if grouped.length === 0}
    <div class="empty">
      {#if urlState.cards.length === 0}
        Add cards from the picker to generate a plan.
      {:else if plan.allDone}
        All selected cards are already 4★. 🏆
      {:else}
        No affordable upgrades yet — keep leveling.
      {/if}
    </div>
  {:else}
    <div class="timeline">
      {#each grouped as g (g.level)}
        <div class="lvlrow">
          <span class="lvl">LVL {fmt(g.level)}</span>
          {#if g.level <= urlState.level}<span class="now">NOW</span>{/if}
        </div>
        {#each g.events as e, i (i)}
          <div class="ev">
            <span class="card">{e.cardName}</span>
            <span class="rank">{e.fromRank}★ → {e.toRank}★</span>
            <span class="cost">−{fmt(e.cost)}</span>
            <span class="left">· {fmt(e.coinsAfter)} left</span>
          </div>
        {/each}
      {/each}
    </div>
  {/if}
</div>

<style>
  .empty {
    color: var(--text-faint);
    font-style: italic;
    padding: 6px 0;
  }
  .timeline {
    max-height: 420px;
    overflow-y: auto;
  }
  .lvlrow {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.1em;
    color: var(--accent);
    border-bottom: 1px solid var(--border-dim);
    padding: 8px 0 3px;
  }
  .lvlrow:first-child {
    padding-top: 0;
  }
  .now {
    font-size: 9px;
    background: var(--accent);
    color: #111;
    padding: 1px 5px;
    border-radius: 2px;
    letter-spacing: 0.12em;
  }
  .ev {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0 3px 14px;
    font-size: 13.5px;
  }
  .card {
    color: var(--text);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rank {
    color: var(--accent-dim);
    font-family: var(--font-head);
    font-size: 12px;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .cost {
    color: var(--danger);
    font-weight: 700;
    white-space: nowrap;
  }
  .left {
    color: var(--text-faint);
    font-size: 12px;
    white-space: nowrap;
  }
</style>
