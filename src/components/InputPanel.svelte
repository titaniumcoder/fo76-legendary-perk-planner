<script lang="ts">
  import { urlState } from '../lib/state/urlState.svelte';
  import { MAX_LEVEL, SLOT_MILESTONES, slotsUnlockedAtLevel } from '../lib/planner/rules';

  const autoSlots = $derived(slotsUnlockedAtLevel(urlState.level));
  const effectiveSlots = $derived(Math.max(urlState.slots, autoSlots));

  // drafts commit on blur (recording the undoable action); synced back on any
  // external change (undo/redo, ✓ fast-forward, pasted links)
  let levelDraft = $state<number | null>(urlState.level);
  let coinsDraft = $state<number | null>(urlState.coins);

  $effect(() => {
    levelDraft = urlState.level;
  });
  $effect(() => {
    coinsDraft = urlState.coins;
  });

  // a character can never have fewer slots than its level grants: bump the
  // stored selection when the entered level crosses a milestone
  $effect(() => {
    if (urlState.slots < autoSlots) urlState.slots = autoSlots;
  });
</script>

<div class="panel">
  <div class="panel-title">Character</div>

  <div class="row">
    <label class="label" for="level">Current level</label>
    <div class="lvlrow">
      <input
        id="level"
        type="number"
        min="1"
        max={MAX_LEVEL}
        bind:value={levelDraft}
        onblur={() => urlState.setLevel(Number(levelDraft))}
      />
      <button
        class="lvlup"
        onclick={() => urlState.levelUp()}
        disabled={urlState.level >= MAX_LEVEL}
        title="Level up: gain the coins for the next level — buying ranks stays manual. Use ✓ in the plan timeline to fast-forward to a plan point."
      >+1</button>
    </div>
  </div>

  <div class="row">
    <span class="label">Slots unlocked (account-wide)</span>
    <div class="slotbtns">
      {#each [0, 1, 2, 3, 4, 5, 6] as s (s)}
        <button
          class:sel={effectiveSlots === s}
          disabled={s < autoSlots}
          onclick={() => (urlState.slots = s)}
        >{s}</button>
      {/each}
    </div>
    <div class="hint">
      {#if urlState.slots > autoSlots}
        Unlocked by another character — usable here from level {SLOT_MILESTONES[0]}.
      {:else}
        Auto at this level: {autoSlots}.
      {/if}
    </div>
  </div>

  <div class="row">
    <label class="label" for="coins">Perk coins on hand</label>
    <div class="lvlrow">
      <input
        id="coins"
        type="number"
        min="0"
        bind:value={coinsDraft}
        onblur={() => urlState.setCoins(Number(coinsDraft))}
      />
      <button
        class="lvlup"
        onclick={() => urlState.addCoins(25)}
        title="Add 25 perk coins (typical scoreboard/challenge reward)"
      >+25</button>
    </div>
  </div>
</div>

<style>
  .row {
    margin-bottom: 12px;
  }
  .row:last-child {
    margin-bottom: 0;
  }
  .lvlrow {
    display: flex;
    gap: 6px;
  }
  .lvlup {
    flex: none;
    width: 44px;
    font-size: 16px;
    font-weight: 700;
    padding: 4px 0;
  }
  .slotbtns {
    display: flex;
    gap: 4px;
  }
  .slotbtns button {
    flex: 1;
    padding: 6px 0;
  }
  .slotbtns button.sel {
    background: linear-gradient(to bottom, #3a3320, #2a2517);
    border-color: var(--accent);
    color: var(--accent);
  }
  .hint {
    margin-top: 4px;
  }
</style>
