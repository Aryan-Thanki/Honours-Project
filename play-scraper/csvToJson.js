// csvToJson_filtered.js
// Convert low_install_apps_before_july2024.csv → low_install_apps_before_july2024.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- CLI args & defaults -----
const [, , INPUT_ARG, OUTPUT_ARG] = process.argv;

const INPUT_CSV = INPUT_ARG ?? path.resolve(__dirname, 'low_install_apps_before_july2024.csv');
const OUTPUT_JSON = OUTPUT_ARG ?? path.resolve(__dirname, 'low_install_apps_before_july2024.json');

// ----- Ensure file exists -----
function assertReadable(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Input file not found: ${filePath}`);
    process.exit(1);
  }
}

// ----- Type coercion -----
function coerceRowTypes(row) {
  const out = { ...row };

  if (out.score !== undefined && out.score !== '') {
    const n = Number(out.score);
    if (!Number.isNaN(n)) out.score = n;
  }

  if (typeof out.free === 'string') {
    out.free = out.free.toLowerCase() === 'true';
  }
  if (typeof out.offersIAP === 'string') {
    out.offersIAP = out.offersIAP.toLowerCase() === 'true';
  }

  if (out.updated && /^\d+$/.test(out.updated)) {
    const ms = Number(out.updated);
    if (!Number.isNaN(ms)) {
      out.updated = new Date(ms).toISOString().split('T')[0];
    }
  }

  return out;
}

// ----- Conversion -----
function csvToJson(inputCsvPath, outputJsonPath) {
  assertReadable(inputCsvPath);

  const readStream = fs.createReadStream(inputCsvPath);
  const writeStream = fs.createWriteStream(outputJsonPath, { flags: 'w' });

  console.log(`Reading:  ${inputCsvPath}`);
  console.log(`Writing:  ${outputJsonPath}`);

  writeStream.write('[\n');

  let first = true;

  readStream
    .pipe(csv())
    .on('data', (row) => {
      const cleaned = coerceRowTypes(row);
      const json = JSON.stringify(cleaned, null, 2);
      if (!first) writeStream.write(',\n');
      writeStream.write(json);
      first = false;
    })
    .on('error', (err) => {
      console.error(`Error while reading CSV: ${err.message}`);
      try { writeStream.end(']\n'); } catch {}
      process.exit(1);
    })
    .on('end', () => {
      writeStream.end('\n]\n', () => {
        console.log('Done. JSON written successfully.');
      });
    });

  writeStream.on('error', (err) => {
    console.error(`Error while writing JSON: ${err.message}`);
    process.exit(1);
  });
}


csvToJson(INPUT_CSV, OUTPUT_JSON);
