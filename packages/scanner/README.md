# seolint-scanner

[![npm version](https://img.shields.io/npm/v/seolint-scanner)](https://www.npmjs.com/package/seolint-scanner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/randomcodehq/seolint/blob/main/LICENSE)

> Pure-function SEO scanner. URL in, structured issues out. No server, no API key, no database.

The scanner that powers the rest of the SEOLint ecosystem — the hosted agent at [**seolint.dev →**](https://seolint.dev), the [MCP server](https://www.npmjs.com/package/seolint-mcp), the [CLI](https://www.npmjs.com/package/seolint-cli). Usable directly in your own scripts too.

40+ checks across SEO, accessibility, performance hints, GEO, and AEO. Same engine the hosted service uses.

## Install

```bash
npm install seolint-scanner
```

## Quick start

```ts
import { runScanner } from "seolint-scanner"

const result = await runScanner("https://your-site.com")

console.log(result.issues)
// [
//   {
//     id: "missing-meta-description",
//     severity: "warning",
//     title: "Page is missing a meta description",
//     description: "...",
//     fix: "Add a <meta name=\"description\"> tag...",
//     ...
//   },
//   ...
// ]
```

Returns a `ScanResult` with `issues`, `performanceScore`, `lcp`, `cls`, and the detected `framework`. Types are exported from the package.

## Optional AI fix prompts

Pass an `AiHandler` to get agent-ready fix prompts (the kind you paste into Claude Code / Cursor / Windsurf) alongside each issue. Bring your own key — the scanner never touches it.

```ts
import Anthropic from "@anthropic-ai/sdk"
import { runScanner, type AiHandler } from "seolint-scanner"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ai: AiHandler = {
  async call({ system, messages, model, maxTokens }) {
    const res = await client.messages.create({
      model: model ?? "claude-haiku-4-5-20251001",
      max_tokens: maxTokens ?? 3500,
      system,
      messages,
    })
    const block = res.content[0]
    return block && block.type === "text" ? block.text : ""
  },
}

const result = await runScanner("https://your-site.com", { ai })
// Now every critical/warning issue has an agent-optimal `fix` + page-specific `why`.
```

The `AiHandler` interface is provider-agnostic — use OpenAI, a local model, or a mock in tests. The scanner only knows how to assemble prompts and parse responses.

## Options

```ts
runScanner(url, {
  prefetchedHtml?: string          // skip the internal fetch
  skipSiteWideChecks?: boolean     // skip robots.txt / sitemap / llms.txt / feed
  gsc?: GscContext | null | Promise<GscContext | null>  // anchor AI "why" to real traffic
  ai?: AiHandler | null            // opt into AI fix prompts
})
```

## What it checks

Rules live as standalone files in `src/checks/`. Adding a new rule means dropping a file in the right subfolder, wiring it into `src/checks/<category>/index.ts`, and adding a test.

- **`src/checks/seo/`** — meta tags, titles, headings, canonicals, structured data (JSON-LD), Open Graph, social tags, i18n (hreflang), link quality, image attributes.
- **`src/checks/accessibility/`** — alt text, ARIA hints, contrast tells.
- **`src/checks/performance/`** — DOM size, resource counts, render-blocking hints. Core Web Vitals pulled via Google PageSpeed Insights API when `GOOGLE_PAGESPEED_API_KEY` is set.
- **`src/checks/geo/`** — robots.txt, sitemap health, llms.txt, skills.md, feed presence.
- **`src/checks/aeo/`** — answer-engine optimisation: thin content, E-E-A-T signals, question headings, FAQ suggestions.

See [`CONTRIBUTING.md`](https://github.com/randomcodehq/seolint/blob/main/CONTRIBUTING.md) for the rule-file format and PR flow.

## When to use the hosted agent instead

The scanner is great for CI, one-off audits, and fully local dev loops. But it doesn't:

- Remember anything between runs
- Grade your fixes against Google Search Console
- Open PRs with the fixes
- Learn patterns across sites

If you want those, the hosted agent at [**seolint.dev →**](https://seolint.dev) is the same scanner with a memory + grading + PR layer on top. 7-day free trial, $99/month, runs on your own Claude key.

## License

MIT. [GitHub repo →](https://github.com/randomcodehq/seolint)
