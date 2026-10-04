<script lang="ts">
  import { LEGENDARY_PERKS } from '../lib/data/legendaryPerks';
  import { urlState } from '../lib/state/urlState.svelte';
  import CardTile from './CardTile.svelte';

  const selectedIds = $derived(new Set(urlState.cards.map((c) => c.id)));
  const full = $derived(urlState.cards.length >= 6);

  function toggle(id: string) {
    if (selectedIds.has(id)) {
      urlState.cards = urlState.cards.filter((c) => c.id !== id);
    } else if (!full) {
      urlState.cards = [...urlState.cards, { id, rank: 1 }];
    }
  }
</script>

<div class="panel">
  <div class="panel-title">Add legendary cards <span class="count">{urlState.cards.length}/6</span></div>
  {#if full}
    <div class="warn">Six cards selected — remove one to add another.</div>
  {/if}
  <div class="grid">
    {#each LEGENDARY_PERKS as perk (perk.id)}
      <button
        class="pick {selectedIds.has(perk.id) ? 'sel' : ''}"
        onclick={() => toggle(perk.id)}
        disabled={!selectedIds.has(perk.id) && full}
        title={perk.ranks[0]}
      >
        <CardTile perk={perk} rank={1} size="sm" />
      </button>
    {/each}
  </div>
</div>

<style>
  .panel {
    margin-bottom: 14px;
  }
  .count {
    color: var(--accent-dim);
    letter-spacing: 0.05em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 6px;
  }
  .pick {
    display: block;
    width: 100%;
    padding: 5px 8px;
    text-align: left;
    text-transform: none;
    letter-spacing: normal;
    font-family: var(--font-body);
    background: var(--bg-inset);
    border: 1px solid var(--border-dim);
  }
  .pick:hover:not(:disabled) {
    border-color: var(--accent-dim);
    color: var(--text);
  }
  .pick.sel {
    border-color: var(--accent);
    background: rgba(255, 210, 0, 0.08);
  }
  .pick:disabled {
    opacity: 0.35;
  }
</style>
