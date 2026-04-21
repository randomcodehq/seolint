# seolint-mcp

[![npm version](https://img.shields.io/npm/v/seolint-mcp)](https://www.npmjs.com/package/seolint-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/randomcodehq/seolint/blob/main/LICENSE)

> MCP server for SEOLint. Scan any site for SEO issues from Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, Codex, Gemini CLI, or any MCP-compatible client.

Part of the [SEOLint](https://seolint.dev) stack. This package is the bridge between your AI client and the hosted scanner + memory + Search Console + grading at [seolint.dev](https://seolint.dev).

## Install

```bash
npx seolint-mcp
```

Or add to your MCP client config. For Claude Desktop (`claude_desktop_config.json`):

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

Cursor, Windsurf, Codex, Gemini CLI, and VS Code all use the same `command + args` shape — drop it into whichever MCP config file your client reads.

## Two modes

**Free mode (no API key):** `scan_website` runs via the hosted scanner with a generous anonymous quota. No account needed. Great for trying it out.

**Connected mode (with `SEOLINT_API_KEY`):** unlocks memory, Search Console data, per-fix grading, cross-site patterns, and the next-action oracle. Free API key at [**seolint.dev/api →**](https://seolint.dev/api). Free tier includes 100 scans/day.

```bash
SEOLINT_API_KEY=sl_... npx seolint-mcp
```

Or one-shot connect (opens a browser, approves in your logged-in seolint.dev session):

```bash
npx seolint-mcp connect
```

## Tools

| Tool | Free | Connected |
|---|---|---|
| `scan_website` | ✅ | ✅ scan + persisted to memory |
| `get_scan`, `open_issues` | ❌ | ✅ |
| `my_sites`, `site_status`, `site_history` | ❌ | ✅ |
| `site_intelligence` | ❌ | ✅ — site-wide patterns, cross-page insights |
| `next_action` | ❌ | ✅ — AI oracle: what to fix next |
| `suggest_pages` | ❌ | ✅ |

Full tool reference: **[seolint.dev/docs/mcp →](https://seolint.dev/docs/mcp)**

## Environment variables

- `SEOLINT_API_KEY` — your API key from [seolint.dev/api](https://seolint.dev/api). Optional for free tier.
- `SEOLINT_API_URL` — override the API base (default: `https://seolint.dev`). Only needed for self-hosted deployments.

## The hosted agent (why you'd upgrade)

Everything the MCP exposes runs on top of the hosted SEOLint service at [**seolint.dev →**](https://seolint.dev). The paid tier adds the **agent** — weekly auto-scans, Google Search Console grading, GitHub PR bot, email agent. 7-day free trial, $99/month, runs on your own Claude API key.

Try it in Claude Code / Cursor first via this MCP, then [**start the trial →**](https://seolint.dev/pricing) if you want it running itself.

## License

MIT. [GitHub repo →](https://github.com/randomcodehq/seolint)
