#!/usr/bin/env node
// Fetches hedaprateek's public, non-fork GitHub repos and writes ../projects.json.
// Run by .github/workflows/update-projects.yml on a schedule, or manually:
//   node scripts/build-projects.mjs

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const USERNAME = 'hedaprateek';
const HOMEPAGE_REPO = `${USERNAME}.github.io`;
const OUT_FILE = fileURLToPath(new URL('../projects.json', import.meta.url));
const OVERRIDES_FILE = fileURLToPath(new URL('../overrides.json', import.meta.url));

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'toolshed-build-script',
};
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function fetchWithRetry(url, options = {}){
  for(let attempt=0;attempt<3;attempt++){
    try {
      const response = await fetch(url,{...options,signal:AbortSignal.timeout(15000)});
      if(![429,500,502,503,504].includes(response.status) || attempt === 2)return response;
    } catch(error){if(attempt === 2)throw error;}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
}

async function fetchAllRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const res = await fetchWithRetry(
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
  return repos.filter((r) => !r.private && !r.fork && r.size > 0 && r.name !== HOMEPAGE_REPO);
}

export async function detectLive(repo, override = {}, request = fetchWithRetry) {
  const candidates = [override.live, repo.homepage, `https://${USERNAME}.github.io/${repo.name}/`];
  for(const candidate of [...new Set(candidates.filter(Boolean))]){
    let url;
    try {url = new URL(candidate);} catch {continue;}
    if(!['http:', 'https:'].includes(url.protocol) || ['github.com','api.github.com'].includes(url.hostname)) continue;
    try {
      const res = await request(url.href, {method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(15000)});
      if(res.ok) return url.href;
    } catch { /* try the next published address */ }
  }
  return null;
}

async function loadOverrides() {
  try {
    return JSON.parse(await readFile(OVERRIDES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function formatBytes(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

// Any repo with a published, non-draft release that has downloadable assets
// attached becomes a Downloads entry — no manual step needed to list an app.
export function assetPlatform(name){
  if(/\.apk$/i.test(name))return 'Android APK';
  if(/\.(exe|msi|msix)$/i.test(name) || /win(?:dows)?[-_. ]?(x64|arm64)|win-x64/i.test(name))return 'Windows';
  if(/\.ipa$/i.test(name))return 'iPhone / iPad';
  if(/\.(dmg|pkg)$/i.test(name))return 'macOS';
  if(/\.(AppImage|deb|rpm)$/i.test(name))return 'Linux';
  return 'Archive / installer';
}
export async function fetchLatestRelease(repoName, request = fetchWithRetry) {
  const res = await request(
    `https://api.github.com/repos/${USERNAME}/${repoName}/releases?per_page=20`,
    { headers, signal:AbortSignal.timeout(15000) }
  );
  if(res.status === 404)return null;
  if(!res.ok)throw new Error(`Could not check releases for ${repoName}: GitHub ${res.status}`);
  const releases = await res.json();
  const release = releases.find(item => !item.draft && !item.prerelease && item.assets?.some(a => a.state === 'uploaded' || !a.state));
  if(!release)return null;

  return {
    version: release.tag_name,
    notes: release.name || release.tag_name,
    publishedAt: release.published_at,
    releaseUrl: release.html_url,
    assets: release.assets.filter(a => a.state === 'uploaded' || !a.state).map((a) => ({
      name: a.name,
      platform: assetPlatform(a.name),
      size: formatBytes(a.size),
      url: a.browser_download_url,
      downloads: a.download_count,
    })),
  };
}

export async function buildProject(repo, overrides, request = fetchWithRetry) {
  const o = overrides[repo.name] || {};
  if (o.hidden) return null;

  // Even an old "local" override must not hide a website that has since gone live.
  const [live, release] = await Promise.all([detectLive(repo,o,request),fetchLatestRelease(repo.name,request)]);
  const status = live ? 'live' : o.status === 'local' ? 'local' : 'source';
  const category = live ? 'live' : release || o.category === 'download' ? 'download' : 'unpublished';

  const project = {
    name: o.title || repo.name,
    description: o.description || repo.description || 'No description yet — see the repo.',
    stack: o.stack || repo.language || '',
    repo: repo.html_url,
    live: status === 'live' ? live : null,
    status,
    category,
    pushedAt: repo.pushed_at,
  };

  const download = (release || o.category === 'download') && {
    name: o.title || repo.name,
    description: o.description || repo.description || '',
    stack: o.stack || repo.language || '',
    repo: repo.html_url,
    ...(release || {version:'Build pending',notes:'No downloadable build has been published yet.',assets:[],publishedAt:null}),
  };

  return { project, download };
}

export async function main() {
  const [repos, overrides] = await Promise.all([fetchAllRepos(), loadOverrides()]);
  const built = await Promise.all(repos.map((r) => buildProject(r, overrides)));

  const projects = built
    .filter(Boolean)
    .map((b) => b.project)
    .sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt));

  const downloads = built
    .filter((b) => b && b.download)
    .map((b) => b.download)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const data = { generatedAt: new Date().toISOString(), projects, downloads };
  await writeFile(OUT_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`Wrote ${projects.length} projects and ${downloads.length} downloads to projects.json`);
}

if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  main().catch((err) => {console.error(err);process.exitCode=1;});
}
