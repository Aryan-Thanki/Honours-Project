# Honours Project
This repository contains a collection of **Node.js Scrapers** for collecting and analysing metadata from three distinct sources. 
- **Google Play Store** 
- **Apple App Store**
- **Github Repositories**

The goal of this repository was to identify **mobile applications** or **open-source projects** that may be considered abandoned for the research of software sustainability and green software engineering. 

"Abandoned" is operationalised as:
- **Low adoption**: Google Play apps with fewer than 1,000 installs, or App Store apps with 20 or fewer reviews (Apple does not publish install counts, so reviews are a proxy).
- **Stale**: not updated since **1 July 2024** (last update or, for GitHub, last push before that date).

## Research summary
**Sustainability as a Software Engineering Problem**, by Aryan Thanki. Submitted October 2025 for the Bachelor of Engineering with Honours (BE(Hons)) at the University of Waikato (ENGEN582-25X Honours Research and Development Project).

The research treats software abandonment as a sustainability problem: apps and repositories that are never updated, reused or retired become a form of digital waste. It uses a **mixed-methods** approach:
1. **Large-scale scraping** of the Google Play Store, Apple App Store and GitHub (the code in this repository) to measure how much low-adoption, outdated software exists.
2. **An anonymous, ethics-approved survey** of software developers and engineers, mainly in New Zealand (17 responses over five weeks), on awareness and adoption of green software engineering.
3. **An Insights Matrix** combining the scraping data, the survey and the literature review across six themes: awareness and knowledge, organisational adoption, measurement and tooling, policy and governance, value and motivation, and future interest and education.

### Deliverables
| Document | Description |
|---|---|
| [Dissertation](Dissertation.pdf) | Full honours report: background, methodology, implementation, results, discussion, conclusion. The literature review and ethics approval letter are appendices. |
| [Research Article](Research%20Article.pdf) | Short paper on the scraping study of software abandonment across the three platforms. |
| [Literature Review](Literature%20Review.pdf) | Review of sustainability in computing, green software engineering frameworks (e.g. GREENSOFT, Karlskrona Manifesto), the software development life cycle, large-scale project failures and barriers to industry adoption. |
| [EDS Poster](EDS%20Poster.pdf) | One-page poster summarising the problem, approach, results and Insights Matrix. |

### Key findings
| Source | Initial sample | Met abandonment criteria |
|---|---|---|
| Google Play Store | 816 apps with < 1,000 installs | 76 (about 9%) not updated since July 2024 |
| Apple App Store | 192 apps with < 20 reviews | 98 (about 51%) not updated since July 2024 |
| GitHub | 25 hand-selected repositories | 25 (100%) with last push before July 2024 |

- The GitHub repositories were not found by a script. They were chosen with GitHub search (last push before July 2024), then manually checked to be real software projects and not archived.
- Survey: 76% of respondents were unfamiliar with green and sustainable software, 94% said their organisation has no person or team responsible for sustainability, and 76% had no tools to measure it. 76% said they would like to learn more.
- The biggest barriers were lack of awareness and training, and difficulty measuring impact.
- Conclusion: the main barriers are organisational and educational rather than technical. Measurable indicators, training and governance are needed to move sustainability from theory to practice.

### Insights Matrix (summary)
| Aspect | Synthesised insight |
|---|---|
| Awareness and knowledge | Persistent awareness gap; existing frameworks are not used in industry. |
| Organisational adoption | No clear ownership; abandoned software reflects ecosystem neglect. |
| Measurement and tooling | No sustainability metrics in platform data or in practice; only basic indicators such as installs, reviews and stars. |
| Policy and governance | Platform policies (Google API levels, Apple SDK requirements) favour compliance and security over sustainability; GitHub has no governance of inactive repositories. |
| Value and motivation | Short-term speed and delivery are valued over longevity. |
| Future interest and education | Strong interest in training, so education is a promising route to change. |

### How the code maps to the report
| Folder | Report section |
|---|---|
| `play-scraper/` | Google Play Store scraping (methodology 3.2.1, implementation 4.2.1, results 5.1) |
| `app-scraper/` | Apple App Store scraping (3.2.2, 4.2.2, 5.2) |
| `github-scraper/` | GitHub repository metadata collection (3.2.3, 4.2.3, 5.3) |

The scrapers use [google-play-scraper](https://github.com/facundoolano/google-play-scraper) and [app-store-scraper](https://github.com/facundoolano/app-store-scraper) (chosen over Puppeteer-only scraping and SerpAPI for scale, cost and rate limits) and the GitHub REST API. Puppeteer is used only as a fallback to read Play install counts.

> **Data note:** the CSV and JSON files committed here may not exactly match the figures in the report. For example, `play-scraper/low_install_apps_before_july2024.json` has 72 records against 76 in the report, and the filtered App Store CSV has 97 rows against 98 in the dissertation (the research article's table says 96). These come from separate scraper runs.

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

## Acknowledgements
Completed as part of the Bachelor of Engineering (Honours) programme at the University of Waikato. Thanks to [Facundo Olano](https://github.com/facundoolano) for the open-source google-play-scraper and app-store-scraper libraries.
