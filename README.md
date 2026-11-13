# Honours Project
This repository contains a collection of **Node.js Scrapers** for collecting and analysing metadata from three distinct sources. 
- **Google Play Store** 
- **Apple App Store**
- **Github Repositories**

The goal of this repository was to identify **mobile applications** or **open-source projects** that may be considered abandoned for the research of software sustainability and green software engineering. 

"Abandoned" is operationalised as:
- **Low adoption**: Google Play apps with fewer than 1,000 installs, or App Store apps with 20 or fewer reviews.
- **Stale**: last updated before **1 July 2024**.

## Prerequisites
- [Node.js](https://nodejs.org/) 18 or newer and npm.
- Each folder is an independent npm project. Run `npm install` inside a folder, then run its scripts **from inside that folder** (paths are relative to the working directory).

```
play-scraper/         Google Play pipeline
app-scraper/          Apple App Store pipeline
github-scraper/       GitHub repository metadata fetcher
```

## Google Play Store
Folder: `play-scraper/`

### Library
Uses [google-play-scraper](https://github.com/facundoolano/google-play-scraper) (original repository: https://github.com/facundoolano/google-play-scraper).

```bash
cd play-scraper
npm install google-play-scraper
npm install p-limit csv-writer csv-parser puppeteer   # other dependencies used by the scripts
```
`p-limit` is imported by `playScrape.js` but is not listed in `package.json`, so install it explicitly. `puppeteer` downloads a Chromium build on install.

### How it works
1. **Discover**: `playScrape.js` searches Google Play with seed terms (a-z, 0-9 and keywords such as `tool`, `vpn`, `qr`), then expands the first 200 candidates through the library's `similar()` call.
2. **Fetch details**: each appId's metadata is fetched with limited concurrency and retries.
3. **Filter by installs**: only apps in the low install tiers `1+, 5+, 10+, 50+, 100+, 500+` (under 1,000 installs) are kept. If the library returns no or a too-high install figure, a headless Puppeteer page load is used as a fallback to read the install text.
4. **Write CSV**: results are written in batches of 50 (appended if the file exists).
5. **Filter by date**: `filterByDate.js` keeps apps whose `updated` date is before 2024-07-01.
6. **Convert**: `csvToJson.js` streams the filtered CSV to JSON and converts types.

### Run
```bash
cd play-scraper
node playScrape.js      # or: npm start
node filterByDate.js
node csvToJson.js
```

### Inputs and outputs
| Step | Input | Output |
|---|---|---|
| `playScrape.js` | None. Tunable constants (country `us`, language `en`, concurrency, search limits, Puppeteer fallback) are at the top of the script. | `low_install_apps.csv` |
| `filterByDate.js` | `low_install_apps.csv` (paths and cutoff are hard-coded) | `low_install_apps_before_july2024.csv` |
| `csvToJson.js` | `low_install_apps_before_july2024.csv` (override with `node csvToJson.js <in> <out>`) | `low_install_apps_before_july2024.json` |

Columns: `appId, title, developer, genre, score, installs, free, offersIAP, updated, version, size, url`.
In the raw CSV `updated` is an epoch-millisecond timestamp and `installs` is a tier string such as `100+`. The JSON has `score` as a number, `free` and `offersIAP` as booleans, and `updated` as `YYYY-MM-DD`.

## App Store
Folder: `app-scraper/`

### Library
Uses [app-store-scraper](https://github.com/facundoolano/app-store-scraper) (original repository: https://github.com/facundoolano/app-store-scraper).

```bash
cd app-scraper
npm install app-store-scraper
npm install p-limit csv-writer csv-parser
```
(Running plain `npm install` installs everything listed in `package.json`.)

### How it works
1. **Discover**: `appScrape.js` searches the US App Store using seed terms (a-z, 0-9 and keywords).
2. **Fetch details**: each app's details are fetched with a rate gate, per-call timeouts and retry with exponential backoff (longer cool-down on HTTP 403/429).
3. **Filter**: Apple does not expose install counts, so **review count is used as a proxy**: apps with `reviews <= 20` are kept.
4. **Write CSV**: results are written in batches of 200. The scraper is **resumable**: appIds already in the CSV are skipped on the next run.
5. **Filter by date**: `filterByDate.js` keeps rows whose `updated` date is before the cutoff (default 2024-07-01).
6. **Convert**: `appleCsvToJson.js` converts a CSV to JSON (all values stay as strings).

### Run
```bash
cd app-scraper
node appScrape.js
node filterByDate.js                                  # or: node filterByDate.js <in.csv> <out.csv> <YYYY-MM-DD>
node appleCsvToJson.js apple_low_install_us_before_2024-07.csv apple_low_install_us_before_2024-07.json
```
`npm start` is currently broken (it points to a missing `iosScrape.js`); use `node appScrape.js`.

### Inputs and outputs
| Step | Input | Output |
|---|---|---|
| `appScrape.js` | None. Constants at the top of the script (country `us`, concurrency, review threshold, batch size). | `apple_low_install_us.csv` |
| `filterByDate.js` | `apple_low_install_us.csv` (default) | `apple_low_install_us_before_2024-07.csv` |
| `appleCsvToJson.js` | Any CSV passed as an argument. The defaults (`apple_apps.csv` to `apple_apps.json`) do not match the filtered file, so pass paths explicitly. | A JSON array |

Columns: `store, country, appId, title, developer, genre, score, reviews, updated, daysSinceUpdate, version, url`. `updated` is `YYYY-MM-DD`; commas and newlines are stripped from text fields.

Note: `apple_apps.json` in this folder is old output from an earlier scraper version and has a different schema.

## GitHub
Folder: `github-scraper/`

### Setup
```bash
cd github-scraper
npm install
cp .env.example .env     # then set GITHUB_TOKEN in .env
```
Create a token at https://github.com/settings/tokens. The `.env` file is gitignored; never commit it.

`analyse.js` uses ES module `import` syntax, so add `"type": "module"` to this folder's `package.json` if Node reports a module error.

### How it works
`analyse.js` reads repository URLs from `urls.txt`, extracts the owner and repo name, and calls the GitHub REST API once per repository (sequentially) using the token for authentication. The selected fields are written to JSON.

### Run
```bash
cd github-scraper
node analyse.js
```

### Inputs and outputs
| | |
|---|---|
| Input | `urls.txt`: one GitHub repository URL per line, plus `GITHUB_TOKEN` in `.env` |
| Output | `github_data.json`: an array of objects with `name, description, stars, forks, open_issues, watchers, size_kb, language, license, last_push, created_at, updated_at, topics, archived` |

## Notes
- The scrapers are deliberately slow (sleeps, low concurrency, backoff) to be polite to the stores. A full run can take a long time.
- The scrapers use unofficial APIs and page scraping, so they may break if the stores change their responses.
