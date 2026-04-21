/**
 * Shared scanner types. Kept in a dedicated module so client components can
 * import them without dragging in the whole `lib/scanner/index.ts` module
 * graph (which includes `got` + Node built-ins that break the
 * client bundle).
 */

export interface RawIssue {
  id: string
  category: "seo" | "accessibility" | "performance" | "ux" | "aeo"
  severity: "critical" | "warning" | "info"
  /** Whether this is a concrete problem ("issue") or a best-practice recommendation ("suggestion").
   *  Issues = something is wrong. Suggestions = could be better but isn't broken.
   *  Defaults to "issue" when omitted for backwards compatibility. */
  type?: "issue" | "suggestion"
  title: string
  description: string
  fix: string
  /** The actual HTML element or value found on the page. Omitted when nothing exists (e.g. missing tag). Capped at 300 chars. Included in MCP/API output; hidden in UI by default. */
  element?: string
  /** AI-generated, page-specific explanation of why this matters for THIS site (vs the generic `description`). Populated by enrichWithAiFixes. */
  why?: string
}

export interface ScanIssue extends RawIssue {
  gated: boolean
}

export interface ScanResult {
  issues: ScanIssue[]
  performanceScore?: number
  lcp?: number
  cls?: number
  /** Detected framework (from lib/scanner/framework.ts). Persisted to
   *  site_profiles.primary_framework by run-scan.ts so cross-user segmentation
   *  can group sites by stack. */
  framework?: string
}
