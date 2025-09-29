// appScrape.js — Apple App Store "low install" via low review-count proxy (USA only)
// Run: node appScrape.js
// Deps: npm i app-store-scraper p-limit csv-writer

import fs from 'fs';
import util from 'util';
import store from 'app-store-scraper';
import pLimit from 'p-limit';
import { createObjectCsvWriter } from 'csv-writer';

// ================= CONFIG =================
const COUNTRY = 'us';
const CONCURRENCY = 2;               // keep low; Apple throttles fast
const MAX_SEARCH_RESULTS = 200;      // per seed
const REVIEWS_THRESHOLD = 20;        // proxy for "low installs" — tune up/down
const BATCH_SIZE = 200;
const OUTPUT_ALL = 'apple_low_install_us.csv';

const SKIP_SINGLE_CHAR_SEEDS = true; // <-- IMPORTANT for Apple search reliability
const MIN_GAP_MS = 350;              // rate gate between detail requests
const SEARCH_GAP_MS = 120;           // small pause between seeds
const DETAIL_TIMEOUT_MS = 8000;      // hard timeout per details call

// Seeds: avoid 1-char terms unless you flip SKIP_SINGLE_CHAR_SEEDS=false
const BASE_SEEDS = [
  // 2–3 letter “broad but not too broad” starters
  'ai','ar','cam','calc','scan','pdf','vpn','auth','notes','todo','task',
  'timer','clock','habit','counter','widget','focus','sleep','memo',
  'qr','barcode','compass','unit','converter','budget','expense','flash',
  // you can add more short combos here: 'pro','lab','fit','med','doc','form','draw'
];

// If you really want A–Z and digits, keep them but we’ll skip 1-char by default
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');
const DIGITS = '0123456789'.split('');

const SEED_QUERIES = [
  ...BASE_SEEDS,
  ...ALPHA,   // many will be skipped if SKIP_SINGLE_CHAR_SEEDS=true
  ...DIGITS,  // same here
  'tool','utility','widget','note','timer','habit','counter',
  'scan','pdf','vpn','flash','compass','qr','barcode','reminder',
  'sleep','focus','pomodoro','calendar'
];

// ================ HELPERS =================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function inspectError(err) {
  // Always print something readable
  if (err?.message) return `${err.message}`;
  try { return util.inspect(err, { depth: 3 }); } catch { return String(err); }
}

async function withTimeout(promise, ms) {
  let t;
  const timer = new Promise((_, rej) => (t = setTimeout(() => rej(new Error(`Timeout ${ms}ms`)), ms)));
  try { return await Promise.race([promise, timer]); }
  finally { clearTimeout(t); }
}

async function withRetry(fn, { retries = 4, baseDelay = 600, label = '' } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      // If Apple says 403/429, cool down more
      const msg = inspectError(err);
      const heavy = /429|403/i.test(msg);
      const delay = (heavy ? baseDelay * 4 : baseDelay) * Math.pow(1.6, attempt - 1) + Math.random() * 250;
      if (attempt === 1 || heavy) {
        console.warn(`${label} retry ${attempt}/${retries} after ${Math.round(delay)}ms — ${msg}`);
      }
      await sleep(delay);
    }
  }
}

const sanitize = (s) =>
  (s ?? '').toString().replace(/\r?\n/g, ' ').replace(/,/g, ' ').trim();

const toISODate = (val) => {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const daysSince = (isoDate) => {
  if (!isoDate) return -1;
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return -1;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
};

// Optional resume: skip IDs already written to CSV
function loadSeenFromCsv(path) {
  const seen = new Set();
  if (!fs.existsSync(path)) return seen;
  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  // header: store,country,appId,title,developer,genre,score,reviews,updated,daysSinceUpdate,version,url
  const APPID_IDX = 2;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts[APPID_IDX]) seen.add(parts[APPID_IDX]);
  }
  return seen;
}

// ============== CSV WRITER ==============
const csvAll = createObjectCsvWriter({
  path: OUTPUT_ALL,
  header: [
    { id: 'store',           title: 'store' },     // "apple"
    { id: 'country',         title: 'country' },   // "us"
    { id: 'appId',           title: 'appId' },     // numeric id as string
    { id: 'title',           title: 'title' },
    { id: 'developer',       title: 'developer' },
    { id: 'genre',           title: 'genre' },
    { id: 'score',           title: 'score' },
    { id: 'reviews',         title: 'reviews' },
    { id: 'updated',         title: 'updated' },   // ISO YYYY-MM-DD
    { id: 'daysSinceUpdate', title: 'daysSinceUpdate' },
    { id: 'version',         title: 'version' },
    { id: 'url',             title: 'url' },
  ],
  append: fs.existsSync(OUTPUT_ALL),
});

