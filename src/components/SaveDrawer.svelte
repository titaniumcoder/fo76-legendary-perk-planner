<script lang="ts">
  import { urlState } from '../lib/state/urlState.svelte';
  import type { NamedSave } from '../lib/state/storage';

  let open = $state(false);
  let saves = $state<NamedSave[]>([]);
  let name = $state('');
  /** two-step confirm: set to the name awaiting an overwrite click */
  let confirmOverwrite = $state<string | null>(null);

  $effect(() => {
    if (open) saves = urlState.listSaves();
  });

  function doSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (saves.some((s) => s.name === trimmed) && confirmOverwrite !== trimmed) {
      confirmOverwrite = trimmed;
      return;
    }
    urlState.saveAs(trimmed);
    name = '';
    confirmOverwrite = null;
    saves = urlState.listSaves();
  }

  function load(n: string) {
    urlState.loadSave(n);
    open = false;
  }

  function del(n: string) {
    saves = urlState.deleteSave(n);
    if (confirmOverwrite === n) confirmOverwrite = null;
  }

  function fmt(ts: number): string {
    return ts ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  }

  function summary(s: NamedSave): string {
    return `LVL ${s.state.level} · ${s.state.order.length} card${s.state.order.length === 1 ? '' : 's'}`;
  }
</script>

<div class="saves">
  <button
    class="toggle"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >Saves {saves.length ? `(${saves.length})` : ''}</button>

  {#if open}
    <div class="panel">
      <div class="row">
        <input
          type="text"
          placeholder="Save name…"
          bind:value={name}
          onkeydown={(e) => e.key === 'Enter' && doSave()}
        />
        <button class="primary" onclick={doSave}>
          {confirmOverwrite && confirmOverwrite === name.trim() ? 'Overwrite?' : 'Save'}
        </button>
      </div>
      {#if saves.length === 0}
        <p class="empty">No saved plans yet.</p>
      {:else}
        <ul>
          {#each saves as s (s.name)}
            <li>
              <button class="loadbtn" title={`Load ${s.name}`} onclick={() => load(s.name)}>
                <span class="name">{s.name}</span>
                <span class="meta">{summary(s)}{s.savedAt ? ` · ${fmt(s.savedAt)}` : ''}</span>
              </button>
              <button class="del" title={`Delete ${s.name}`} onclick={() => del(s.name)}>✕</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .saves {
    position: relative;
  }
  .toggle {
    background: transparent;
    height: 34px;
    box-sizing: border-box;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
  }
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: 260px;
    background: #1d1a12;
    border: 1px solid var(--border-dim);
    border-radius: 10px;
    padding: 12px;
    z-index: 40;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  .row {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }
  input {
    flex: 1;
    min-width: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 260px;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: stretch;
    gap: 4px;
    margin-bottom: 4px;
  }
  .loadbtn {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    text-align: left;
    background: transparent;
    border: 1px solid var(--border-dim);
  }
  .loadbtn:hover {
    border-color: var(--accent);
  }
  .name {
    font-size: 13px;
    color: var(--text);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 11px;
    color: var(--text-faint);
  }
  .del {
    background: transparent;
    border: 1px solid var(--border-dim);
    color: var(--text-faint);
    padding: 0 8px;
  }
  .del:hover {
    color: #ff7b6b;
    border-color: #ff7b6b;
  }
  .empty {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--text-faint);
  }
</style>