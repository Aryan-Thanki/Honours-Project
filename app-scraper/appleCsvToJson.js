// appleCsvToJson.js
import fs from 'fs';
import csv from 'csv-parser';

function csvToJson(inputCsvPath, outputJsonPath) {
  if (!fs.existsSync(inputCsvPath)) {
    console.error(`CSV not found: ${inputCsvPath}`);
    process.exit(1);
  }

  const results = [];
  fs.createReadStream(inputCsvPath)
    .pipe(csv())
    .on('data', (row) => results.push(row))
    .on('end', () => {
      fs.writeFileSync(outputJsonPath, JSON.stringify(results, null, 2));
      console.log(`Converted ${results.length} records to ${outputJsonPath}`);
    });
}

const [, , inFile = 'apple_apps.csv', outFile = 'apple_apps.json'] = process.argv;
csvToJson(inFile, outFile);
