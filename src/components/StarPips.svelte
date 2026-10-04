<script lang="ts">
  let {
    rank,
    max = 4,
    size = 'md',
    interactive = false,
    onchange,
  }: {
    rank: number;
    max?: number;
    size?: 'sm' | 'md' | 'lg';
    interactive?: boolean;
    onchange?: (rank: number) => void;
  } = $props();
</script>

<span class="pips {size}" role={interactive ? 'slider' : undefined} aria-label="rank {rank} of {max}">
  {#each Array(max) as _, i (i)}
    {#if interactive}
      <button class="pip {i < rank ? 'on' : ''}" onclick={() => onchange?.(i + 1)} title="rank {i + 1}">◆</button>
    {:else}
      <span class="pip {i < rank ? 'on' : ''}">◆</span>
    {/if}
  {/each}
</span>

<style>
  .pips {
    display: inline-flex;
    gap: 2px;
    white-space: nowrap;
  }
  .pip {
    color: var(--border);
    line-height: 1;
    background: none;
    border: none;
    padding: 0;
    text-transform: none;
    letter-spacing: normal;
    font-family: inherit;
  }
  .pip.on {
    color: var(--accent);
    text-shadow: 0 0 6px rgba(255, 210, 0, 0.45);
  }
  .sm .pip {
    font-size: 9px;
  }
  .md .pip {
    font-size: 12px;
  }
  .lg .pip {
    font-size: 21px;
  }
  .lg {
    gap: 4px;
  }
  button.pip {
    cursor: pointer;
    padding: 2px;
  }
  button.pip:hover {
    color: var(--accent-dim);
    transform: scale(1.15);
  }
</style>
