#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

// Default to the apex domain — `www.seolint.dev` issues a 308 redirect to the
// apex, and Node's undici-based fetch sometimes drops the POST body across
// 308 hops, causing connect/start to silently fail.
const API_BASE = process.env.SEOLINT_API_URL ?? "https://seolint.dev"
const VERSION = "0.1.9"

// Read the API key live from process.env each call so doctor/connect can mutate
// it after resolving from a host config file.
function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", "User-Agent": `seolint-mcp/${VERSION}` }
  const apiKey = process.env.SEOLINT_API_KEY ?? ""
  if (apiKey) h["Authorization"] = `Bearer ${apiKey}`
  return h
}

async function pollScan(scanId: string, maxWaitMs = 60_000): Promise<Record<string, unknown>> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${API_BASE}/api/v1/scan/${scanId}`, { headers: headers() })
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
    const data = await res.json()
    if (data.status === "complete") return data
    if (data.status === "error") throw new Error(data.error_message ?? "Scan failed")
    if (data.status === "cancelled") throw new Error("Scan was cancelled")
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error(`Scan timed out after ${Math.round(maxWaitMs / 1000)}s. The scan may still be running — call get_scan("${scanId}") later, or cancel_scan("${scanId}") to abort.`)
}

/**
 * Format the optional visual review (Browserless screenshot + Haiku vision)
 * as a clearly-labeled "suggestions, not fixes" block. This is explicitly
 * distinct from the issues list — issues are things to fix, design notes
 * are soft suggestions the user can consider.
 *
 * Returns an empty string when no visual review is present (which is the
 * common case until the background visual-review pipeline runs).
 */
function formatVisualReview(raw: unknown): string {
  if (!raw || typeof raw !== "object") return ""
  const review = raw as {
    working?: unknown
    issues?: unknown
    improve?: unknown
  }

  const working = Array.isArray(review.working)
    ? review.working.filter((x): x is string => typeof x === "string")
    : []
  const issueNotes = Array.isArray(review.issues)
    ? review.issues.filter((x): x is string => typeof x === "string")
    : []
  const improve = typeof review.improve === "string" ? review.improve : null

  if (working.length === 0 && issueNotes.length === 0 && !improve) return ""

  const lines: string[] = [
    `---`,
    `## 🎨 Design notes (soft suggestions, NOT required fixes)`,
    ``,
    `> These are optional UI/UX observations from a vision model looking at a screenshot of the page, grounded in the site's ICP. Treat them as light polish ideas — skip or apply at the user's discretion. They are NOT issues that must be fixed and are NOT scored against the user's SEO health.`,
    ``,
  ]
  if (working.length > 0) {
    lines.push(`**What's working well:**`)
    for (const w of working) lines.push(`- ${w}`)
    lines.push(``)
  }
  if (issueNotes.length > 0) {
    lines.push(`**Opportunities (consider, don't must-fix):**`)
    for (const i of issueNotes) lines.push(`- ${i}`)
    lines.push(``)
  }
  if (improve) {
    lines.push(`**Suggested polish (optional, ~1 hour of effort):**`)
    lines.push(improve)
    lines.push(``)
  }
  return lines.join("\n")
}

function authErrorHint(raw: string): string {
  if (/api key/i.test(raw)) {
    return [
      raw,
      "",
      "Set SEOLINT_API_KEY in your MCP client config (not your shell):",
      '  Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%/Claude/claude_desktop_config.json (Windows)',
      '  Claude Code:    ~/.claude.json under mcpServers["seolint"].env',
      'Then restart the MCP client so the new env is picked up.',
    ].join("\n")
  }
  return raw
}

const server = new McpServer({
  name: "seolint",
  version: "0.1.0",
})

// Tool: next_action — the "what should I do next" oracle.
// This is the recommended entry point for any SEO question. Call it FIRST,
// before scan_website or any other tool, when the user asks "what should I do
// to improve my SEO?" or "what's next?". It tells you the single most impactful
// thing to fix — or to wait when nothing needs doing right now.
server.tool(
  "next_action",
  "The 'what should I do next' oracle. Given a URL, returns the SINGLE most impactful next action grounded in scan history, memory, recurring patterns, and site profile — or 'wait and re-scan in N days' when that's the right call. Call this FIRST whenever the user asks an open-ended SEO improvement question. Unlike other tools, it returns one decision, not data.",
  { url: z.string().describe("The URL to get a next-action recommendation for, e.g. https://example.com") },
  async ({ url }) => {
    const res = await fetch(`${API_BASE}/api/v1/next-action?url=${encodeURIComponent(url)}`, { headers: headers() })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const raw = (err as Record<string, string>).error ?? res.statusText
      return {
        content: [{ type: "text" as const, text: `Failed to get next action: ${authErrorHint(raw)}` }],
        isError: true,
      }
    }

    const data = await res.json()
    return {
      content: [{ type: "text" as const, text: data.markdown ?? "No recommendation available." }],
    }
  },
)

