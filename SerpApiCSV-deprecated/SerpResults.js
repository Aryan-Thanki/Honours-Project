// Load API key from .env file
require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Get SerpApi key from environment variable
const API_KEY = process.env.SERPAPI_KEY;

// Max number of pages to paginate (100 × 100 = up to 10,000, but realistically you'll get ~1,000 max)
const MAX_PAGES = 10; // Try 10 for now to see if it works
const DELAY_MS = 2000; // 2-second delay to respect rate limits

// Setup CSV writer
const csvWriter = createCsvWriter({
  path: 'results.csv',
  header: [
    { id: 'title', title: 'Title' },
    { id: 'link', title: 'App URL' }
  ]
});

// Track unique app links
const collectedLinks = new Set();
const results = [];

// Delay utility
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch a single results page from SerpApi
async function fetchPage(startIndex) {
  const query = 'site:play.google.com/store/apps/details "500+ installs" "last updated June 2024" -games';

  try {
    const { data } = await axios.get('https://serpapi.com/search.json', {
      params: {
        q: query,
        engine: 'google',
        api_key: API_KEY,
        num: 100,
        start: startIndex
      }
    });

    const pageResults = data.organic_results || [];

    for (const item of pageResults) {
      if (!collectedLinks.has(item.link)) {
        collectedLinks.add(item.link);
        results.push({
          title: item.title,
          link: item.link
        });
      }
    }

    console.log(`✅ Page ${startIndex / 100 + 1}: ${pageResults.length} results`);
  } catch (error) {
    console.error(`❌ Error on page ${startIndex / 100 + 1}:`, error.response?.data?.error || error.message);
  }
}

// Main routine
(async () => {
  for (let i = 0; i < MAX_PAGES; i++) {
    const start = i * 100;
    await fetchPage(start);
    await delay(DELAY_MS);
  }

  // Save to CSV
  await csvWriter.writeRecords(results);
  console.log(`🎉 Done! Total unique apps saved: ${results.length}`);
})();
