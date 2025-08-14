// csvToJson.js
// Convert low_install_apps.csv → low_install_apps.json with a simple, memory-safe stream pipeline.

import fs from 'fs';            // Node's file system module to read/write files
import path from 'path';        // For resolving paths and extensions
import { fileURLToPath } from 'url'; // To get current file path in ESM
import csv from 'csv-parser';   // Streaming CSV parser (npm i csv-parser)

// ----- Resolve __dirname for ES modules -----
const __filename = fileURLToPath(import.meta.url); // Absolute path to this script file
const __dirname = path.dirname(__filename);        // Directory containing this script

// ----- CLI args & defaults -----
// Accept optional CLI args: input CSV and output JSON
const [, , INPUT_ARG, OUTPUT_ARG] = process.argv;

// Default input/output if not provided
const INPUT_CSV = INPUT_ARG ?? path.resolve(__dirname, 'low_install_apps.csv');
const OUTPUT_JSON = OUTPUT_ARG ?? path.resolve(__dirname, 'low_install_apps.json');

// ----- Utility: ensure file exists -----
function assertReadable(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Input file not found: ${filePath}`);
    process.exit(1);
  }
}

// ----- Optional: light type coercion for some fields -----
// You can tweak this to fit your CSV schema. The CSV from the earlier scraper
// has columns: appId,title,developer,genre,score,installs,free,offersIAP,updated,version,size,url
function coerceRowTypes(row) {
  const out = { ...row };

  // Convert numeric-like score to Number if possible (else keep original)
  if (out.score !== undefined && out.score !== '') {
    const n = Number(out.score);
    if (!Number.isNaN(n)) out.score = n;
  }

  // Convert booleans for free/offersIAP if present (CSV stores strings)
  if (typeof out.free === 'string') {
    out.free = out.free.toLowerCase() === 'true';
  }
  if (typeof out.offersIAP === 'string') {
    out.offersIAP = out.offersIAP.toLowerCase() === 'true';
  }

  // Convert updated timestamp (ms) to human date if it's a number-like string
  if (out.updated && /^\d+$/.test(out.updated)) {
    const ms = Number(out.updated);
    if (!Number.isNaN(ms)) {
      out.updated = new Date(ms).toISOString().split('T')[0]; 
      // e.g., "2025-07-25" — use toLocaleDateString() for local format
    }
  }


  // Keep installs as the original tier string like "500+"
  // If you want a numeric lower-bound, you could add:
  // out.installsMin = parseInstallsLowerBound(out.installs);

  return out;
}

// Example helper if you want a numeric lower-bound (optional, not used by default)
function parseInstallsLowerBound(installs) {
  if (!installs) return null;
  const m = installs.replace(/\s/g, '').match(/^(\d[\d,]*)\+$/);
  if (!m) return null;
  return Number(m[1].replace(/,/g, '')) || null;
}

// ----- Main conversion function -----
function csvToJson(inputCsvPath, outputJsonPath) {
  assertReadable(inputCsvPath);                  // Make sure CSV exists

  const results = [];                            // Collect parsed objects here

  // Create readable stream for CSV
  const readStream = fs.createReadStream(inputCsvPath);

  // Create writable stream for JSON
  const writeStream = fs.createWriteStream(outputJsonPath, { flags: 'w' });

  console.log(`Reading:  ${inputCsvPath}`);
  console.log(`Writing:  ${outputJsonPath}`);

  // Start JSON array
  writeStream.write('[\n');

  let first = true; // Track if we’ve written the first item (for commas)

  // Pipe CSV → parser
  readStream
    .pipe(csv()) // csv-parser turns each row into a plain object
    .on('data', (row) => {
      // Optional: coerce some fields (numbers/bools)
      const cleaned = coerceRowTypes(row);

      // If you want to store at the end as a single giant JSON array in memory,
      // you could push to results. But streaming is safer for large files.
      // results.push(cleaned);

      // Stream each object to the JSON file as we go (memory friendly)
      const json = JSON.stringify(cleaned, null, 2);
      if (!first) writeStream.write(',\n'); // Comma before every item after the first
      writeStream.write(json);
      first = false;
    })
    .on('error', (err) => {
      console.error(`Error while reading CSV: ${err.message}`);
      try { writeStream.end(']\n'); } catch {}
      process.exit(1);
    })
    .on('end', () => {
      // Close the JSON array
      writeStream.end('\n]\n', () => {
        console.log('Done. JSON written successfully.');
      });
    });

  // Handle write errors
  writeStream.on('error', (err) => {
    console.error(`Error while writing JSON: ${err.message}`);
    process.exit(1);
  });
}

// ----- Run it -----
csvToJson(INPUT_CSV, OUTPUT_JSON);