// Tool: scan a website
server.tool(
  "scan_website",
  "Scan a website for SEO, performance, accessibility, and AI search issues. Automatically compares with scan history to label issues as NEW, PERSISTING, or REGRESSED (was fixed but came back). Returns LLM-ready fix instructions per issue.",
  { url: z.string().describe("The full URL to scan, e.g. https://example.com") },
  async ({ url }) => {
    // Kick off scan + fetch history in parallel
    const [startRes, historyRes] = await Promise.all([
      fetch(`${API_BASE}/api/v1/scan`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ url }),
      }),
      fetch(`${API_BASE}/api/v1/history?url=${encodeURIComponent(url)}`, {
        headers: headers(),
      }).catch(() => null),
    ])

    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({}))
      const raw = (err as Record<string, string>).error ?? startRes.statusText
      return {
        content: [{ type: "text" as const, text: `Failed to start scan: ${authErrorHint(raw)}` }],
        isError: true,
      }
    }

    const { scanId } = await startRes.json()

    // Parse history while scan runs
    let resolvedIds = new Set<string>()
    let previousIssueIds = new Set<string>()
    let recurringIds = new Set<string>()
    let dismissedMap = new Map<string, string>() // issue_id -> reason
    let recurringIssues: Array<{ issue_id: string; resurface_count: number }> = []
    let scanCount = 0
    let trackedDays = 0
    if (historyRes?.ok) {
      const history = await historyRes.json().catch(() => null)
      if (history) {
        resolvedIds = new Set<string>(history.resolved_issue_ids ?? [])
        recurringIssues = (history.recurring_issues ?? []) as Array<{ issue_id: string; resurface_count: number }>
        recurringIds = new Set<string>(recurringIssues.map((r) => r.issue_id))
        scanCount = (history.scans ?? []).length
        // Collect all issue IDs from previous scans
        for (const s of history.scans ?? []) {
          for (const id of s.issue_ids ?? []) previousIssueIds.add(id)
        }
        // Parse dismissed issues
        for (const d of (history.dismissed_issues ?? []) as Array<{ issue_id: string; reason: string }>) {
          dismissedMap.set(d.issue_id, d.reason)
        }
        // Calculate tracked days from oldest scan
        if (scanCount > 0) {
          const oldest = (history.scans as Array<{ created_at: string }>)[scanCount - 1]
          trackedDays = Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / 86_400_000)
        }
      }
    }

    const hasPreviousScans = previousIssueIds.size > 0

    // Poll scan to completion
    try {
      const result = await pollScan(scanId)
      const issues = (result.issues ?? []) as Array<{
        id: string; severity: string; category: string; title: string; description: string; fix: string; previously_resolved?: boolean
      }>

      if (issues.length === 0) {
        return {
          content: [{ type: "text" as const, text: `✅ No issues found for ${url}. The site looks good!\n\nscan_id: ${scanId}` }],
        }
      }

      // Annotate each issue — filter out dismissed
      const newIssues: typeof issues = []
      const regressedIssues: typeof issues = []
      const persistingIssues: typeof issues = []
      const dismissedIssues: typeof issues = []

      for (const issue of issues) {
        if (dismissedMap.has(issue.id)) {
          dismissedIssues.push(issue)
          continue
        }
        const wasResolved = resolvedIds.has(issue.id) || issue.previously_resolved
        const wasSeen = previousIssueIds.has(issue.id)
        if (wasResolved) {
          regressedIssues.push(issue) // fixed before, back again
        } else if (hasPreviousScans && wasSeen) {
          persistingIssues.push(issue) // known issue, never fixed
        } else {
          newIssues.push(issue) // first time seeing this
        }
      }

      const activeCount = newIssues.length + regressedIssues.length + persistingIssues.length

      const label = (issue: typeof issues[0]) => {
        if (resolvedIds.has(issue.id) || issue.previously_resolved) return "🔁 REGRESSED"
        if (hasPreviousScans && previousIssueIds.has(issue.id)) return "⏳ PERSISTING"
        return "🆕 NEW"
      }

      const formatIssue = (issue: typeof issues[0], i: number) => [
        `## ${i + 1}. ${label(issue)} [${issue.severity.toUpperCase()}] ${issue.title}`,
        `**id:** \`${issue.id}\`${recurringIds.has(issue.id) ? " ⚠️ recurring" : ""}`,
        `**Category:** ${issue.category}`,
        issue.description,
        `**Fix:** ${issue.fix}`,
      ].join("\n")

      const summaryParts = [
        `**${activeCount} issues**`,
        `🆕 ${newIssues.length} new`,
        `🔁 ${regressedIssues.length} regressed`,
        `⏳ ${persistingIssues.length} persisting`,
      ]
      if (dismissedIssues.length > 0) summaryParts.push(`${dismissedIssues.length} dismissed (hidden)`)

      const sections: string[] = [
        `# SEO Audit: ${url}`,
        `scan_id: ${scanId}`,
        ``,
        summaryParts.join(" · "),
        ``,
      ]

      // Scan Memory block — gives Claude context from previous scans
      if (hasPreviousScans || dismissedMap.size > 0) {
        const memoryLines: string[] = [`---`, `## 📋 Scan Memory`]

        if (scanCount > 0) {
          memoryLines.push(`**History:** ${scanCount} scan${scanCount !== 1 ? "s" : ""} over ${trackedDays} day${trackedDays !== 1 ? "s" : ""}`)
        }

        if (recurringIssues.length > 0) {
          memoryLines.push(``, `**Recurring issues (keep coming back after fixes):**`)
          for (const r of recurringIssues) {
            memoryLines.push(`- \`${r.issue_id}\` — resurfaced ${r.resurface_count}×`)
          }
        }

        if (dismissedMap.size > 0) {
          memoryLines.push(``, `**Dismissed (${dismissedMap.size} issue${dismissedMap.size !== 1 ? "s" : ""}, not shown in results):**`)
          for (const [id, reason] of dismissedMap) {
            memoryLines.push(`- \`${id}\`${reason ? ` — "${reason}"` : ""}`)
          }
          memoryLines.push(``, `> To un-dismiss any of these, call undismiss_issues().`)
        }

        sections.push(memoryLines.join("\n"))
        sections.push(``)
      }

      if (regressedIssues.length > 0) {
        sections.push(`---\n## 🔁 Regressed — were fixed, came back (${regressedIssues.length})`)
        sections.push(...regressedIssues.map(formatIssue))
      }
      if (newIssues.length > 0) {
        sections.push(`---\n## 🆕 New issues (${newIssues.length})`)
        sections.push(...newIssues.map(formatIssue))
      }
      if (persistingIssues.length > 0) {
        sections.push(`---\n## ⏳ Persisting — known, not yet fixed (${persistingIssues.length})`)
        sections.push(...persistingIssues.map(formatIssue))
      }

      // Optional visual review — soft design suggestions, never required fixes.
      // Empty string when the review isn't ready or wasn't generated.
      const visualReviewBlock = formatVisualReview((result as { visual_review?: unknown }).visual_review)
      if (visualReviewBlock) {
        sections.push(visualReviewBlock)
      }

      const footerLines = [
        `\n---`,
        `To mark issues as fixed after you've resolved them, call mark_issues_fixed("${scanId}", ["issue-id-1", "issue-id-2"])`,
        `To dismiss false positives: dismiss_issues("${scanId}", ["issue-id"], "reason why it's not a real issue")`,
      ]
      if (!visualReviewBlock) {
        footerLines.push(`Design notes (soft suggestions) may appear ~30-60s after scan completion. Call get_scan("${scanId}") again to see them.`)
      }
      sections.push(footerLines.join("\n"))

      return {
        content: [{ type: "text" as const, text: sections.join("\n\n") }],
      }
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Scan failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      }
    }
  }
)

