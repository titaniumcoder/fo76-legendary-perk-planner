<script lang="ts">
  import { urlState } from '../lib/state/urlState.svelte';
  import { CARDS_PER_PACK, SLOT_MILESTONES, slotsUnlockedAtLevel } from '../lib/planner/rules';

  let copied = $state(false);

  const autoSlots = $derived(slotsUnlockedAtLevel(urlState.level));

  function copyLink() {
    navigator.clipboard.writeText(urlState.currentUrl()).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 1500);
    });
  }
</script>

<div class="panel">
  <div class="panel-title">Character</div>

  <div class="row">
    <label class="label" for="level">Current level</label>
    <input id="level" type="number" min="1" max="32767" bind:value={urlState.level} />
  </div>

  <div class="row">
    <span class="label">Slots unlocked (account-wide)</span>
    <div class="slotbtns">
      {#each [0, 1, 2, 3, 4, 5, 6] as s (s)}
        <button class:sel={urlState.slots === s} onclick={() => (urlState.slots = s)}>{s}</button>
      {/each}
    </div>
    <div class="hint">
      {#if autoSlots > urlState.slots}
        This character already reaches {autoSlots} slot{autoSlots === 1 ? '' : 's'} at level {urlState.level} — using {Math.max(urlState.slots, autoSlots)}.
      {:else if urlState.slots > autoSlots}
        Unlocked by another character — usable here from level {SLOT_MILESTONES[0]}.
      {:else}
        Auto at this level: {autoSlots}.
      {/if}
    </div>
  </div>

  <div class="row">
    <label class="label" for="coins">Perk coins on hand</label>
    <input id="coins" type="number" min="0" max="5000" bind:value={urlState.coins} />
  </div>
</div>

<div class="panel">
  <div class="panel-title">Share &amp; reset</div>
  <div class="btnrow">
    <button class="primary" onclick={copyLink}>{copied ? 'Copied!' : 'Copy plan link'}</button>
    <button
      onclick={() => {
        urlState.cards = [];
        urlState.coins = 0;
      }}>Clear cards</button
    >
  </div>
  <div class="hint">The plan lives in the URL — bookmark it or send it to another device.</div>
</div>

<details class="panel assumptions">
  <summary class="panel-title">Assumptions</summary>
  <div class="row">
    <label class="label" for="apick">Coins per scrapped pick</label>
    <input id="apick" type="number" min="0" max="50" bind:value={urlState.assumptions.coinsPerPick} />
  </div>
  <div class="row">
    <label class="label" for="apack">Cards per pack (coins = ×2)</label>
    <input id="apack" type="number" min="0" max="10" bind:value={urlState.assumptions.coinsPerPack} />
    <div class="hint">Wiki says 4 cards/pack ({CARDS_PER_PACK * 2} coins). If foil cards can't be scrapped, set 3 ({(CARDS_PER_PACK - 1) * 2} coins).</div>
  </div>
  <div class="row">
    <label class="label" for="abonus">One-time level-50 bonus</label>
    <input id="abonus" type="number" min="0" max="1000" bind:value={urlState.assumptions.level50Bonus} />
  </div>
</details>

<style>
  .panel {
    margin-bottom: 14px;
  }
  .row {
    margin-bottom: 12px;
  }
  .row:last-child {
    margin-bottom: 0;
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
  .btnrow {
    display: flex;
    gap: 8px;
  }
  .btnrow button {
    flex: 1;
  }
  details.assumptions summary {
    cursor: pointer;
    list-style: none;
  }
  details.assumptions summary::-webkit-details-marker {
    display: none;
  }
  details.assumptions summary::before {
    content: '▸ ';
    color: var(--accent-dim);
  }
  details[open].assumptions summary::before {
    content: '▾ ';
  }
  details.assumptions .row:first-of-type {
    margin-top: 10px;
  }
</style>
