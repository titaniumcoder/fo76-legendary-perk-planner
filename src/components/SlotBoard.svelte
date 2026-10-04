<script lang="ts">
  import { PERK_BY_ID } from '../lib/data/legendaryPerks';
  import { urlState } from '../lib/state/urlState.svelte';
  import type { PlanResult } from '../lib/planner/planner';
  import CardTile from './CardTile.svelte';
  import StarPips from './StarPips.svelte';

  let { plan }: { plan: PlanResult } = $props();

  let dragIndex = $state<number | null>(null);

  const rows = $derived(
    urlState.cards.map((c, i) => {
      const perk = PERK_BY_ID.get(c.id);
      if (!perk) return null;
      const cp = plan.cardPlans[i] ?? { activateAtLevel: 0, finishAtLevel: null, nextStep: null };
      const locked = cp.activateAtLevel > urlState.level;
      let note = '';
      if (!locked && cp.finishAtLevel !== null && c.rank < 4) {
        note = cp.nextStep
          ? `→ ${cp.nextStep.toRank}★ @ Lvl ${cp.nextStep.level}`
          : `4★ @ Lvl ${cp.finishAtLevel}`;
      } else if (c.rank === 4) {
        note = 'maxed';
      } else if (locked) {
        note = 'waits for slot';
      }
      return { c, perk, cp, locked, note, index: i };
    }).filter((r) => r !== null),
  );

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= urlState.cards.length) return;
    const arr = [...urlState.cards];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    urlState.cards = arr;
  }

  function drop(i: number) {
    const from = dragIndex;
    dragIndex = null;
    if (from === null || from === i) return;
    const arr = [...urlState.cards];
    const [m] = arr.splice(from, 1);
    arr.splice(i, 0, m);
    urlState.cards = arr;
  }
</script>

<div class="panel">
  <div class="panel-title">Priority board <span class="sub">top = highest priority</span></div>

  {#each rows as row (row.c.id)}
    <div
      class="slot {row.locked ? 'locked' : ''}"
      role="listitem"
      draggable="true"
      ondragstart={() => (dragIndex = row.index)}
      ondragover={(e) => e.preventDefault()}
      ondrop={() => drop(row.index)}
      ondragend={() => (dragIndex = null)}
    >
      <span class="prio">{row.index + 1}</span>
      <CardTile
        perk={row.perk}
        rank={row.c.rank}
        locked={row.locked}
        lockLevel={row.locked ? row.cp.activateAtLevel : null}
        note={row.note}
        active={!row.locked}
      />
      <div class="controls">
        <StarPips rank={row.c.rank} interactive onchange={(r) => (urlState.cards = urlState.cards.map((c, i) => (i === row.index ? { ...c, rank: r } : c)))} />
        <div class="mini">
          <button aria-label="move up" disabled={row.index === 0} onclick={() => move(row.index, -1)}>▲</button>
          <button aria-label="move down" disabled={row.index === urlState.cards.length - 1} onclick={() => move(row.index, 1)}>▼</button>
          <button
            aria-label="remove"
            class="remove"
            onclick={() => (urlState.cards = urlState.cards.filter((c) => c.id !== row.c.id))}>✕</button
          >
        </div>
      </div>
    </div>
  {/each}

  {#each Array(Math.max(0, 6 - urlState.cards.length)) as _, i (i)}
    <div class="slot empty">
      <span class="prio">{urlState.cards.length + i + 1}</span>
      <div class="placeholder">
        {#if plan.nextSlotUnlock && plan.nextSlotUnlock.slotIndex === urlState.cards.length + i + 1}
          slot unlocks at level {plan.nextSlotUnlock.level}
        {:else}
          empty slot — add a card below
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .panel-title .sub {
    font-weight: 500;
    color: var(--text-faint);
    letter-spacing: 0.08em;
    font-size: 11px;
    margin-left: 8px;
  }
  .slot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 6px;
    border: 1px solid var(--border-dim);
    border-radius: 4px;
    margin-bottom: 6px;
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.02), transparent);
  }
  .slot[draggable='true'] {
    cursor: grab;
  }
  .slot.locked {
    opacity: 0.75;
    border-style: dashed;
  }
  .slot.empty {
    border-style: dashed;
    opacity: 0.55;
  }
  .prio {
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 15px;
    color: var(--accent-dim);
    width: 18px;
    text-align: center;
    flex: none;
  }
  .slot > :global(.tile) {
    flex: 1;
    min-width: 0;
  }
  .placeholder {
    font-size: 13px;
    color: var(--text-faint);
    font-style: italic;
  }
  .controls {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    flex: none;
  }
  .mini {
    display: flex;
    gap: 3px;
  }
  .mini button {
    padding: 2px 7px;
    font-size: 10px;
  }
  .mini button.remove:hover {
    color: var(--danger);
    border-color: var(--danger);
  }
</style>
