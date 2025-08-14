// Import required packages
import fs from 'fs';                          // For file system operations (check CSV existence)
import gplay from 'google-play-scraper';      // For scraping Google Play metadata via API-like calls
import pLimit from 'p-limit';                 // To control concurrency (avoid too many parallel requests)
import { createObjectCsvWriter } from 'csv-writer'; // To write CSV output
import puppeteer from 'puppeteer';            // For headless browser scraping when gplay data is missing

// ----------- CONFIGURATION SECTION -----------

// Country code for Play Store region (affects availability & metadata)
const COUNTRY = 'us';

// Language code for Play Store page text
const LANG = 'en';

// How many scraping tasks to run at the same time
const CONCURRENCY = 6;

// Max results to fetch for each search query seed
const MAX_SEARCH_RESULTS = 150;

// Max "similar apps" to fetch for each seed app
const SIMILAR_PER_APP = 40;

// Whether to use Puppeteer fallback if installs are missing/too high
const USE_PUPPETEER_FALLBACK = true;

// Search seed terms to discover apps (letters, numbers, keywords)
// These force Play Store search to return diverse app sets
const SEED_QUERIES = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
  'tool','utility','widget','note','timer','habit','counter',
  'scan','pdf','vpn','flash','compass','qr','barcode','reminder',
  'sleep','focus','pomodoro','calendar'
];

// Prepare CSV writer to save results
const csvWriter = createObjectCsvWriter({
  path: 'low_install_apps.csv',  // File to save results
  header: [
    { id: 'appId',     title: 'appId' },
    { id: 'title',     title: 'title' },
    { id: 'developer', title: 'developer' },
    { id: 'genre',     title: 'genre' },
    { id: 'score',     title: 'score' },
    { id: 'installs',  title: 'installs' },
    { id: 'free',      title: 'free' },
    { id: 'offersIAP', title: 'offersIAP' },
    { id: 'updated',   title: 'updated' },
    { id: 'version',   title: 'version' },
    { id: 'size',      title: 'size' },
    { id: 'url',       title: 'url' },
  ],
  append: fs.existsSync('low_install_apps.csv'), // Append mode if file already exists
});

// Set of install tier strings that mean < 1,000 installs
const LOW_TIERS = new Set(['1+','5+','10+','50+','100+','500+']);

// ----------- HELPER FUNCTIONS -----------

// Remove spaces from install strings like " 500+ " → "500+"
const normalizeInstalls = (s) => (s || '').replace(/\s/g, '');

// Check if an installs string is in the <1,000 tier set
const isUnder1k = (s) => LOW_TIERS.has(normalizeInstalls(s));

// Sleep function to pause execution (avoid hitting Google too fast)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Use google-play-scraper to search the Play Store with a query term
async function discoverBySearch(term) {
  try {
    const results = await gplay.search({ term, num: MAX_SEARCH_RESULTS, country: COUNTRY, lang: LANG });
    return results.map(r => r.appId); // Return only app IDs
  } catch {
    return [];
  }
}

// Use google-play-scraper to get "similar apps" for a given appId
async function discoverSimilar(appId) {
  try {
    const sims = await gplay.similar({ appId, num: SIMILAR_PER_APP, country: COUNTRY, lang: LANG });
    return sims.map(s => s.appId); // Return only app IDs
  } catch {
    return [];
  }
}

// Get full app details for an appId via google-play-scraper
async function fetchDetails(appId) {
  try {
    const d = await gplay.app({ appId, country: COUNTRY, lang: LANG });
    return {
      appId,
      title: d.title ?? '',
      developer: d.developer ?? '',
      genre: d.genre ?? '',
      score: d.score ?? '',
      installs: d.installs ?? '',      // e.g. "500+"
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

// Use Puppeteer to open app page and extract installs text (fallback)
async function fetchInstallsWithPptr(appId, browser) {
  const url = `https://play.google.com/store/apps/details?id=${appId}&hl=${LANG}&gl=${COUNTRY}`;
  const page = await browser.newPage();
  try {
    // Set user agent to appear as a regular Chrome browser
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36'
    );
    // Go to the app page and wait until DOM is loaded
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Evaluate page in browser context to find install count
    const installs = await page.evaluate(() => {
      const nodes = document.querySelectorAll('div, span, dt, dd, div[aria-label], span[aria-label]');
      for (const el of nodes) {
        const t = (el.textContent || '').trim();
        if (/\d[\d,]*\+$/.test(t)) return t.replace(/\s/g, ''); // Match "500+" style strings
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

// ----------- MAIN RUN FUNCTION -----------

async function run() {
  const seen = new Set();        // Track processed app IDs to avoid duplicates
  const candidates = new Set();  // Set of all discovered app IDs

  // 1) DISCOVER via search seeds
  for (const term of SEED_QUERIES) {
    const ids = await discoverBySearch(term);
    ids.forEach(id => candidates.add(id));
    await sleep(250); // Short pause to avoid hammering Google
  }

  // 2) EXPAND via similar() from some seeds
  const seedSlice = Array.from(candidates).slice(0, 60); // Only take first 60 seeds for expansion
  const simLimit = pLimit(CONCURRENCY);                  // Control parallel similar() calls
  const simTasks = seedSlice.map(id => simLimit(() => discoverSimilar(id)));
  const simResults = (await Promise.all(simTasks)).flat();
  simResults.forEach(id => candidates.add(id));

  console.log(`Total candidate appIds: ${candidates.size}`);

  // Prepare concurrency limiter for detail scraping
  const limit = pLimit(CONCURRENCY);

  // Launch Puppeteer browser if fallback is enabled
  let browser = null;
  if (USE_PUPPETEER_FALLBACK) {
    browser = await puppeteer.launch({ headless: true });
  }

  const toWrite = []; // Buffer to store results before writing to CSV

  // 3) FETCH DETAILS + FILTER (<1,000 installs) for each candidate
  const tasks = Array.from(candidates).map(appId => limit(async () => {
    if (seen.has(appId)) return; // Skip if already processed
    seen.add(appId);

    // Get details via google-play-scraper
    const d = await fetchDetails(appId);
    if (!d) return;

    // If installs are missing or >=1k, try Puppeteer fallback
    if (!isUnder1k(d.installs) && USE_PUPPETEER_FALLBACK) {
      const fallback = await fetchInstallsWithPptr(appId, browser);
      if (isUnder1k(fallback)) d.installs = fallback;
    }

    // Keep only apps with <1,000 installs
    if (isUnder1k(d.installs)) {
      toWrite.push(d);

      // Write in batches of 50 to avoid memory build-up
      if (toWrite.length >= 50) {
        await csvWriter.writeRecords(toWrite.splice(0, toWrite.length));
        console.log(`Wrote 50… total so far may be higher.`);
      }
    }
  }));

  // Wait for all tasks to finish
  await Promise.all(tasks);

  // Write any remaining results
  if (toWrite.length) await csvWriter.writeRecords(toWrite);

  // Close Puppeteer if it was launched
  if (browser) await browser.close();

  console.log('Done.');
}

// Start the run process
run().catch(e => {
  console.error(e);
  process.exit(1);
});