// ================ CORE ===================
async function discoverBySearch(term) {
  try {
    const res = await withRetry(
      () => withTimeout(store.search({ term, country: COUNTRY, num: MAX_SEARCH_RESULTS }), 8000),
      { retries: 4, baseDelay: 600, label: `search("${term}")` }
    );
    return res.map(r => r.id).filter(Boolean);
  } catch (err) {
    console.error(`search failed for term="${term}": ${inspectError(err)}`);
    return [];
  }
}

let lastDetailAt = 0;
async function rateGate() {
  const now = Date.now();
  const wait = Math.max(0, lastDetailAt + MIN_GAP_MS - now);
  if (wait > 0) await sleep(wait);
  lastDetailAt = Date.now();
}

async function fetchDetails(appId) {
  try {
    await rateGate();
    const d = await withRetry(
      () => withTimeout(store.app({ id: appId, country: COUNTRY }), DETAIL_TIMEOUT_MS),
      { retries: 4, baseDelay: 800, label: `detail(${appId})` }
    );
    const updatedISO = toISODate(d.updated);
    return {
      store: 'apple',
      country: COUNTRY,
      appId: String(d.id),
      title: sanitize(d.title),
      developer: sanitize(d.developer),
      genre: sanitize(d.primaryGenre),
      score: d.score ?? '',
      reviews: typeof d.reviews === 'number' ? d.reviews : (parseInt(d.reviews, 10) || 0),
      updated: updatedISO,
      daysSinceUpdate: daysSince(updatedISO),
      version: sanitize(d.version),
      url: d.url ?? '',
    };
  } catch (err) {
    return { __failed: true, appId, error: inspectError(err) };
  }
}

const isLowInstallProxy = (details) => (details?.reviews ?? 0) <= REVIEWS_THRESHOLD;

// ================ MAIN ===================
async function run() {
  const LIMIT = pLimit(CONCURRENCY);
  const seenAll = loadSeenFromCsv(OUTPUT_ALL);

  // Build effective seed list (optionally skip 1-char)
  const seeds = SEED_QUERIES.filter(s => !SKIP_SINGLE_CHAR_SEEDS || s.length > 1);
  console.log(`Searching US with ${seeds.length} seeds… (skip 1-char: ${SKIP_SINGLE_CHAR_SEEDS})`);

  // 1) Discover candidates via search (sequential to be gentle)
  const discovered = new Set();
  for (const term of seeds) {
    const ids = await discoverBySearch(term);
    for (const id of ids) discovered.add(String(id));
    await sleep(SEARCH_GAP_MS + Math.random() * 120);
  }

  console.log(`Discovered candidates (US): ${discovered.size}`);

  // 2) Fetch details with concurrency; write low-review apps only
  const toWriteAll = [];
  let processed = 0, failed = 0, kept = 0;

  const tasks = Array.from(discovered).map(appId =>
    LIMIT(async () => {
      if (seenAll.has(appId)) return; // skip already captured

      const details = await fetchDetails(appId);
      processed++;

      if (details?.__failed) {
        failed++;
        if (failed <= 10) {
          console.warn(`detail fail (${failed}): ${details.appId} — ${details.error}`);
        }
        return;
      }

      if (isLowInstallProxy(details)) {
        kept++;
        toWriteAll.push(details);
        if (toWriteAll.length >= BATCH_SIZE) {
          await csvAll.writeRecords(toWriteAll.splice(0));
          console.log(`Wrote ${BATCH_SIZE} rows… [processed=${processed}, kept=${kept}, failed=${failed}]`);
        }
      }

      if (processed % 500 === 0) {
        console.log(`Progress: processed=${processed}, kept=${kept}, failed=${failed}`);
      }
    })
  );

  await Promise.all(tasks);
  if (toWriteAll.length) await csvAll.writeRecords(toWriteAll);

  console.log(`Done. Output: ${OUTPUT_ALL}`);
  console.log(`Summary: processed=${processed}, kept=${kept}, failed=${failed}, threshold<=${REVIEWS_THRESHOLD}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
