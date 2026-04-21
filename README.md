# SEOLint

[![npm version](https://img.shields.io/npm/v/seolint-scanner?label=seolint-scanner)](https://www.npmjs.com/package/seolint-scanner)
[![npm version](https://img.shields.io/npm/v/seolint-mcp?label=seolint-mcp)](https://www.npmjs.com/package/seolint-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **SEO that runs itself.** The open-source linter behind [**seolint.dev →**](https://seolint.dev)

SEOLint is an SEO linter shaped like ESLint. It scans a site, flags technical SEO issues, and — when paired with Claude via MCP — hands the fix back as a paste-ready prompt. Free. Open source. Runs on your own Claude API key.

- 🔎 **40+ checks** across SEO, accessibility, performance hints, GEO, AEO
- 🤖 **MCP-native** — drops into Claude Code, Cursor, Windsurf, VS Code, Codex, Gemini CLI
- 🧠 **AI fix prompts** tailored to your stack (Next.js, Astro, SvelteKit, plain HTML, no-code)
- 🛠️ **Zero-key default** — scan runs locally; AI features opt-in with your own Anthropic key
- 📦 **Three packages** in one monorepo — use the scanner alone, or the whole stack

---

## Try it in 30 seconds

```bash
# Scan any URL from your terminal
npx seolint-cli https://your-site.com

# Or plug it into Claude Code / Cursor / Windsurf as an MCP server
npx seolint-mcp
```

That's the open-source tool. When you want the agent to watch your site weekly, grade your fixes against Google Search Console, and ship PRs to your repo, that lives at **[seolint.dev →](https://seolint.dev)**.

---

## Packages in this repo

| Package | Purpose | `npm install` |
|---|---|---|
| [`seolint-scanner`](./packages/scanner) | The core scanner. Pure function: URL → structured issues. No network calls beyond fetching the page. | `npm i seolint-scanner` |
| [`seolint-mcp`](./packages/mcp) | MCP server. Scan from Claude Code, Cursor, Windsurf, VS Code, or any MCP-compatible client. | `npx seolint-mcp` |
| [`seolint-cli`](./packages/cli) | Terminal interface. One-shot scans, great for CI. | `npx seolint-cli https://...` |

Each package has its own README with install + usage docs.

---

## The hosted agent (paid) — what the OSS doesn't do

The closed-source app at [**seolint.dev →**](https://seolint.dev) layers everything that needs *operational data and shared infrastructure* on top of the scanner:

| Hosted (seolint.dev) | OSS (this repo) |
|---|---|
| Weekly auto-scan cron with quiet-by-default brief emails | ❌ |
| Google Search Console integration + daily sync | ❌ |
| Fix-outcome grading (14/28/90-day verdicts vs Search Console) | ❌ |
| GitHub PR bot — opens real PRs with mechanical fixes | ❌ |
| Cross-site pattern learning ("sites like yours typically…") | ❌ |
| Per-domain memory + fingerprinted issue lifecycle | ❌ |
| **Scanner + MCP + CLI** | ✅ |
| **AI fix prompts** (bring your own key) | ✅ |
| **Self-host forever** | ✅ |

7-day free trial, $99/month after. Runs on your own Claude API key — no AI markup, ever. [**Start the trial →**](https://seolint.dev/pricing)

---

## MCP integration

Example `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "seolint": {
      "command": "npx",
      "args": ["-y", "seolint-mcp"]
    }
  }
}
```

Tools exposed:
- `scan_website` — scan a URL and return the issue list
- `get_scan`, `open_issues`, `site_history`, `site_intelligence`, `next_action` — require a free API key from [seolint.dev/api](https://seolint.dev/api)
- `my_sites`, `site_status` — same

Cursor, Windsurf, Codex, Gemini CLI, VS Code — same `command + args` shape, just drop it into whichever config file your client uses.

Full MCP docs: **[seolint.dev/docs/mcp →](https://seolint.dev/docs/mcp)**

---

## Why open source

The scanner + MCP + CLI are the *tool*. Like ESLint. Keeping them open means:

- You can fork it and add custom rules for your niche.
- You can run the CLI in CI (GitHub Actions, GitLab, CircleCI) with zero network calls to us.
- You can inspect exactly what gets sent to Anthropic when AI features are enabled.
- You can self-host the whole stack if you want to — nothing in this repo needs seolint.dev to run.

What the hosted app does on top — Search Console grading, PR bot, weekly agent, cross-site patterns — is the *data layer* around the tool. That's what the $99/mo plan pays for.

If you've ever looked at ESLint + SonarCloud or Terraform + Terraform Cloud, it's that shape.

---

## Contributing

Bug reports and new check rules are the most valuable contributions. Each rule lives as a standalone file in [`packages/scanner/src/checks/`](./packages/scanner/src/checks/). See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the format + PR flow.

Feature requests for the hosted side (GSC, PR bot, grading) belong on [seolint.dev](https://seolint.dev) — email support@seolint.dev or file them as discussions here.

## License

MIT. See [`LICENSE`](./LICENSE).

---

<p align="center"><sub>Built by <a href="https://seolint.dev">seolint.dev</a> — SEO that runs itself.</sub></p>
