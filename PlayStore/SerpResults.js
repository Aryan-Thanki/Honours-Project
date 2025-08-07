require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const csvWriter = createCsvWriter({
  path: 'results.csv',
  header: [
    { id: 'title', title: 'Title' },
    { id: 'link', title: 'App URL' }
  ]
});

const API_KEY = process.env.SERPAPI_KEY;

const query = 'site:play.google.com "100+ installs" "last updated July 5, 2024"';

const fetchSerpResults = async () => {
  try {
    const { data } = await axios.get('https://serpapi.com/search.json', {
      params: {
        q: query,
        engine: 'google',
        api_key: API_KEY,
        num: 100  // max per request
      }
    });

    const results = data.organic_results.map(result => ({
      title: result.title,
      link: result.link
    }));

    await csvWriter.writeRecords(results);
    console.log(`Saved ${results.length} app links to results.csv`);
  } catch (error) {
    console.error('Error fetching SerpApi data:', error.message);
  }
};

fetchSerpResults();
