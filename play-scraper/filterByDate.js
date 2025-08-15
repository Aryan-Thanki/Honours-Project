import fs from 'fs';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';

const INPUT_FILE = 'low_install_apps.csv';
const OUTPUT_FILE = 'low_install_apps_before_july2024.csv';
const CUTOFF_DATE = new Date('2024-07-01').getTime(); // in ms

const apps = [];

fs.createReadStream(INPUT_FILE)
  .pipe(csv())
  .on('data', (row) => {
    if (!row.updated) return;

    let updatedTime;
    // If already a timestamp string
    if (/^\d+$/.test(row.updated)) {
      updatedTime = parseInt(row.updated, 10);
    } else {
      // Otherwise parse as date string
      updatedTime = new Date(row.updated).getTime();
    }

    if (!isNaN(updatedTime) && updatedTime < CUTOFF_DATE) {
      apps.push(row);
    }
  })
  .on('end', async () => {
    console.log(`Found ${apps.length} apps updated before July 1, 2024`);

    if (apps.length > 0) {
      const csvWriter = createObjectCsvWriter({
        path: OUTPUT_FILE,
        header: Object.keys(apps[0]).map((key) => ({ id: key, title: key }))
      });

      await csvWriter.writeRecords(apps);
      console.log(`Saved filtered results to ${OUTPUT_FILE}`);
    }
  });
