# CLAUDE.md

## Project overview

Honours project in software sustainability / green software engineering. It is a collection of Node.js scrapers that collect metadata from three sources: the Google Play Store, the Apple App Store and GitHub. The goal is to find mobile apps and open-source projects that may be **abandoned**.

"Abandoned" is operationalised as:
- **low adoption**: Play installs under 1,000, or Apple reviews <= 20 (Apple exposes no install counts, so reviews are a proxy), and
- **stale**: last updated before **2024-07-01**.

## Layout

Four independent npm projects. There is no root `package.json`, no tests and no `.gitignore`. Run every command from inside the relevant sub-folder, because paths are relative to the working directory.

```
README.md               intro + empty section headings
app-scraper/            Apple App Store pipeline (ESM)
play-scraper/           Google Play pipeline (ESM)
github-scraper/         GitHub repo metadata fetcher
```

### app-scraper/
- `appScrape.js` - searches the US store from seed terms (a-z, 0-9, keywords), fetches details, keeps apps with `reviews <= REVIEWS_THRESHOLD` (20). Uses `app-store-scraper`, `p-limit`, `csv-writer`. Has retry/backoff, a rate gate, per-call timeouts and resume (`loadSeenFromCsv` skips appIds already in the CSV). Writes `apple_low_install_us.csv` in batches.
- `filterByDate.js` - `node filterByDate.js [in] [out] [cutoff]`; keeps rows whose `updated` is before the cutoff. Defaults: `apple_low_install_us.csv` -> `apple_low_install_us_before_2024-07.csv`, cutoff `2024-07-01`.
- `appleCsvToJson.js` - `node appleCsvToJson.js [in] [out]`; defaults are `apple_apps.csv`/`apple_apps.json`, so pass the filtered CSV explicitly. Values stay as strings.
- CSV columns: `store,country,appId,title,developer,genre,score,reviews,updated,daysSinceUpdate,version,url`.

### play-scraper/
- `playScrape.js` - discovers appIds via search seeds plus `similar()` expansion, fetches details, keeps installs in `LOW_TIERS` (1+ to 500+). Falls back to Puppeteer to read the install count when the library doesn't return it. Uses `google-play-scraper`, `p-limit`, `csv-writer`, `puppeteer`. Writes `low_install_apps.csv`.
- `filterByDate.js` - cutoff and paths hard-coded (`updated < 2024-07-01`); writes `low_install_apps_before_july2024.csv`.
- `csvToJson.js` - streams CSV to JSON and coerces types (`score` number, `free`/`offersIAP` boolean, epoch-ms `updated` -> `YYYY-MM-DD`).
- CSV columns: `appId,title,developer,genre,score,installs,free,offersIAP,updated,version,size,url`.

### github-scraper/
- `analyse.js` - reads `urls.txt` (one GitHub URL per line), calls the GitHub REST API sequentially with `GITHUB_TOKEN` from `.env`, writes `github_data.json` (name, description, stars, forks, open_issues, watchers, size_kb, language, license, last_push, created_at, updated_at, topics, archived).

## Data flow

- Play: `playScrape.js` -> `low_install_apps.csv` -> `filterByDate.js` -> `low_install_apps_before_july2024.csv` -> `csvToJson.js` -> `.json`
- Apple: `appScrape.js` -> `apple_low_install_us.csv` -> `filterByDate.js` -> `apple_low_install_us_before_2024-07.csv` -> `appleCsvToJson.js` -> `.json`
- GitHub: `urls.txt` -> `analyse.js` -> `github_data.json`

All outputs are written next to the scripts.

## Commands

| Task | Command (from the sub-folder) |
|---|---|
| Apple scrape | `node appScrape.js` |
| Apple filter / to JSON | `node filterByDate.js` / `node appleCsvToJson.js <in> <out>` |
| Play scrape | `npm start` or `node playScrape.js` |
| Play filter / to JSON | `node filterByDate.js` / `node csvToJson.js` |
| GitHub analyse | `node analyse.js` |

## Conventions

- ESM (`import`) in the scrapers; CommonJS only in the deprecated folder.
- A `// ====== CONFIG ======` block of `UPPER_SNAKE_CASE` constants at the top of each scraper; camelCase functions.
- Scrapers are polite: sleeps, low concurrency, retry with backoff. `fetchDetails` returns null or `{__failed:true}` on error.
- Text written to CSV is sanitised (commas/newlines stripped), which is why the Apple filter can split rows on `,`.
- Output files are named `<store>_low_install_<region>[_before_<date>].csv`.

## Known issues / gotchas

- `app-scraper/package.json` `main`/`start` point to a non-existent `iosScrape.js`; use `node appScrape.js`.
- `play-scraper` imports `p-limit` but does not declare it; run `npm i p-limit` if it fails.
- `github-scraper/analyse.js` uses ESM `import` but its `package.json` lacks `"type": "module"`.
- `app-scraper/apple_apps.json` is stale output from an earlier scraper version (different schema, not low-review filtered).
- `app-scraper` declares `puppeteer` but doesn't use it.
- `github-scraper/.env` holds the GitHub token (see `.env.example`); it is gitignored. Never print or commit it.
- `README.md` sections (Google Play Store, App Store, GitHub) are still empty.
