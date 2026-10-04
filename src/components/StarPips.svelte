<script lang="ts">
  let {
    rank,
    max = 4,
    size = 'md',
    interactive = false,
    /** REGULAR mode: only the next star can be bought; per-star clickability overrides */
    buyable = null,
    onchange,
  }: {
    rank: number;
    max?: number;
    size?: 'sm' | 'md' | 'lg';
    interactive?: boolean;
    /** if provided: only star (rank+1) is clickable; map from star index (0-based) to allowed */
    buyable?: ((starIndex: number) => boolean) | null;
    onchange?: (rank: number) => void;
  } = $props();

  const clickable = (i: number): boolean => {
    if (!interactive) return false;
    if (buyable) return buyable(i);
    return true;
  };
</script>

<span class="pips {size}" role={interactive ? 'slider' : undefined} aria-label="rank {rank} of {max}">
  {#each Array(max) as _, i (i)}
    {#if clickable(i)}
      <button class="pip {i < rank ? 'on' : ''} {buyable && i === rank ? 'next' : ''}" onclick={() => onchange?.(i + 1)} title="rank {i + 1}">◆</button>
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
  button.pip.next {
    text-shadow: 0 0 9px rgba(255, 210, 0, 0.55);
  }
</style>
