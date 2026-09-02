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

Use `"status": "local"` for anything that's meant to run on someone's own machine
rather than be hosted (no live demo will ever exist for it). Use `"status": "source"`
to skip the live-page check for a repo you know is backend/full-stack and won't have
a GitHub Pages demo.

Commit the change and push — the workflow also runs on any push that touches
`overrides.json`, so the site picks it up within a minute or two.

## Running it locally

```
node scripts/build-projects.mjs
```

Needs Node 18+ (uses the built-in `fetch`). Set `GITHUB_TOKEN` in your environment
first if you're hitting API rate limits.
