<script lang="ts">
  import type { LegendaryPerk } from '../lib/data/legendaryPerks';
  import { hideImg } from '../lib/utils/dom';
  import StarPips from './StarPips.svelte';

  const baseUrl = import.meta.env.BASE_URL;

  let {
    perk,
    rank,
    size = 'md',
    locked = false,
    lockLevel = null,
    note = '',
    active = false,
  }: {
    perk: LegendaryPerk;
    rank: number;
    size?: 'sm' | 'md';
    locked?: boolean;
    lockLevel?: number | null;
    note?: string;
    active?: boolean;
  } = $props();
</script>

<div class="tile {size} {locked ? 'locked' : ''} {active ? 'active' : ''}">
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
    <StarPips {rank} size={size === 'sm' ? 'sm' : 'md'} />
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
  .md .art {
    width: 62px;
    height: 76px;
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
</style>
