// appleBatch.js
import fs from 'fs';
import store from 'app-store-scraper';
import pLimit from 'p-limit';
import { createObjectCsvWriter } from 'csv-writer';

// ====== CONFIG ======
const COUNTRIES = ['us', 'gb', 'ca', 'au', 'nz', 'sg']; // First-world
const CONCURRENCY = 5;
const MAX_RESULTS = 200; // per search/collection
const DATE_CUTOFF = new Date('2024-07-01');

// Categories & collections to pull from
const categories = [
  store.category.BUSINESS,
  store.category.EDUCATION,
  store.category.FINANCE,
  store.category.HEALTH_AND_FITNESS,
  store.category.MEDICAL,
  store.category.PRODUCTIVITY,
  store.category.UTILITIES
];

const collections = [
  store.collection.TOP_FREE_IOS,
  store.collection.TOP_PAID_IOS,
  store.collection.NEW_FREE_IOS,
  store.collection.NEW_PAID_IOS
];

// ====== CSV Writers ======
const csvWriterAll = createObjectCsvWriter({
  path: 'apple_apps.csv',
  header: [
    { id: 'appId', title: 'appId' },
    { id: 'title', title: 'title' },
    { id: 'developer', title: 'developer' },
    { id: 'genre', title: 'genre' },
    { id: 'score', title: 'score' },
    { id: 'reviews', title: 'reviews' },
    { id: 'updated', title: 'updated' },
    { id: 'version', title: 'version' },
    { id: 'url', title: 'url' },
  ],
});

const csvWriterOld = createObjectCsvWriter({
  path: 'apple_apps_before_cutoff.csv',
  header: [
    { id: 'appId', title: 'appId' },
    { id: 'title', title: 'title' },
    { id: 'developer', title: 'developer' },
    { id: 'genre', title: 'genre' },
    { id: 'score', title: 'score' },
    { id: 'reviews', title: 'reviews' },
    { id: 'updated', title: 'updated' },
    { id: 'version', title: 'version' },
    { id: 'url', title: 'url' },
  ],
});

// ====== HELPERS ======
function updatedBeforeCutoff(updatedValue) {
  if (!updatedValue) return false;
  let dateObj = new Date(updatedValue);
  return !isNaN(dateObj) && dateObj < DATE_CUTOFF;
}

async function fetchDetails(appId, country) {
  try {
    const d = await store.app({ id: appId, country });
    return {
      appId: d.id,
      title: d.title ?? '',
      developer: d.developer ?? '',
      genre: d.primaryGenre ?? '',
      score: d.score ?? '',
      reviews: d.reviews ?? 0,
      updated: d.updated ?? '',
      version: d.version ?? '',
      url: d.url ?? '',
    };
  } catch {
    return null;
  }
}

// ====== MAIN ======
async function run() {
  const seen = new Set();
  const allApps = [];
  const oldApps = [];

  for (const country of COUNTRIES) {
    console.log(`\n=== Processing country: ${country} ===`);
    for (const category of categories) {
      for (const collection of collections) {
        try {
          const apps = await store.list({
            category,
            collection,
            country,
            num: MAX_RESULTS
          });

          for (const app of apps) {
            if (seen.has(app.id)) continue;
            seen.add(app.id);

            const details = await fetchDetails(app.id, country);
            if (!details) continue;

            allApps.push(details);
            if (updatedBeforeCutoff(details.updated)) {
              oldApps.push(details);
            }
          }
        } catch (err) {
          console.error(`Failed ${category} - ${collection}: ${err.message}`);
        }
      }
    }
  }

  console.log(`\nWriting CSVs...`);
  await csvWriterAll.writeRecords(allApps);
  await csvWriterOld.writeRecords(oldApps);

  console.log(`\n=== Done ===`);
  console.log(`Total Apple apps: ${allApps.length}`);
  console.log(`Apple apps before cutoff: ${oldApps.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
