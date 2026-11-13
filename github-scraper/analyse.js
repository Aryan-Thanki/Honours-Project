import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const headers = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  'User-Agent': 'GitHub-Repo-Analyzer'
};

// Extract owner and repo from a GitHub URL
function extractOwnerRepo(url) {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

// Get repo details from GitHub API
async function fetchRepoData(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  try {
    const { data } = await axios.get(url, { headers });
    return {
      name: data.full_name,
      description: data.description,
      stars: data.stargazers_count,
      forks: data.forks_count,
      open_issues: data.open_issues_count,
      watchers: data.watchers_count,
      size_kb: data.size,
      language: data.language,
      license: data.license?.name || 'None',
      last_push: data.pushed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
      topics: data.topics,
      archived: data.archived,
    };
  } catch (error) {
    console.error(`Failed to fetch ${owner}/${repo}:`, error.message);
    return null;
  }
}

async function main() {
  const urls = fs.readFileSync('urls.txt', 'utf-8').split('\n').filter(Boolean);
  const results = [];

  for (const url of urls) {
    const parsed = extractOwnerRepo(url);
    if (!parsed) {
      console.warn(`Invalid URL skipped: ${url}`);
      continue;
    }

    const data = await fetchRepoData(parsed.owner, parsed.repo);
    if (data) results.push(data);
  }

  // Save JSON
  fs.writeFileSync('github_data.json', JSON.stringify(results, null, 2));
  console.log(`Done! ${results.length} repos saved to github_data.json`);
}

main();