// Tool: get an existing scan result
server.tool(
  "get_scan",
  "Get the results of a previous SEOLint scan by its ID.",
  { scanId: z.string().describe("The scan ID (UUID)") },
  async ({ scanId }) => {
    const res = await fetch(`${API_BASE}/api/v1/scan/${scanId}`, { headers: headers() })

    if (!res.ok) {
      return {
        content: [{ type: "text" as const, text: `Scan not found: ${scanId}` }],
        isError: true,
      }
    }

    const data = await res.json()

    if (data.status === "pending") {
      return {
        content: [{ type: "text" as const, text: `Scan ${scanId} is still running. Try again in a few seconds.` }],
      }
    }

    if (data.status === "error") {
      return {
        content: [{ type: "text" as const, text: `Scan failed: ${data.error_message ?? "Unknown error"}` }],
        isError: true,
      }
    }

    // Append the optional visual review as a clearly-labeled "soft suggestions,
    // not fixes" block. Empty string when the review isn't ready or wasn't
    // generated for this scan.
    const visualReviewBlock = formatVisualReview(data.visual_review)
    const markdown = data.markdown ?? JSON.stringify(data.issues, null, 2)
    const output = visualReviewBlock ? `${markdown}\n\n${visualReviewBlock}` : markdown
    return {
      content: [{ type: "text" as const, text: output }],
    }
  }
)

