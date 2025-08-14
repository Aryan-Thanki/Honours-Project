import fs from 'fs';
import gplay from 'google-play-scraper';
import pLimit from 'p-limit';
import { createObjectCsvWriter } from 'csv-writer';
import puppeteer from 'puppeteer';

// ===== CONFIG =====
const COUNTRIES = ['us', 'gb', 'ca', 'au', 'nz', 'sg'];
const LANG = 'en';
const CONCURRENCY = 6; // for non-Puppeteer calls
const MAX_SEARCH_RESULTS = 150;
const SIMILAR_PER_APP = 50;
const USE_PUPPETEER_FALLBACK = true;
const DATE_CUTOFF = new Date('2024-07-01');

const SEEDS_PER_RUN = 100; // how many bigram seeds per run
const BROWSER_RECYCLE_INTERVAL = 1000; // restart Puppeteer every X apps

// Build bigram seeds
const letters = 'abcdefghijklmnopqrstuvwxyz';
const BIGRAMS = [];
for (const a of letters) {
  for (const b of letters) {
    BIGRAMS.push(a + b);
  }
}
const SEED_QUERIES = BIGRAMS;

// Run index from CLI arg (default 0)
const RUN_INDEX = parseInt(process.argv[2] || '0', 10);
const START = RUN_INDEX * SEEDS_PER_RUN;
const END = Math.min(START + SEEDS_PER_RUN, SEED_QUERIES.length);
const BATCH_SEEDS = SEED_QUERIES.slice(START, END);

console.log(`Running batch #${RUN_INDEX} — seeds ${START} to ${END - 1} (${BATCH_SEEDS.length} seeds)`);

// ===== CSV Writers (append mode) =====
const csvWriterAll = createObjectCsvWriter({
  path: 'low_install_apps.csv',
  header: [
    { id: 'appId', title: 'appId' },
    { id: 'title', title: 'title' },
    { id: 'developer', title: 'developer' },
    { id: 'genre', title: 'genre' },
    { id: 'score', title: 'score' },
    { id: 'installs', title: 'installs' },
    { id: 'free', title: 'free' },
    { id: 'offersIAP', title: 'offersIAP' },
    { id: 'updated', title: 'updated' },
    { id: 'version', title: 'version' },
    { id: 'size', title: 'size' },
    { id: 'url', title: 'url' },
  ],
  append: fs.existsSync('low_install_apps.csv'),
});

const csvWriterOld = createObjectCsvWriter({
  path: 'low_install_apps_before_cutoff.csv',
  header: [
    { id: 'appId', title: 'appId' },
    { id: 'title', title: 'title' },
    { id: 'developer', title: 'developer' },
    { id: 'genre', title: 'genre' },
    { id: 'score', title: 'score' },
    { id: 'installs', title: 'installs' },
    { id: 'free', title: 'free' },
    { id: 'offersIAP', title: 'offersIAP' },
    { id: 'updated', title: 'updated' },
    { id: 'version', title: 'version' },
    { id: 'size', title: 'size' },
    { id: 'url', title: 'url' },
  ],
  append: fs.existsSync('low_install_apps_before_cutoff.csv'),
});

// ===== Helpers =====
const normalizeInstalls = (s) => (s || '').replace(/\s/g, '');
const LOW_TIERS = new Set(['1+', '5+', '10+', '50+', '100+', '500+']);
const isUnder1k = (s) => LOW_TIERS.has(normalizeInstalls(s));

