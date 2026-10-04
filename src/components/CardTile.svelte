<script lang="ts">
  import type { LegendaryPerk } from '../lib/data/legendaryPerks';
  import { hideImg } from '../lib/utils/dom';
  import StarPips from './StarPips.svelte';

  let {
    perk,
    rank,
    layout = 'row',
    locked = false,
    lockLevel = null,
    note = '',
    active = false,
    interactive = false,
    onrankchange,
  }: {
    perk: LegendaryPerk;
    rank: number;
    layout?: 'row' | 'column';
    locked?: boolean;
    lockLevel?: number | null;
    note?: string;
    active?: boolean;
    interactive?: boolean;
    onrankchange?: (rank: number) => void;
  } = $props();

  const baseUrl = import.meta.env.BASE_URL;
</script>

<div class="tile {layout} {locked ? 'locked' : ''} {active ? 'active' : ''}">
  <div class="art">
    <img src="{baseUrl}cards/{perk.image}.webp" alt={perk.name} loading="lazy" onerror={hideImg} />
    <div class="fallback">?</div>
    {#if locked && lockLevel}
      <div class="lock"><span class="locklvl">LVL {lockLevel}</span></div>
    {/if}
    {#if perk.ghoulOnly}<span class="tag ghoul">GHOUL</span>{/if}
    {#if perk.humanOnly}<span class="tag human">HUMAN</span>{/if}
  </div>
  <div class="meta">
    <div class="name" title={perk.name}>{perk.name}</div>
    <StarPips {rank} size={layout === 'column' ? 'lg' : 'sm'} {interactive} onchange={onrankchange} />
    {#if note}
      <div class="note">{note}</div>
    {/if}
  </div>
</div>

<style>
  .tile {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }
  .art {
    position: relative;
    flex: none;
    width: 56px;
    height: 68px;
    background:
      linear-gradient(to bottom, #23282d, #14171a) padding-box,
      linear-gradient(to bottom, #4a5157, #262b2f) border-box;
    border: 1px solid transparent;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .art img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .fallback {
    font-family: var(--font-head);
    font-size: 22px;
    color: var(--text-faint);
  }
  .lock {
    position: absolute;
    inset: 0;
    background: rgba(8, 9, 10, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .locklvl {
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--accent-dim);
  }
  .tag {
    position: absolute;
    bottom: 3px;
    left: 3px;
    font-family: var(--font-head);
    font-size: 8px;
    letter-spacing: 0.08em;
    padding: 1px 4px;
    border-radius: 2px;
  }
  .tag.ghoul {
    background: #1d3a24;
    color: #8fce6f;
    border: 1px solid #2c5a37;
  }
  .tag.human {
    background: #3a2a1d;
    color: #d9a55e;
    border: 1px solid #5a432c;
  }
  .meta {
    min-width: 0;
  }
  .name {
    font-family: var(--font-head);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text);
  }
  .note {
    font-size: 11.5px;
    color: var(--text-dim);
    margin-top: 2px;
  }
  .locked .name {
    color: var(--text-faint);
  }
  .active .name {
    color: var(--accent);
  }

  .tile.column {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .column .art {
    width: 100%;
    height: 96px;
  }
  .column .meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    text-align: center;
  }
  .column .name {
    white-space: normal;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    font-size: 11.5px;
    line-height: 1.2;
    min-height: 28px;
  }
  .column .note {
    font-size: 10.5px;
    min-height: 13px;
  }
</style>
