# The Toolshed

A single page listing every public project on [github.com/hedaprateek](https://github.com/hedaprateek),
published at **https://hedaprateek.github.io/**.

There is no build step for the page itself — `index.html` reads `projects.json` at
load time and renders the cards.

## How the list stays current

A GitHub Action (`.github/workflows/update-projects.yml`) runs `scripts/build-projects.mjs`
once a day, and any time you click **Run workflow** on the Actions tab. It:

1. Calls the GitHub API for every public, non-fork repo under `hedaprateek` with content in it.
2. Checks whether each one has a live page at `https://hedaprateek.github.io/<repo>/`.
3. Writes the result to `projects.json`, sorted by most recently pushed — so a brand
   new repo you push today shows up at the top after the next run, with no editing here.
4. Commits `projects.json` back to this repo if anything changed.

## Giving a project better copy

By default a repo shows its raw GitHub description (or "No description yet" if it
has none) and its primary language as the stack label. To override that, add an
entry to `overrides.json` keyed by the exact repo name:

```json
"my-repo-name": {
  "title": "Display Name",          // optional, defaults to the repo name
  "description": "One clear line about what it does.",
  "stack": "HTML · JS",             // short, whatever's honest
  "status": "live" | "local" | "source",  // optional, overrides auto-detection
  "live": "https://...",            // optional, overrides the auto-detected URL
  "hidden": true                    // optional, drop this repo from the page entirely
}
```

Use `"status": "local"` only for something that's genuinely never going to have a
live page by design (e.g. it's meant to run on someone's own machine). Don't set
`"status": "source"` as a way to skip the live-page check for a repo that's
currently backend/full-stack — that disables live-detection for it *permanently*,
so it'll stay marked "Source" even if you add a GitHub Pages demo for it later.
Just leave `status` out and let auto-detection decide every run.

Commit the change and push — the workflow also runs on any push that touches
`overrides.json`, so the site picks it up within a minute or two.

## Downloads

Any repo with a published GitHub Release that has files attached shows up
automatically in the Downloads section, with a button per asset. Nothing to
configure — publish a Release with binaries on any repo and it appears on the
next run. The section stays hidden entirely while no repo has any releases.

## Getting the site to pick up changes right now

The workflow runs once a day, or on push to `overrides.json` — but pushing to
one of your *other* project repos doesn't trigger it, since Actions in this repo
can't see activity in a different repo. Two ways to force an immediate refresh:

- On GitHub: Actions tab → "Update project list" → **Run workflow**.
- On the live site: the **Refresh** link in the footer. First click asks for a
  GitHub token — create one at the "New token" link next to it, scoped to
  **this repository only**, with **Actions: Read and write** permission. The
  token is stored in your browser's `localStorage` only; it's never written to
  a file or sent anywhere but `api.github.com`. The button re-runs the workflow
  and reloads the page's data once it finishes (usually 20–40s).

## Running it locally

```
node scripts/build-projects.mjs
```

Needs Node 18+ (uses the built-in `fetch`). Set `GITHUB_TOKEN` in your environment
first if you're hitting API rate limits.