function updatedBeforeCutoff(updatedValue) {
  if (!updatedValue) return false;
  let dateObj;
  if (/^\d+$/.test(updatedValue.toString())) {
    dateObj = new Date(Number(updatedValue));
  } else {
    dateObj = new Date(updatedValue);
  }
  return !isNaN(dateObj) && dateObj < DATE_CUTOFF;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function discoverBySearch(term, country) {
  try {
    const results = await gplay.search({ term, num: MAX_SEARCH_RESULTS, country, lang: LANG });
    return results.map((r) => r.appId);
  } catch {
    return [];
  }
}

async function discoverSimilar(appId, country) {
  try {
    const sims = await gplay.similar({ appId, num: SIMILAR_PER_APP, country, lang: LANG });
    return sims.map((s) => s.appId);
  } catch {
    return [];
  }
}

async function fetchDetails(appId, country) {
  try {
    const d = await gplay.app({ appId, country, lang: LANG });
    return {
      appId,
      title: d.title ?? '',
      developer: d.developer ?? '',
      genre: d.genre ?? '',
      score: d.score ?? '',
      installs: d.installs ?? '',
      free: d.free ?? true,
      offersIAP: d.offersIAP ?? false,
      updated: d.updated ?? '',
      version: d.version ?? '',
      size: d.size ?? '',
      url: d.url ?? `https://play.google.com/store/apps/details?id=${appId}`,
    };
  } catch {
    return null;
  }
}

async function fetchInstallsWithPptr(appId, country, browser) {
  const url = `https://play.google.com/store/apps/details?id=${appId}&hl=${LANG}&gl=${country}`;
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const installs = await page.evaluate(() => {
      const nodes = document.querySelectorAll('div, span, dt, dd, div[aria-label], span[aria-label]');
      for (const el of nodes) {
        const t = (el.textContent || '').trim();
        if (/\d[\d,]*\+$/.test(t)) return t.replace(/\s/g, '');
      }
      return null;
    });
    return installs;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

async function expandDepth2(candidates, country) {
  const visited = new Set(candidates);
  let frontier = Array.from(candidates).slice(0, 200);

  for (let depth = 0; depth < 2; depth++) {
    const limit = pLimit(CONCURRENCY);
    const tasks = frontier.map((id) => limit(() => discoverSimilar(id, country)));
    const results = (await Promise.all(tasks)).flat();
    const newOnes = [];
    for (const id of results) {
      if (!visited.has(id)) {
        visited.add(id);
        candidates.add(id);
        newOnes.push(id);
      }
    }
    frontier = newOnes.slice(0, 200);
  }
}

// ===== Seen tracking =====
const seenFile = 'seen.json';
const seen = fs.existsSync(seenFile) ? new Set(JSON.parse(fs.readFileSync(seenFile))) : new Set();

async function saveSeen() {
  fs.writeFileSync(seenFile, JSON.stringify(Array.from(seen)));
}

// ===== Main =====
async function run() {
  let browser = null;
  if (USE_PUPPETEER_FALLBACK) {
    browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000 });
  }

  let processedPptr = 0;
  const lowInstallsAll = [];
  const lowInstallsOld = [];

  for (const country of COUNTRIES) {
    console.log(`\n=== Processing country: ${country} ===`);
    const candidates = new Set();

    // Discovery
    for (const term of BATCH_SEEDS) {
      const ids = await discoverBySearch(term, country);
      ids.forEach((id) => candidates.add(id));
      await sleep(100);
    }

    // Expansion
    await expandDepth2(candidates, country);
    console.log(`Total candidates for ${country}: ${candidates.size}`);

    // Details & filter
    const limit = pLimit(CONCURRENCY);
    const tasks = Array.from(candidates).map((appId) =>
      limit(async () => {
        if (seen.has(appId)) return;
        seen.add(appId);

        const d = await fetchDetails(appId, country);
        if (!d) return;

        if (!isUnder1k(d.installs) && USE_PUPPETEER_FALLBACK) {
          if (processedPptr % BROWSER_RECYCLE_INTERVAL === 0 && processedPptr !== 0) {
            await browser.close();
            browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000 });
          }
          const fallback = await fetchInstallsWithPptr(appId, country, browser);
          processedPptr++;
          if (isUnder1k(fallback)) d.installs = fallback;
        }

        if (isUnder1k(d.installs)) {
          lowInstallsAll.push(d);
          if (updatedBeforeCutoff(d.updated)) {
            lowInstallsOld.push(d);
          }
        }
      })
    );

    await Promise.all(tasks);
    await saveSeen();
  }

  if (browser) await browser.close();

  if (lowInstallsAll.length) await csvWriterAll.writeRecords(lowInstallsAll);
  if (lowInstallsOld.length) await csvWriterOld.writeRecords(lowInstallsOld);

  console.log(`\nBatch complete.`);
  console.log(`Low install apps (all dates) in this batch: ${lowInstallsAll.length}`);
  console.log(`Low install apps (before cutoff) in this batch: ${lowInstallsOld.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
