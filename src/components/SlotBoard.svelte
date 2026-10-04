<script lang="ts">
  import { PERK_BY_ID } from '../lib/data/legendaryPerks';
  import { urlState } from '../lib/state/urlState.svelte';
  import type { PlanResult } from '../lib/planner/planner';
  import CardTile from './CardTile.svelte';

  let { plan }: { plan: PlanResult } = $props();

  let dragIndex = $state<number | null>(null);
  let overIndex = $state<number | null>(null);

  const visible = $derived(urlState.order.slice(0, 6));
  const overflow = $derived(Math.max(0, urlState.order.length - 6));

  const rows = $derived(
    visible.map((id, i) => {
      const perk = PERK_BY_ID.get(id);
      if (!perk) return null;
      const cp = plan.cardPlans[i] ?? { activateAtLevel: null, finishAtLevel: null, nextStep: null };
      const locked = cp.activateAtLevel === null || cp.activateAtLevel > urlState.level;
      let note = '';
      if (!locked && cp.finishAtLevel !== null && urlState.rankOf(id) < 4) {
        note = cp.nextStep ? `→ ${cp.nextStep.toRank}★ @ LVL ${cp.nextStep.level}` : `4★ @ LVL ${cp.finishAtLevel}`;
      } else if (urlState.rankOf(id) === 4) {
        note = 'maxed';
      } else if (locked) {
        note = 'waits for slot';
      }
      return { id, perk, cp, locked, note, index: i };
    }).filter((r) => r !== null),
  );

  function handleDrop(target: number) {
    const from = dragIndex;
    dragIndex = null;
    overIndex = null;
    if (from === null || from === target) return;
    if (target < visible.length) urlState.swap(from, target);
    else urlState.moveTo(from, target);
  }
</script>

<div class="panel">
  <div class="panel-title">Priority board <span class="sub">drag to swap · click the stars to set rank</span></div>

  <div class="board">
    {#each rows as row (row.id)}
      <div
        class="slot {row.locked ? 'locked' : ''} {overIndex === row.index && dragIndex !== null ? 'over' : ''}"
        role="listitem"
        draggable="true"
        ondragstart={() => (dragIndex = row.index)}
        ondragover={(e) => {
          e.preventDefault();
          overIndex = row.index;
        }}
        ondragleave={() => (overIndex = null)}
        ondrop={() => handleDrop(row.index)}
        ondragend={() => {
          dragIndex = null;
          overIndex = null;
        }}
      >
        <span class="prio">{row.index + 1}</span>
        <CardTile
          perk={row.perk}
          rank={urlState.rankOf(row.id)}
          layout="column"
          locked={row.locked}
          lockLevel={row.locked ? row.cp.activateAtLevel : null}
          note={row.note}
          active={!row.locked}
          interactive
          onrankchange={(r) => urlState.setRank(row.id, r)}
        />
        <button
          class="remove"
          aria-label="remove {row.perk.name}"
          title="remove from plan"
          onclick={() => urlState.removeCard(row.id)}>✕</button
        >
      </div>
    {/each}

    {#each Array(6 - visible.length) as _, i (i)}
      <div
        class="slot empty"
        role="listitem"
        ondragover={(e) => {
          e.preventDefault();
          overIndex = visible.length + i;
        }}
        ondragleave={() => (overIndex = null)}
        ondrop={() => handleDrop(visible.length + i)}
      >
        <span class="prio">{visible.length + i + 1}</span>
        <div class="placeholder">empty slot<br />add a card below</div>
      </div>
    {/each}
  </div>

  {#if overflow > 0}
    <div class="queue">+{overflow} more in queue — visible in the card list below</div>
  {/if}
</div>

<style>
  .panel-title .sub {
    font-weight: 500;
    color: var(--text-faint);
    letter-spacing: 0.08em;
    font-size: 11px;
    margin-left: 8px;
    text-transform: none;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .slot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 6px 8px;
    border: 1px solid var(--border-dim);
    border-radius: 6px;
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.02), transparent);
  }
  .slot[draggable='true'] {
    cursor: grab;
  }
  .slot.over {
    border-color: var(--accent);
    background: rgba(255, 210, 0, 0.06);
  }
  .slot.locked {
    opacity: 0.75;
    border-style: dashed;
  }
  .slot.empty {
    border-style: dashed;
    opacity: 0.55;
    justify-content: center;
    min-height: 190px;
  }
  .prio {
    position: absolute;
    top: 4px;
    left: 6px;
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 12px;
    color: var(--accent-dim);
  }
  .slot > :global(.tile) {
    flex: 1;
    min-width: 0;
  }
  .placeholder {
    font-size: 12px;
    color: var(--text-faint);
    text-align: center;
    line-height: 1.4;
  }
  .remove {
    position: absolute;
    top: 2px;
    right: 2px;
    padding: 0 5px;
    font-size: 10px;
    border: none;
    background: none;
    color: var(--text-faint);
  }
  .remove:hover {
    color: var(--danger);
  }
  .queue {
    margin-top: 8px;
    font-size: 12px;
    color: var(--text-faint);
    font-style: italic;
  }
</style>
