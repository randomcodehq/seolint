# seolint-cli

[![npm version](https://img.shields.io/npm/v/seolint-cli)](https://www.npmjs.com/package/seolint-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/randomcodehq/seolint/blob/main/LICENSE)

> Scan any website for SEO issues from your terminal. Part of the [SEOLint](https://seolint.dev) stack.

## Install

```bash
# Zero-install scan
npx seolint-cli scan https://your-site.com

# Or install globally
npm install -g seolint-cli
seolint-cli scan https://your-site.com
```

> **Note:** the unscoped `seolint` name on npm is held by a long-dormant Zillow package, so we publish as `seolint-cli`. If that ever gets retired we'll consolidate.

## Use in CI

Drop into GitHub Actions to catch SEO regressions on every PR preview deploy:

```yaml
- uses: actions/setup-node@v4
- run: npx seolint-cli scan https://preview-${{ github.sha }}.your-app.com --fail-on=critical
```

Returns structured JSON. Exit code is non-zero when `--fail-on=<severity>` matches at least one issue.

## Environment variables

- `SEOLINT_API_KEY` — optional. Connects scans to your hosted seolint.dev account for memory + Search Console data. Grab one at [seolint.dev/api](https://seolint.dev/api).
- `SEOLINT_API_URL` — optional. Override the API base for self-hosted deployments.

## When to use the hosted agent instead

The CLI is perfect for CI, one-off audits, and scripts. But it's stateless — each run is independent. If you want the agent to watch your site week after week, grade every fix against Google Search Console, and ship PRs with the fixes, that lives at **[seolint.dev →](https://seolint.dev)**. 7-day free trial, $99/month, runs on your own Claude API key.

## License

MIT. [GitHub repo →](https://github.com/randomcodehq/seolint)
