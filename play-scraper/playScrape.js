import fs from 'fs';
import gplay from 'google-play-scraper';
import { createObjectCsvWriter } from 'csv-writer';

// Use all categories available
const categories = Object.values(gplay.category);

// Just NEW apps, Free and Paid
const collections = [
  gplay.collection.NEW_FREE,
  gplay.collection.NEW_PAID,
];

// Set how many apps per category/collection
const NUM_APPS = 500;

// Prepare CSV writer
const csvWriter = createObjectCsvWriter({
  path: 'results.csv',
  header: [
    { id: 'title', title: 'Title' },
    { id: 'url', title: 'App URL' },
    { id: 'category', title: 'Category' },
    { id: 'collection', title: 'Collection' },
  ]
});

const scrape = async () => {
  const seen = new Set();
  const rows = [];

  for (const category of categories) {
    for (const collection of collections) {
      try {
        console.log(`Fetching ${NUM_APPS} apps from ${category} - ${collection}`);
        const apps = await gplay.list({ category, collection, num: NUM_APPS });

        for (const app of apps) {
          if (seen.has(app.appId)) continue;

          rows.push({
            title: app.title,
            url: `https://play.google.com/store/apps/details?id=${app.appId}`,
            category,
            collection,
          });

          seen.add(app.appId);
        }

        console.log(`Collected ${apps.length} apps from ${category} - ${collection}`);
      } catch (err) {
        console.error(`Failed ${category} - ${collection}: ${err.message}`);
      }
    }
  }

  await csvWriter.writeRecords(rows);
  console.log(`Done! Saved ${rows.length} app links to results.csv`);
};

scrape();