// Tool: cancel a pending scan
server.tool(
  "cancel_scan",
  "Cancel a scan that is still pending. Use this as an escape hatch when scan_website is taking too long, the wrong URL was scanned, or you need to abort and try again. Has no effect on scans that are already complete, errored, or cancelled.",
  { scanId: z.string().describe("The scan ID (UUID) to cancel") },
  async ({ scanId }) => {
    const res = await fetch(`${API_BASE}/api/v1/scan/${scanId}`, {
      method: "DELETE",
      headers: headers(),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        content: [{ type: "text" as const, text: `Failed to cancel scan: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json() as { status?: string; message?: string }
    return {
      content: [{ type: "text" as const, text: data.message ?? `Scan ${scanId} status: ${data.status ?? "unknown"}` }],
    }
  }
)

// Tool: get full status + rescan recommendation for a site
server.tool(
  "get_site_status",
  "Get the full memory picture for a site: trend (improving/degrading/stable), recurring patterns, days since last scan, and a rescan recommendation with reasoning. Use this for high-level questions like 'how is this site doing?' or 'should I scan this again?'. For a flat list of what still needs fixing right now, use get_open_issues instead.",
  { url: z.string().describe("The URL to check, e.g. https://example.com") },
  async ({ url }) => {
    const res = await fetch(`${API_BASE}/api/v1/site-status?url=${encodeURIComponent(url)}`, {
      headers: headers(),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        content: [{ type: "text" as const, text: `Failed to get site status: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json()
    return {
      content: [{ type: "text" as const, text: data.markdown ?? "No data found." }],
    }
  }
)

// Tool: list all tracked sites
server.tool(
  "list_my_sites",
  "List all websites you have previously scanned with SEOLint. Shows the latest scan date and issue count per site. Use this to discover what sites are being tracked before deciding what to work on next.",
  {},
  async () => {
    const res = await fetch(`${API_BASE}/api/v1/sites`, { headers: headers() })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        content: [{ type: "text" as const, text: `Failed to list sites: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json()
    return {
      content: [{ type: "text" as const, text: data.markdown ?? "No sites found." }],
    }
  }
)

// Tool: get open (unresolved) issues for a URL without rescanning
server.tool(
  "get_open_issues",
  "Get the currently open (unresolved) issues for a URL based on the latest scan — without running a new scan. Use this to resume a fix session, or whenever you need a flat actionable list of what still needs fixing. Surfaces previously-fixed issues that have regressed. For higher-level trend/health context, use get_site_status instead.",
  { url: z.string().describe("The URL to check, e.g. https://example.com") },
  async ({ url }) => {
    const res = await fetch(`${API_BASE}/api/v1/open-issues?url=${encodeURIComponent(url)}`, {
      headers: headers(),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        content: [{ type: "text" as const, text: `Failed to get open issues: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json()
    return {
      content: [{ type: "text" as const, text: data.markdown ?? "No data found." }],
    }
  }
)

// Tool: get scan history + resolution state for a URL
server.tool(
  "get_site_history",
  "Get the scan history for a URL: previous scans, which issues were marked as fixed, which issues keep recurring, and which previously-fixed issues have reappeared. Always call this before starting a fix session so you have context.",
  { url: z.string().describe("The URL to get history for, e.g. https://example.com") },
  async ({ url }) => {
    const res = await fetch(`${API_BASE}/api/v1/history?url=${encodeURIComponent(url)}`, {
      headers: headers(),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        content: [{ type: "text" as const, text: `Failed to get history: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json()
    return {
      content: [{ type: "text" as const, text: data.markdown ?? "No history found." }],
    }
  }
)

// Tool: get full site intelligence (profile, sitemap, cross-page insights)
server.tool(
  "get_site_intelligence",
  "Get the full intelligence picture for a domain: what the site is trying to achieve, ICP, sitemap structure and gaps, cross-page patterns (template issues affecting multiple pages), and scan coverage by page type. Call this at the start of any SEO session to understand the site before diving into individual page issues.",
  { domain: z.string().describe("The domain to analyze, e.g. example.com (no https://)") },
  async ({ domain }) => {
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    const res = await fetch(
      `${API_BASE}/api/v1/site-intelligence?domain=${encodeURIComponent(cleanDomain)}`,
      { headers: headers() },
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        content: [{ type: "text" as const, text: `Failed to get site intelligence: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json()
    return {
      content: [{ type: "text" as const, text: data.markdown ?? "No intelligence data yet — scan some pages first." }],
    }
  }
)

// Tool: mark issues as fixed
server.tool(
  "mark_issues_fixed",
  "Mark specific issues from a scan as fixed. Call this after the user has confirmed they fixed an issue. If an issue was previously fixed but reappeared, the resurface count is incremented so the system learns it keeps recurring.",
  {
    scan_id: z.string().describe("The scan ID containing the issues"),
    issue_ids: z.array(z.string()).describe("Array of issue IDs to mark as fixed, e.g. [\"missing-title\", \"missing-h1\"]"),
  },
  async ({ scan_id, issue_ids }) => {
    const res = await fetch(`${API_BASE}/api/v1/scan/${scan_id}/resolve`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ issue_ids }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        content: [{ type: "text" as const, text: `Failed to mark issues as fixed: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json() as { message?: string; resolved?: string[]; resurfaced?: string[] }
    const lines = [
      data.message ?? "Issues marked as fixed.",
      data.resurfaced && data.resurfaced.length > 0
        ? `Note: ${data.resurfaced.join(", ")} had been fixed before — resurface count updated. This suggests these issues keep coming back.`
        : "",
    ].filter(Boolean)

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    }
  }
)

// Tool: dismiss issues as false positives
server.tool(
  "dismiss_issues",
  "Dismiss issues from a scan as false positives or intentional choices. Dismissed issues are hidden from future scan results and open-issues queries. Include a reason so future scans have context about why it was dismissed.",
  {
    scan_id: z.string().describe("The scan ID containing the issues"),
    issue_ids: z.array(z.string()).describe("Array of issue IDs to dismiss, e.g. [\"missing-h1\"]"),
    reason: z.string().describe("Why these issues are being dismissed, e.g. 'intentional design choice' or 'false positive — page uses h2 as primary heading'"),
  },
  async ({ scan_id, issue_ids, reason }) => {
    const res = await fetch(`${API_BASE}/api/v1/scan/${scan_id}/dismiss`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ issue_ids, reason }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        content: [{ type: "text" as const, text: `Failed to dismiss issues: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json() as { message?: string; dismissed?: string[] }
    return {
      content: [{ type: "text" as const, text: data.message ?? "Issues dismissed." }],
    }
  }
)

// Tool: un-dismiss previously dismissed issues
server.tool(
  "undismiss_issues",
  "Un-dismiss previously dismissed issues so they appear as open problems again in future scans.",
  {
    scan_id: z.string().describe("The scan ID (used to identify the URL)"),
    issue_ids: z.array(z.string()).describe("Array of issue IDs to un-dismiss"),
  },
  async ({ scan_id, issue_ids }) => {
    const res = await fetch(`${API_BASE}/api/v1/scan/${scan_id}/dismiss`, {
      method: "DELETE",
      headers: headers(),
      body: JSON.stringify({ issue_ids }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        content: [{ type: "text" as const, text: `Failed to un-dismiss issues: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json() as { message?: string; undismissed?: string[] }
    return {
      content: [{ type: "text" as const, text: data.message ?? "Issues un-dismissed." }],
    }
  }
)

// Look up the seolint API key from any host config file we know about.
// Used by doctor as a fallback when SEOLINT_API_KEY isn't in process.env
// (which is the common case when running doctor standalone in a shell —
// the env var only exists inside the MCP client's spawned subprocess).
async function findApiKeyInHostConfigs(): Promise<{ key: string; source: string } | null> {
  const fs = await import("fs")
  const path = await import("path")
  const os = await import("os")

  const home = os.homedir()
  const candidates: { file: string; label: string }[] = [
    { file: path.join(home, ".claude.json"), label: "Claude Code (~/.claude.json)" },
    { file: path.join(home, ".cursor", "mcp.json"), label: "Cursor (~/.cursor/mcp.json)" },
    { file: path.join(home, ".codeium", "windsurf", "mcp_config.json"), label: "Windsurf" },
  ]

  if (process.platform === "darwin") {
    candidates.push({
      file: path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      label: "Claude Desktop",
    })
  } else if (process.platform === "win32") {
    candidates.push({
      file: path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json"),
      label: "Claude Desktop",
    })
  } else {
    candidates.push({
      file: path.join(home, ".config", "Claude", "claude_desktop_config.json"),
      label: "Claude Desktop",
    })
  }

  for (const { file, label } of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const raw = fs.readFileSync(file, "utf8")
      if (!raw.trim()) continue
      const parsed = JSON.parse(raw) as { mcpServers?: Record<string, { env?: Record<string, string> }> }
      const key = parsed.mcpServers?.seolint?.env?.SEOLINT_API_KEY
      if (key && key.startsWith("sl_")) return { key, source: label }
    } catch {
      // ignore parse errors and keep looking
    }
  }
  return null
}

// ─── doctor: validates MCP setup end-to-end ────────────────────────────────
// Run as: `npx seolint-mcp doctor`
// Checks env var, API reachability, key validity, subscription, quota.
// Prints colored ✅/⚠️/❌ lines and exits non-zero on any failure.
async function runDoctor(): Promise<number> {
  const PASS = "\x1b[32m✅\x1b[0m"
  const WARN = "\x1b[33m⚠️\x1b[0m"
  const FAIL = "\x1b[31m❌\x1b[0m"
  const DIM = "\x1b[2m"
  const RESET = "\x1b[0m"

  console.log(`\nseolint-mcp doctor — checking your setup\n`)
  console.log(`${DIM}API base: ${API_BASE}${RESET}\n`)

  let failures = 0

  // 1. SEOLINT_API_KEY — env var first, then fall back to config files written by init/connect.
  // The standalone case is the common one: user runs `npx seolint-mcp doctor` in a plain shell
  // where the env var isn't set, but the key IS in ~/.claude.json (or wherever) from a prior connect.
  let resolvedKey = process.env.SEOLINT_API_KEY ?? ""
  let keySource = "SEOLINT_API_KEY env var"
  if (!resolvedKey) {
    const found = await findApiKeyInHostConfigs()
    if (found) {
      resolvedKey = found.key
      keySource = found.source
    }
  }

  if (!resolvedKey) {
    console.log(`${FAIL} No SEOLINT_API_KEY found`)
    console.log(`   Not in your shell environment, and not in any host config file.`)
    console.log(`   The fastest way to get set up:`)
    console.log(`     npx -y seolint-mcp connect claude-code`)
    console.log(`   Or get a key manually at https://seolint.dev/api`)
    console.log(`\nDoctor result: 1 problem found.\n`)
    return 1
  }
  console.log(`${PASS} API key found ${DIM}(${resolvedKey.slice(0, 7)}… via ${keySource})${RESET}`)

  // Make sure subsequent fetches inside doctor send the resolved key
  process.env.SEOLINT_API_KEY = resolvedKey

  // 2. API reachability + key validity
  let health: { ok?: boolean; error?: string; hint?: string; user?: { email: string; plan: string; has_access: boolean; subscription_status: string | null }; quota?: { scans_used: number; scans_remaining: number | string; monthly_limit: number | string } } | null = null
  try {
    const res = await fetch(`${API_BASE}/api/v1/health`, { headers: headers() })
    if (res.status === 401) {
      const body = await res.json().catch(() => ({} as Record<string, string>))
      console.log(`${FAIL} API rejected the key: ${(body as { error?: string }).error ?? "Unauthorized"}`)
      if ((body as { hint?: string }).hint) console.log(`   ${(body as { hint?: string }).hint}`)
      console.log(`\nDoctor result: 1 problem found.\n`)
      return 1
    }
    if (!res.ok) {
      console.log(`${FAIL} API returned HTTP ${res.status} from ${API_BASE}/api/v1/health`)
      console.log(`   The API may be down. Status: https://seolint.dev`)
      console.log(`\nDoctor result: 1 problem found.\n`)
      return 1
    }
    health = await res.json()
    console.log(`${PASS} API reachable at ${API_BASE}`)
    console.log(`${PASS} API key is valid ${DIM}(authenticated as ${health?.user?.email})${RESET}`)
  } catch (err) {
    console.log(`${FAIL} Could not reach ${API_BASE}/api/v1/health`)
    console.log(`   ${err instanceof Error ? err.message : String(err)}`)
    console.log(`   Check your network connection and any corporate proxy settings.`)
    console.log(`\nDoctor result: 1 problem found.\n`)
    return 1
  }

  // 3. Subscription
  if (!health?.user?.has_access && health?.user?.plan !== "admin") {
    console.log(`${WARN} No active subscription (plan: ${health?.user?.plan ?? "free"})`)
    console.log(`   You'll get 1 free scan to try it. Subscribe at https://seolint.dev/pricing for more.`)
    failures++
  } else {
    console.log(`${PASS} Subscription active ${DIM}(plan: ${health?.user?.plan})${RESET}`)
  }

  // 4. Quota
  const remaining = health?.quota?.scans_remaining
  const limit = health?.quota?.monthly_limit
  if (typeof remaining === "number" && remaining === 0) {
    console.log(`${WARN} Monthly scan quota exhausted (0 of ${limit} remaining)`)
    console.log(`   Resets on the 1st of next month, or upgrade at https://seolint.dev/pricing`)
    failures++
  } else {
    console.log(`${PASS} Quota: ${remaining} of ${limit} scans remaining this month`)
  }

  // 5. Sanity-check tools by listing sites
  try {
    const res = await fetch(`${API_BASE}/api/v1/sites`, { headers: headers() })
    if (res.ok) {
      console.log(`${PASS} Tools reachable ${DIM}(list_my_sites returned 200)${RESET}`)
    } else {
      console.log(`${WARN} list_my_sites returned HTTP ${res.status} — most tools may still work`)
      failures++
    }
  } catch {
    console.log(`${WARN} Could not test tools endpoint`)
    failures++
  }

  console.log(`\nDoctor result: ${failures === 0 ? "all checks passed ✨" : `${failures} warning${failures !== 1 ? "s" : ""}`}\n`)
  return failures === 0 ? 0 : 0 // warnings don't fail the exit code
}

// ─── init: writes MCP config for the chosen host ──────────────────────────
// Usage:
//   npx -y seolint-mcp init                 → auto-detect, defaults to claude-code
//   npx -y seolint-mcp init claude-desktop  → write Claude Desktop config
//   npx -y seolint-mcp init cursor          → write Cursor config
//   npx -y seolint-mcp init windsurf        → write Windsurf config
//   npx -y seolint-mcp init vscode          → write VS Code project config
async function runInit(rawHost: string | undefined): Promise<number> {
  const fs = await import("fs")
  const path = await import("path")
  const os = await import("os")

  const PASS = "\x1b[32m✅\x1b[0m"
  const FAIL = "\x1b[31m❌\x1b[0m"
  const DIM = "\x1b[2m"
  const RESET = "\x1b[0m"

  type Host = "claude-code" | "claude-desktop" | "cursor" | "windsurf" | "vscode"
  const VALID: Host[] = ["claude-code", "claude-desktop", "cursor", "windsurf", "vscode"]

  const host = (rawHost ?? "claude-code").toLowerCase() as Host
  if (!VALID.includes(host)) {
    console.log(`${FAIL} Unknown host: "${rawHost}"`)
    console.log(`   Valid hosts: ${VALID.join(", ")}`)
    return 1
  }

  // API key — required to write a useful config. Read from env each time so the
  // connect flow can set it dynamically just before calling runInit.
  const apiKey = process.env.SEOLINT_API_KEY ?? ""
  if (!apiKey) {
    console.log(`${FAIL} SEOLINT_API_KEY is not set in your shell environment.`)
    console.log(``)
    console.log(`   init needs your API key so it can write the config. Get yours at:`)
    console.log(`     https://seolint.dev/api`)
    console.log(``)
    console.log(`   Then re-run with the key in front:`)
    console.log(`     SEOLINT_API_KEY=sl_xxx npx -y seolint-mcp init ${host}`)
    return 1
  }

  console.log(`\nseolint-mcp init — configuring ${host}\n`)

  // Resolve config file path per host + OS
  function resolveConfigPath(h: Host): { file: string; create: boolean } {
    const home = os.homedir()
    switch (h) {
      case "claude-code":
        return { file: path.join(home, ".claude.json"), create: true }
      case "claude-desktop": {
        if (process.platform === "darwin") return { file: path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"), create: true }
        if (process.platform === "win32") return { file: path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json"), create: true }
        return { file: path.join(home, ".config", "Claude", "claude_desktop_config.json"), create: true }
      }
      case "cursor":
        return { file: path.join(home, ".cursor", "mcp.json"), create: true }
      case "windsurf":
        return { file: path.join(home, ".codeium", "windsurf", "mcp_config.json"), create: true }
      case "vscode":
        return { file: path.join(process.cwd(), ".vscode", "mcp.json"), create: true }
    }
  }

  const { file } = resolveConfigPath(host)
  console.log(`${DIM}Target file: ${file}${RESET}`)

  // Read existing config (or start fresh) — preserve any other MCP servers the user has
  let existing: { mcpServers?: Record<string, unknown>; [k: string]: unknown } = {}
  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, "utf8")
      existing = raw.trim() ? JSON.parse(raw) : {}
      console.log(`${PASS} Found existing config — will merge`)
    } catch (err) {
      console.log(`${FAIL} Could not parse existing config at ${file}`)
      console.log(`   ${err instanceof Error ? err.message : String(err)}`)
      console.log(`   Fix or delete the file and try again.`)
      return 1
    }
  } else {
    console.log(`${DIM}File does not exist — will create${RESET}`)
  }

  // Build the seolint server entry
  const seolintEntry = {
    command: "npx",
    args: ["-y", "seolint-mcp"],
    env: { SEOLINT_API_KEY: apiKey },
  }

  // Merge — preserve other servers, replace any existing seolint entry
  const merged = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      seolint: seolintEntry,
    },
  }

  // Ensure directory exists
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  } catch {
    /* ignore — write will fail with a clearer error */
  }

  // Backup existing file before overwriting
  if (fs.existsSync(file)) {
    const backup = `${file}.bak`
    try {
      fs.copyFileSync(file, backup)
      console.log(`${DIM}Backed up existing config to ${backup}${RESET}`)
    } catch {
      /* non-fatal */
    }
  }

  // Write
  try {
    fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n", "utf8")
    console.log(`${PASS} Wrote ${file}`)
  } catch (err) {
    console.log(`${FAIL} Failed to write config file`)
    console.log(`   ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }

  // Tell user what to do next
  console.log(``)
  console.log(`Next steps:`)
  console.log(`  1. Restart ${labelFor(host)} so it picks up the new MCP server`)
  console.log(`  2. Verify with: npx -y seolint-mcp doctor`)
  console.log(`  3. Ask your agent: "Scan mysite.com for SEO issues"`)
  console.log(``)
  return 0
}

// ─── connect: browser-based OAuth-style sign-in ───────────────────────────
// Usage: `npx -y seolint-mcp connect [host]`
// Opens a browser, lets the user approve in their existing seolint.dev session,
// then writes the API key into the host's MCP config automatically.
async function runConnect(rawHost: string | undefined): Promise<number> {
  const child_process = await import("child_process")

  const PASS = "\x1b[32m✅\x1b[0m"
  const FAIL = "\x1b[31m❌\x1b[0m"
  const DIM = "\x1b[2m"
  const RESET = "\x1b[0m"

  type Host = "claude-code" | "claude-desktop" | "cursor" | "windsurf" | "vscode"
  const VALID: Host[] = ["claude-code", "claude-desktop", "cursor", "windsurf", "vscode"]
  const host = (rawHost ?? "claude-code").toLowerCase() as Host
  if (!VALID.includes(host)) {
    console.log(`${FAIL} Unknown host: "${rawHost}"`)
    console.log(`   Valid hosts: ${VALID.join(", ")}`)
    return 1
  }

  // First line of visible output — if the user sees nothing at all, npx is loading
  // a stale cached version. The version stamp here makes that obvious.
  console.log(`\nseolint-mcp v${VERSION} connect — ${labelFor(host)}\n`)
  console.log(`${DIM}API base: ${API_BASE}${RESET}`)

  // 1. Start a session
  console.log(`${DIM}Requesting session…${RESET}`)
  let startRes: Response
  try {
    startRes = await fetch(`${API_BASE}/api/auth/cli/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": `seolint-mcp/${VERSION}` },
      body: JSON.stringify({ host }),
      redirect: "follow",
    })
  } catch (err) {
    console.log(`${FAIL} Could not reach ${API_BASE}/api/auth/cli/start`)
    console.log(`   ${err instanceof Error ? err.message : String(err)}`)
    console.log(`   Check your network connection.`)
    return 1
  }
  if (!startRes.ok) {
    console.log(`${FAIL} Server returned HTTP ${startRes.status} from /api/auth/cli/start`)
    const text = await startRes.text().catch(() => "")
    if (text) console.log(`   ${text.slice(0, 200)}`)
    return 1
  }

  let session: { state?: string; auth_url?: string; expires_in?: number }
  try {
    session = await startRes.json()
  } catch (err) {
    console.log(`${FAIL} Could not parse server response as JSON`)
    console.log(`   ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
  const state = session.state
  const auth_url = session.auth_url
  const expires_in = session.expires_in ?? 600
  if (!state || !auth_url) {
    console.log(`${FAIL} Server response missing state or auth_url`)
    console.log(`   Response: ${JSON.stringify(session)}`)
    return 1
  }
  console.log(`${PASS} Session created`)
  console.log(``)
  console.log(`Open this URL in your browser to approve:`)
  console.log(`\x1b[36m  ${auth_url}\x1b[0m`)
  console.log(``)

  // 2. Try to open browser automatically. Fall back to the printed URL above.
  try {
    if (process.platform === "win32") {
      // PowerShell Start-Process is more reliable than cmd /c start for URLs with special chars
      child_process.spawn("powershell.exe", ["-NoProfile", "-Command", `Start-Process '${auth_url.replace(/'/g, "''")}'`], {
        stdio: "ignore",
        detached: true,
        windowsHide: true,
      }).unref()
    } else if (process.platform === "darwin") {
      child_process.spawn("open", [auth_url], { stdio: "ignore", detached: true }).unref()
    } else {
      child_process.spawn("xdg-open", [auth_url], { stdio: "ignore", detached: true }).unref()
    }
    console.log(`${DIM}(Browser launch attempted — if nothing opened, copy the URL above manually.)${RESET}`)
  } catch (err) {
    console.log(`${DIM}(Could not auto-open browser: ${err instanceof Error ? err.message : String(err)} — copy the URL above manually.)${RESET}`)
  }

  // 3. Poll
  console.log(``)
  console.log(`${DIM}Waiting for approval (up to ${Math.round(expires_in / 60)} minutes)…${RESET}`)
  console.log(`${DIM}Press Ctrl+C to cancel.${RESET}`)
  const deadline = Date.now() + expires_in * 1000
  let apiKey: string | null = null
  let pollCount = 0
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    pollCount++
    try {
      const pollRes = await fetch(`${API_BASE}/api/auth/cli/poll?state=${state}`, {
        headers: { "User-Agent": `seolint-mcp/${VERSION}` },
        redirect: "follow",
      })
      if (pollRes.status === 404) {
        console.log(`${FAIL} Session expired or not found. Run \`npx -y seolint-mcp connect\` again.`)
        return 1
      }
      const data = (await pollRes.json()) as { status: string; api_key?: string }
      if (data.status === "approved" && data.api_key) {
        apiKey = data.api_key
        break
      }
      if (data.status === "expired") {
        console.log(`${FAIL} Approval timed out. Run \`npx -y seolint-mcp connect\` again to start a new session.`)
        return 1
      }
      // Heartbeat every 30s so the user knows we're still alive
      if (pollCount % 15 === 0) {
        const elapsed = Math.round((Date.now() - (deadline - expires_in * 1000)) / 1000)
        console.log(`${DIM}…still waiting (${elapsed}s elapsed)${RESET}`)
      }
    } catch {
      // Transient network error — keep polling
    }
  }

  if (!apiKey) {
    console.log(`${FAIL} Approval timed out after ${Math.round(expires_in / 60)} minutes.`)
    return 1
  }

  console.log(`${PASS} Approved. Writing config for ${labelFor(host)}…\n`)

  // 4. Write config — reuse runInit by stuffing the key into env first
  process.env.SEOLINT_API_KEY = apiKey
  // The module-level API_KEY const was captured at startup; reassign it via global ref so headers() picks it up
  ;(globalThis as unknown as { __SEOLINT_API_KEY__?: string }).__SEOLINT_API_KEY__ = apiKey

  return await runInit(host)
}

function labelFor(h: string): string {
  switch (h) {
    case "claude-code": return "Claude Code"
    case "claude-desktop": return "Claude Desktop"
    case "cursor": return "Cursor"
    case "windsurf": return "Windsurf"
    case "vscode": return "VS Code"
    default: return h
  }
}

function printHelp() {
  console.log(`
seolint-mcp — SEOLint MCP server

Usage:
  npx -y seolint-mcp                  Run as MCP server over stdio (default; used by MCP clients)
  npx -y seolint-mcp connect [host]   Browser-based sign-in — opens seolint.dev, you click approve,
                                      and the API key is written into [host]'s MCP config automatically
  npx -y seolint-mcp doctor           Validate your setup (API key, connectivity, quota)
  npx -y seolint-mcp init [host]      Write MCP config for [host] using SEOLINT_API_KEY env var
                                      Hosts: claude-code, claude-desktop, cursor, windsurf, vscode
  npx -y seolint-mcp upgrade          Re-run init for the current host and check version
  npx -y seolint-mcp --version        Print version
  npx -y seolint-mcp --help           Show this help

Environment:
  SEOLINT_API_KEY                     Your API key from https://seolint.dev/api (required)
  SEOLINT_API_URL                     Override the API base (default: https://www.seolint.dev)

Examples:
  SEOLINT_API_KEY=sl_xxx npx -y seolint-mcp init cursor
  SEOLINT_API_KEY=sl_xxx npx -y seolint-mcp doctor

Docs: https://seolint.dev/docs/mcp
`)
}

function printVersion() {
  console.log(`seolint-mcp ${VERSION}`)
}

async function main() {
  const cmd = process.argv[2]
  if (cmd === "doctor") {
    const code = await runDoctor()
    process.exit(code)
  }
  if (cmd === "connect") {
    const code = await runConnect(process.argv[3])
    process.exit(code)
  }
  if (cmd === "init") {
    const code = await runInit(process.argv[3])
    process.exit(code)
  }
  if (cmd === "upgrade") {
    // upgrade = re-run init for current host + report installed version
    console.log(`\nseolint-mcp upgrade — refreshing your config\n`)
    console.log(`This package is always pulled fresh by \`npx -y seolint-mcp\`, so the MCP server itself is automatically up to date on every launch.`)
    console.log(`Re-running init now to refresh your config file (default host: claude-code).`)
    console.log(`To pick a different host: npx -y seolint-mcp init <host>\n`)
    const code = await runInit(process.argv[3] ?? "claude-code")
    process.exit(code)
  }
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp()
    process.exit(0)
  }
  if (cmd === "--version" || cmd === "-v") {
    printVersion()
    process.exit(0)
  }
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error("SEOLint MCP server failed to start:", err)
  process.exit(1)
})
