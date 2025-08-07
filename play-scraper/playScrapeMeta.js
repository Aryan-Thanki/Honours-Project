import fs from 'fs';
import csv from 'csv-parser';
import puppeteer from 'puppeteer';

// Load all app URLs from CSV
const readCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

// Filter helper for installs
const isLowInstall = (text) => {
  return ["10+", "50+", "100+", "500+"].includes(text);
};

// Parse update string and check if before June 2024
const isBeforeJune2024 = (dateStr) => {
  try {
    const parsedDate = new Date(dateStr);
    return parsedDate < new Date("2024-06-01");
  } catch {
    return false;
  }
};

// Main scraping function
const scrapeMetadata = async () => {
  const apps = await readCSV('results.csv');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const results = [];

  for (let i = 0; i < apps.length; i++) {
    const app = apps[i];
    console.log(`Processing ${i + 1}/${apps.length}: ${app.title}`);

    try {
      await page.goto(app["App URL"], { waitUntil: 'domcontentloaded' });

      const metadata = await page.evaluate(() => {
        const getText = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.innerText.trim() : null;
        };

        const installCount = getText('div.hAyfc span.htlgb:nth-child(1)'); // Old format fallback
        const lastUpdated = Array.from(document.querySelectorAll('div.hAyfc')).find(div => div.innerText.includes("Updated on"))?.querySelector('.htlgb')?.innerText;

        return {
          installs: installCount || null,
          updated: lastUpdated || null,
          name: getText('h1 span') || document.title,
        };
      });

      if (
        metadata.installs &&
        isLowInstall(metadata.installs) &&
        metadata.updated &&
        isBeforeJune2024(metadata.updated)
      ) {
        results.push({
          title: metadata.name,
          url: app["App URL"],
          installs: metadata.installs,
          updated: metadata.updated,
          appId: app["App URL"].split("id=")[1], 
        });
        console.log(`Saved: ${metadata.name}`);
      } else {
        console.log(`Skipped (too popular or too new)`);
      }

    } catch (err) {
      console.error(`Failed to scrape ${app["App URL"]}: ${err.message}`);
    }
  }

  await browser.close();

  // Save to metaResults.json
  fs.writeFileSync('metaResults.json', JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} apps to metaResults.json`);
};

scrapeMetadata();
