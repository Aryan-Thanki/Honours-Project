// filterAppleCutoff.js — filter low-review CSV by update date cutoff
// Run: node filterAppleCutoff.js
// Optional args:
//   node filterAppleCutoff.js input.csv output.csv 2024-07-01

import fs from 'fs';

const INPUT  = process.argv[2] || 'apple_low_install_us.csv';
const OUTPUT = process.argv[3] || 'apple_low_install_us_before_2024-07.csv';
const CUTOFF = process.argv[4] || '2024-07-01';

function isBeforeCutoff(isoStr, cutoff) {
  if (!isoStr) return false;
  const d = new Date(isoStr);
  const c = new Date(cutoff);
  return !isNaN(d) && !isNaN(c) && d < c;
}

if (!fs.existsSync(INPUT)) {
  console.error(`Input file not found: ${INPUT}`);
  process.exit(1);
}

const raw = fs.readFileSync(INPUT, 'utf8').trim();
if (!raw) {
  console.error(`Input file is empty: ${INPUT}`);
  process.exit(1);
}

const lines = raw.split(/\r?\n/);
const header = lines[0];
const headers = header.split(',');

// Identify column indexes by name (robust to column order)
const colIdx = Object.fromEntries(headers.map((h, i) => [h, i]));
if (colIdx.updated == null) {
  console.error(`"updated" column not found in ${INPUT}`);
  process.exit(1);
}

const out = [header];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = line.split(',');
  const updated = cols[colIdx.updated] || '';
  if (isBeforeCutoff(updated, CUTOFF)) {
    out.push(line);
  }
}

fs.writeFileSync(OUTPUT, out.join('\n'));
console.log(`Wrote ${out.length - 1} rows to ${OUTPUT} (cutoff: ${CUTOFF})`);
