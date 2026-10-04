<script lang="ts">
  import { computePlan } from './lib/planner/planner';
  import { urlState } from './lib/state/urlState.svelte';
  import { fmt } from './lib/utils/format';
  import { hideImg } from './lib/utils/dom';
  import InputPanel from './components/InputPanel.svelte';
  import CardPicker from './components/CardPicker.svelte';
  import SlotBoard from './components/SlotBoard.svelte';
  import PlanTimeline from './components/PlanTimeline.svelte';
  import SummaryPanel from './components/SummaryPanel.svelte';

  const baseUrl = import.meta.env.BASE_URL;

  const plan = $derived(
    computePlan({
      level: urlState.level,
      slotsUnlocked: urlState.slots,
      coinsOwned: urlState.coins,
      cards: urlState.cards,
      assumptions: urlState.assumptions,
    }),
  );

  $effect(() => {
    void urlState.snapshot();
    urlState.syncToUrl();
  });

  const warnings = $derived.by(() => {
    const w: string[] = [];
    if (urlState.cards.length === 0) w.push('Add legendary cards to build a plan.');
    if (urlState.level < 50 && urlState.cards.length > 0 && plan.availableSlotsNow === 0)
      w.push(`No legendary slots at level ${urlState.level} — the first slot unlocks at level 50, the plan starts there.`);
    if (urlState.cards.length > plan.availableSlotsNow && plan.nextSlotUnlock)
      w.push(`Only ${plan.availableSlotsNow} slot${plan.availableSlotsNow === 1 ? '' : 's'} usable — card ${plan.availableSlotsNow + 1}+ waits for level ${plan.nextSlotUnlock.level}.`);
    if (plan.stalled) w.push('Coin income is zero with the current assumptions — the plan cannot progress. Check the assumptions panel.');
    if (plan.coinsWastedToCap > 0) w.push(`${fmt(plan.coinsWastedToCap)} coins were lost to the 5,000 cap — consider spending or a manual extra income assumption.`);
    return w;
  });
</script>

<header>
  <div class="brand">
    <h1>Legendary Perk Planner</h1>
    <div class="sub">FALLOUT 76 · LEVEL → PERK COIN → 4★</div>
  </div>
  <div class="coinbag" title="perk coins on hand">
    <img src="{baseUrl}cards/perk-coin.webp" alt="" onerror={hideImg} />
    <span>{fmt(urlState.coins)}</span>
  </div>
</header>

<main>
  <aside>
    <InputPanel />
    <CardPicker />
  </aside>
  <section>
    <SummaryPanel {plan} />
    <SlotBoard {plan} />
    <PlanTimeline {plan} />
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
  .coinbag {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 20px;
    color: var(--accent);
    border: 1px solid var(--border-dim);
    padding: 6px 14px;
    background: var(--bg-inset);
  }
  .coinbag img {
    width: 22px;
    height: 22px;
  }
  main {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 16px;
    padding: 16px 22px;
    max-width: 1400px;
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
  @media (max-width: 980px) {
    main {
      grid-template-columns: 1fr;
    }
    aside {
      order: 2;
    }
    section {
      order: 1;
    }
  }
</style>
