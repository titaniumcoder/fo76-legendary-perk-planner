<script lang="ts">
  import { computePlan } from './lib/planner/planner';
  import { urlState } from './lib/state/urlState.svelte';
  import InputPanel from './components/InputPanel.svelte';
  import ProjectionPanel from './components/ProjectionPanel.svelte';
  import CardPicker from './components/CardPicker.svelte';
  import SlotBoard from './components/SlotBoard.svelte';
  import PlanTimeline from './components/PlanTimeline.svelte';

  let copied = $state(false);

  const plan = $derived(
    computePlan({
      level: urlState.level,
      slotsUnlocked: urlState.slots,
      coinsOwned: urlState.coins,
      cards: urlState.plannerCards(),
      assumptions: urlState.assumptions,
      rememberedRanks: urlState.ranks,
    }),
  );

  $effect(() => {
    void urlState.snapshot();
    urlState.syncToUrl();
  });

  function copyLink() {
    navigator.clipboard.writeText(urlState.currentUrl()).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 1500);
    });
  }
</script>

<header>
  <div class="brand">
    <h1>Legendary Perk Planner</h1>
    <div class="sub">FALLOUT 76 · LEVEL → PERK COIN → 4★</div>
  </div>
  <div class="actions">
    <button
      class="modetoggle"
      class:live={urlState.mode === 'regular'}
      aria-pressed={urlState.mode === 'regular'}
      title={urlState.mode === 'regular' ? 'Regular mode: buying ranks costs real perk coins. Click to switch back to setup.' : 'Setup mode: set ranks freely. Click to switch to regular mode (buying costs coins).'}
      onclick={() => urlState.setMode(urlState.mode === 'regular' ? 'setup' : 'regular')}
    >Mode: {urlState.mode === 'regular' ? 'Regular' : 'Setup'}</button>
    <button onclick={copyLink}>{copied ? 'Copied!' : 'Copy plan link'}</button>
    <button
      disabled={!urlState.canUndo}
      title={urlState.nextUndoLabel()
        ? `Undo: ${urlState.nextUndoLabel()} (session-only history)`
        : 'Nothing to undo'}
      onclick={() => urlState.undo()}
    >Undo</button>
    <button
      disabled={!urlState.canRedo}
      title={urlState.nextRedoLabel()
        ? `Redo: ${urlState.nextRedoLabel()} (session-only history)`
        : 'Nothing to redo'}
      onclick={() => urlState.redo()}
    >Redo</button>
    <button onclick={() => urlState.reset()}>Reset</button>
  </div>
</header>

<main>
  <aside>
    <InputPanel />
    <ProjectionPanel {plan} />
    <PlanTimeline {plan} />
  </aside>
  <section>
    <SlotBoard {plan} />
    <CardPicker />
  </section>
</main>

<footer>
  Fan tool, not affiliated with Bethesda or ZeniMax. Rules verified against Update 22 patch notes &amp; Nukapedia · scoreboards are not simulated — account for them via coins on hand.
</footer>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px 12px;
    border-bottom: 1px solid var(--border-dim);
    background: linear-gradient(to bottom, rgba(255, 210, 0, 0.04), transparent);
  }
  h1 {
    font-size: 26px;
    font-weight: 700;
    color: var(--accent);
    text-shadow: 0 0 14px rgba(255, 210, 0, 0.25);
  }
  .sub {
    font-family: var(--font-head);
    font-size: 11px;
    letter-spacing: 0.3em;
    color: var(--text-dim);
    margin-top: 2px;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .modetoggle.live {
    background: linear-gradient(to bottom, #3a3320, #2a2517);
    border-color: var(--accent);
    color: var(--accent);
  }
  main {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 16px;
    padding: 16px 22px;
    max-width: 1500px;
    margin: 0 auto;
  }
  aside,
  section {
    min-width: 0;
  }
  footer {
    text-align: center;
    color: var(--text-faint);
    font-size: 12px;
    padding: 20px 22px 26px;
    border-top: 1px solid var(--border-dim);
  }
</style>
