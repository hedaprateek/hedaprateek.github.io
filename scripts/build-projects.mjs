#!/usr/bin/env node
// Fetches hedaprateek's public, non-fork GitHub repos and writes ../projects.json.
// Run by .github/workflows/update-projects.yml on a schedule, or manually:
//   node scripts/build-projects.mjs

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const USERNAME = 'hedaprateek';
const HOMEPAGE_REPO = `${USERNAME}.github.io`;
const OUT_FILE = fileURLToPath(new URL('../projects.json', import.meta.url));
const OVERRIDES_FILE = fileURLToPath(new URL('../overrides.json', import.meta.url));

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'toolshed-build-script',
};
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function fetchAllRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}&sort=pushed`,
      { headers }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  // Forks aren't this person's original work; empty repos have nothing to show yet;
  // the homepage repo itself shouldn't list itself as a project.
  return repos.filter((r) => !r.fork && r.size > 0 && r.name !== HOMEPAGE_REPO);
}

async function detectLive(repoName) {
  const url = `https://${USERNAME}.github.io/${repoName}/`;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

async function loadOverrides() {
  try {
    return JSON.parse(await readFile(OVERRIDES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function buildProject(repo, overrides) {
  const o = overrides[repo.name] || {};
  if (o.hidden) return null;

  let status = o.status;
  let live = null;

  if (status === 'live' || status === undefined) {
    live = o.live !== undefined ? o.live : await detectLive(repo.name);
    if (status === undefined) status = live ? 'live' : 'source';
  }

  return {
    name: o.title || repo.name,
    description: o.description || repo.description || 'No description yet — see the repo.',
    stack: o.stack || repo.language || '',
    repo: repo.html_url,
    live: status === 'live' ? live : null,
    status,
    pushedAt: repo.pushed_at,
  };
}

async function main() {
  const [repos, overrides] = await Promise.all([fetchAllRepos(), loadOverrides()]);
  const built = await Promise.all(repos.map((r) => buildProject(r, overrides)));
  const projects = built.filter(Boolean).sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt));

  const data = { generatedAt: new Date().toISOString(), projects };
  await writeFile(OUT_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`Wrote ${projects.length} projects to projects.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
