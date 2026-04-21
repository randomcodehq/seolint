# Contributing to SEOLint

Thanks for helping! The most valuable contributions are **bug reports** and **new check rules**. Features for the hosted side (Search Console, PR bot, grading) belong on [seolint.dev](https://seolint.dev) — email support@seolint.dev.

## Setup

```bash
git clone https://github.com/randomcodehq/seolint.git
cd seolint
npm install
npm run build
npm test
```

This is an npm workspace monorepo. `npm install` at the root symlinks the three packages (`seolint-scanner`, `seolint-mcp`, `seolint-cli`) against each other so changes in one flow into the others immediately.

## Adding a new check rule

Every rule is a standalone file that exports a function taking a `CheerioAPI` + URL and pushing `RawIssue` objects into an array.

Example — minimal `scanner/src/checks/seo/example.ts`:

```ts
import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"

export function checkExample($: CheerioAPI, url: string, issues: RawIssue[]) {
  const bad = $("meta[name='example'][content='']").length > 0
  if (!bad) return

  issues.push({
    id: "example-empty",
    category: "seo",
    severity: "warning",
    title: "Example meta tag is empty",
    description: "The page declares a <meta name=\"example\"> with no content, which is worse than omitting it entirely.",
    fix: "Either remove the tag or give it real content.",
  })
}
```

Then wire it into `scanner/src/checks/seo/index.ts`:

```ts
import { checkExample } from "./example"

export function checkSeo($: CheerioAPI, url: string): RawIssue[] {
  const issues: RawIssue[] = []
  // ... existing checks ...
  checkExample($, url, issues)
  return issues
}
```

And add a test — `scanner/src/checks/seo/example.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { checkExample } from "./example"
import type { RawIssue } from "../../index"

describe("checkExample", () => {
  it("flags empty example meta", () => {
    const $ = cheerio.load('<html><head><meta name="example" content=""></head></html>')
    const issues: RawIssue[] = []
    checkExample($, "https://example.com", issues)
    expect(issues).toHaveLength(1)
    expect(issues[0].id).toBe("example-empty")
  })
})
```

Run the tests:

```bash
cd packages/scanner
npm test
```

## Severity levels

- `critical` — costs meaningful traffic or breaks functionality. E.g. missing title tag, broken canonical, 5xx on robots.txt.
- `warning` — clearly wrong but not load-bearing. E.g. weak meta description, missing OG tags, excessive H1s.
- `info` — a nudge, not a blocker. E.g. "no llms.txt, consider adding one".

Use `critical` sparingly. The scanner runs in CI; critical findings fail builds. If you're unsure, use `warning`.

## Commit + PR

Small, single-purpose PRs please. Branch name `check/<rule-name>` or `fix/<short-desc>`. PRs with a failing test case that demonstrates the bug land faster than "just trust me" reports.

## What belongs here vs. what doesn't

| In this repo | In seolint.dev (hosted) |
|---|---|
| New scan rules | Google Search Console integration |
| Scanner bug fixes | Fix-outcome grading logic |
| MCP / CLI UX improvements | PR bot behaviour |
| Framework detection (Next.js / Astro / etc.) | Weekly agent cron |
| AI handler interface changes | Email agent |

If a feature requires a database, a scheduled cron, or the user's Google/GitHub/Anthropic account stored server-side, it belongs in the hosted app. Everything else is fair game here.

## License

MIT. By contributing, you agree your code is MIT-licensed.
