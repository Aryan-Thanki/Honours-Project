import store from 'app-store-scraper';
import fs from 'fs';

// Step 1: Get all valid categories dynamically
const categories = Object.values(store.category);

// Step 2: Use stable and supported collections only
const collections = [
  store.collection.TOP_FREE,
  store.collection.TOP_PAID
];

// Step 3: Main scraper function
const scrapApps = async () => {
  const results = {}; // Structure: { category: { collection: [apps] } }

  for (const category of categories) {
    results[category] = {};

    for (const collection of collections) {
      try {
        const apps = await store.list({
          category,
          collection,
          num: 100,
        });

        results[category][collection] = [];

        for (const app of apps) {
          try {
            const appDetails = await store.app({ id: app.appId });

            results[category][collection].push({
              appId: appDetails.appId,
              title: appDetails.title,
              updated: appDetails.updated,
              version: appDetails.version,
              score: appDetails.score,
              reviews: appDetails.reviews,
              price: appDetails.price,
              free: appDetails.free,
              developer: appDetails.developer,
              genre: appDetails.genre,
              contentRating: appDetails.contentRating,
              size: appDetails.size,
              languages: appDetails.languages,
            });
          } catch (err) {
            console.error(`Failed to fetch ${app.appId}: ${err.message}`);
          }
        }

        console.log(`Fetched ${results[category][collection].length} apps for ${category} - ${collection}`);
      } catch (err) {
        console.error(`Failed ${category} - ${collection}: ${err.message}`);
      }
    }
  }

  fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
  console.log('Data saved to results.json');
};

scrapApps();
