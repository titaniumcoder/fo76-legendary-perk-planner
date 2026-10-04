<script lang="ts">
  import type { PlanResult, PlanEvent } from '../lib/planner/planner';
  import { fmt } from '../lib/utils/format';

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

  const summary = $derived(
    plan.finishedAtLevel !== null
      ? `all 4★ @ LVL ${fmt(plan.finishedAtLevel)}`
      : plan.stalled
        ? 'stalled'
        : 'in progress',
  );
</script>

<div class="panel">
  <div class="panel-title">Plan timeline <span class="sum">{summary} · need {fmt(plan.totalCoinsNeeded)}</span></div>
  {#if grouped.length === 0}
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
      {#each grouped as g (g.level)}
        <div class="lvlrow"><span class="lvl">LVL {fmt(g.level)}</span></div>
        {#each g.events as e, i (i)}
          <div class="ev">
            <span class="card" title={e.cardName}>{e.cardName}</span>
            <span class="rank">{e.fromRank}★→{e.toRank}★</span>
            <span class="cost">−{fmt(e.cost)}</span>
            <span class="left">· {fmt(e.coinsAfter)} left</span>
          </div>
        {/each}
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
  .empty {
    color: var(--text-faint);
    font-style: italic;
    padding: 6px 0;
  }
  .timeline {
    max-height: 46vh;
    overflow-y: auto;
  }
  .lvlrow {
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.1em;
    color: var(--accent);
    border-bottom: 1px solid var(--border-dim);
    padding: 7px 0 2px;
  }
  .lvlrow:first-child {
    padding-top: 0;
  }
  .ev {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 3px 0 3px 10px;
    font-size: 12.5px;
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
    font-size: 11px;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .cost {
    color: var(--danger);
    font-weight: 700;
    white-space: nowrap;
  }
  .left {
    color: var(--text-faint);
    font-size: 11px;
    white-space: nowrap;
  }
</style>
