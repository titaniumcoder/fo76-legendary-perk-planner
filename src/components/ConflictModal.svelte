<script lang="ts">
  import { urlState } from '../lib/state/urlState.svelte';
  import { PERK_BY_ID } from '../lib/data/legendaryPerks';
  import type { AppState } from '../lib/utils/codec';

  const conflict = $derived(urlState.pendingConflict);

  function summary(s: AppState): string {
    const names = s.order.map((id) => PERK_BY_ID.get(id)?.name ?? id);
    const cards = names.length ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '') : 'no cards';
    return `LVL ${s.level} · ${cards} · ${s.coins} coins`;
  }
</script>

{#if conflict}
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
    <div class="modal">
      <h2 id="conflict-title">Link conflicts with your saved state</h2>
      <p>This link carries a plan, and this browser already has one saved locally.</p>
      <div class="options">
        <div class="opt">
          <h3>Saved here</h3>
          <p>{summary(conflict.local)}</p>
        </div>
        <div class="opt">
          <h3>From link</h3>
          <p>{summary(conflict.link)}</p>
        </div>
      </div>
      <div class="actions">
        <button class="primary" onclick={() => urlState.resolveConflict(true)}>Use local state</button>
        <button onclick={() => urlState.resolveConflict(false)}>Load link &amp; overwrite</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: grid;
    place-items: center;
    z-index: 50;
  }
  .modal {
    background: #1d1a12;
    border: 1px solid var(--border-dim);
    border-radius: 10px;
    padding: 22px 24px;
    max-width: 460px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }
  h2 {
    margin: 0 0 6px;
    font-size: 18px;
    color: var(--accent);
  }
  .modal > p {
    margin: 0 0 14px;
    color: var(--text-dim);
    font-size: 13px;
  }
  .options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
  }
  .opt {
    border: 1px solid var(--border-dim);
    border-radius: 8px;
    padding: 10px 12px;
  }
  .opt h3 {
    margin: 0 0 4px;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .opt p {
    margin: 0;
    font-size: 13px;
    color: var(--text-dim);
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
</style>