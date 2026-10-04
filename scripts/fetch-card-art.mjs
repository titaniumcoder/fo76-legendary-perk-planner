#!/usr/bin/env node
/**
 * One-time asset fetch: downloads FO76 legendary perk card art + perk coin icon
 * from the Fallout Wiki (Nukapedia) into public/cards/.
 * Personal, unpublished project — per wiki content guidelines.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://fallout.fandom.com/api.php';
const UA = 'FO76PerkPlanner/1.0 (personal project; contact: local)';
const OUT_DIR = new URL('../public/cards/', import.meta.url).pathname;

/** card id stem → wiki file title */
const FILES = {
  'ammo-factory': 'FO76OW_Legend_card_Ammo_Factory.png',
  'blood-sacrifice': 'FO76OW_Legend_card_Blood_Sacrf.png',
  'brawling-chemist': 'FO76OW_Legend_card_Brawl_chem.png',
  'hack-and-slash': 'FO76OW_Legend_card_Hack_Slash.png',
  'collateral-damage': 'FO76OW_Legend_card_Collat_Dam_1.png',
  'detonation-contagion': 'FO76OW_Legend_card_Det_Contang.png',
  'electric-absorption': 'FO76OW_Legend_card_Elec_Absor.png',
  'exploding-palm': 'FO76OW_Legend_card_Expl_palm.png',
  'far-flung-fireworks': 'FO76OW_Legend_card_Far_flung.png',
  'funky-duds': 'FO76OW_Legend_card_Funky_Duds.png',
  'follow-through': 'FO76OW_Legend_cardFollow_through.png',
  'legendary-agility': 'FO76OW_Legend_cardAgility.png',
  'legendary-charisma': 'FO76OW_Legend_card_Charisma.png',
  'legendary-endurance': 'FO76OW_Legend_cardEndu.png',
  'legendary-luck': 'FO76OW_Legend_card_Luck.png',
  'legendary-intelligence': 'FO76OW_Legend_card_Int.png',
  'legendary-perception': 'FO76OW_Legend_card_Perc.png',
  'legendary-strength': 'FO76OW_Legend_card_Str.png',
  'master-infiltrator': 'FO76OW_Legend_card_Mast_Inf.png',
  'power-armor-reboot': 'FO76OW_Legend_card_Power_Armor_reb.png',
  'power-sprinter': 'FO76OW_Legend_card_Power_Sprint.png',
  retribution: 'FO76OW_Legend_card_retrib.png',
  'sizzling-style': 'FO76OW_Legend_card_sizzstyle.png',
  'survival-shortcut': 'FO76OW_Legend_card_surv_short.png',
  'taking-one-for-the-team': 'FO76OW_Legend_card_take_team.png',
  'what-rads': 'FO76OW_Legend_card_what_rads.png',
  'action-diet': 'Action_diet.png',
  'feral-rage': 'Feral_rage.png',
  'perk-coin': 'Score_currency_perkcoin_l.webp',
};

async function fetchJson(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const titles = Object.entries(FILES).map(([stem, file]) => `File:${file}`);
  const url = `${API}?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=160&titles=${encodeURIComponent(titles.join('|'))}`;
  const data = await fetchJson(url);

  const titleToStem = new Map(Object.entries(FILES).map(([stem, file]) => [`File:${file.replace(/ /g, '_')}`, stem]));
  const downloads = [];

  for (const page of Object.values(data.query.pages)) {
    const title = page.title;
    const stem = titleToStem.get(title.replaceAll(' ', '_'));
    if (!stem) continue;
    if (page.missing || !page.imageinfo?.[0]?.thumburl) {
      console.warn(`MISSING: ${title}`);
      continue;
    }
    downloads.push({ stem, url: page.imageinfo[0].thumburl });
  }

  let ok = 0;
  for (const { stem, url: dl } of downloads) {
    try {
      const res = await fetch(dl, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(path.join(OUT_DIR, `${stem}.webp`), buf);
      ok++;
      console.log(`ok: ${stem}.webp`);
    } catch (e) {
      console.warn(`FAILED: ${stem}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\n${ok}/${Object.keys(FILES).length} assets downloaded to ${OUT_DIR}`);
  if (ok < Object.keys(FILES).length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
