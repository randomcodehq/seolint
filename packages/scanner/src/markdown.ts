/**
 * Client-safe markdown renderer for scan results.
 *
 * Lives in its own module (instead of `lib/scanner/index.ts`) so client
 * components like ReportPoller can import it without pulling the entire
 * scanner module graph — which includes `got` and transitive Node
 * built-ins (`node:net`, `node:timers/promises`) — into the browser bundle.
 *
 * This file MUST have zero Node-only imports.
 */

import type { ScanIssue } from "./types"

export function toMarkdown(url: string, issues: ScanIssue[], completedIds?: Set<string>): string {
  if (issues.length === 0) return `# Website Audit: ${url}\n\nNo issues found. Your site looks good!\n`

  const done = completedIds ?? new Set<string>()
  const open = issues.filter((i) => !done.has(i.id))
  const fixed = issues.filter((i) => done.has(i.id))

  const bySection: Record<string, ScanIssue[]> = { critical: [], warning: [], info: [] }
  for (const issue of open) bySection[issue.severity].push(issue)

  const sectionTitle: Record<string, string> = {
    critical: "🔴 Critical: fix these first",
    warning:  "🟡 Warnings: high impact improvements",
    info:     "🔵 Info: opportunities and minor fixes",
  }

  let md = `# Website Audit: ${url}\nGenerated: ${new Date().toISOString().split("T")[0]}\n\n`
  md += `**${open.length} issues remaining** · ${fixed.length} already fixed\n\n`
  md += `Fix the issues below. Issues marked as "already fixed" have been handled and can be skipped.\n\n---\n\n`

  for (const [severity, items] of Object.entries(bySection)) {
    if (items.length === 0) continue
    md += `## ${sectionTitle[severity]}\n\n`
    items.forEach((issue, i) => {
      md += `### ${i + 1}. ${issue.title}\n\n`
      md += `**Category:** ${issue.category.toUpperCase()}  \n**Severity:** ${issue.severity}  \n**Issue ID:** \`${issue.id}\`\n\n`
      md += `${issue.description}\n\n`
      if (issue.element) md += `**Found on page:**\n\`\`\`html\n${issue.element}\n\`\`\`\n\n`
      // Page-specific impact (AI-generated, optional). Renders above the fix so
      // the agent can explain *why* before applying the change.
      if (issue.why) md += `**Why this matters here:** ${issue.why}\n\n`
      // The fix is an executable agent instruction (steps + code blocks), not prose.
      md += `**Apply this fix:**\n\n${issue.fix}\n\n`
      md += `---\n\n`
    })
  }

  if (fixed.length > 0) {
    md += `## ✅ Already fixed (${fixed.length})\n\n`
    md += `These issues have been resolved. No action needed.\n\n`
    fixed.forEach((issue) => {
      md += `- ~~${issue.title}~~ (${issue.category.toUpperCase()})\n`
    })
    md += `\n---\n\n`
  }

  md += `## After fixing\n\n`
  md += `Mark resolved issues as fixed so SEOLint tracks your progress across scans:\n\n`
  md += `\`\`\`\nmark_issues_fixed("<scan_id>", ["issue-id-1", "issue-id-2"])\n\`\`\`\n\n`
  md += `If you're using the SEOLint MCP server, call the \`mark_issues_fixed\` tool with the issue IDs you fixed.\n\n`
  md += `*Audit by SEOLint.dev*\n`
  return md
}
