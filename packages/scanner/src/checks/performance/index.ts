import type { RawIssue } from "../../index"
import rules from "../../rules.json"

interface PsiAuditItem {
  url?: string
  wastedMs?: number
  wastedBytes?: number
  totalBytes?: number
  cacheLifetimeMs?: number
  node?: { snippet?: string; selector?: string }
  [key: string]: unknown
}

interface PsiAudit {
  id?: string
  title?: string
  description?: string
  numericValue?: number
  score?: number | null
  displayValue?: string
  details?: {
    type?: string
    overallSavingsMs?: number
    overallSavingsBytes?: number
    items?: PsiAuditItem[]
  }
}

interface PsiResponse {
  lighthouseResult?: {
    categories?: {
      performance?: { score?: number }
    }
    audits?: Record<string, PsiAudit>
  }
}

/**
 * Pull opportunities + diagnostics from the Lighthouse audit map. These are
 * the specific actionable fixes PageSpeed actually identifies on the page —
 * what we used to throw away and replace with a useless "check pagespeed.web.dev"
 * link.
 *
 * Lighthouse v11+ renamed and grouped these under "Insights" + "Diagnostics" in
 * the web UI, so we expand the known-id allow-list AND fall back to a generic
 * "anything with score < 0.9 and meaningful savings" pass. That way new audits
 * Google adds in future versions still surface instead of being silently dropped.
 *
 * Sort order: biggest time savings first, then biggest byte savings, then the
 * rest. Top 6 are returned — enough to be useful without spamming the fix text.
 */
interface OpportunityEntry {
  id: string
  title: string
  description: string
  displayValue: string
  savingsMs: number
  savingsBytes: number
  items: PsiAuditItem[]
}

// Known audits that are safe to surface as "things to fix". Curated so we
// don't accidentally include informational-only audits. The generic fallback
// below catches newer audits (e.g. Lighthouse 11 insights) we haven't listed.
const KNOWN_OPPORTUNITY_IDS = new Set([
  // Classic opportunities
  "render-blocking-resources",
  "unused-javascript",
  "unused-css-rules",
  "modern-image-formats",
  "uses-optimized-images",
  "uses-text-compression",
  "uses-responsive-images",
  "efficient-animated-content",
  "offscreen-images",
  "uses-rel-preconnect",
  "uses-rel-preload",
  "font-display",
  "uses-long-cache-ttl",
  "total-byte-weight",
  "server-response-time",
  "legacy-javascript",
  "duplicated-javascript",
  "third-party-summary",
  "third-party-facades",

  // Diagnostics with fixable signal
  "dom-size",
  "long-tasks",
  "mainthread-work-breakdown",
  "bootup-time",
  "uses-http2",
  "uses-passive-event-listeners",
  "no-document-write",
  "non-composited-animations",
  "prioritize-lcp-image",
  "lcp-lazy-loaded",
  "largest-contentful-paint-element",
  "critical-request-chains",

  // Lighthouse 11+ insight audits (new naming scheme)
  "network-dependency-tree-insight",
  "lcp-breakdown-insight",
  "render-blocking-insight",
  "image-delivery-insight",
  "cache-insight",
  "document-latency-insight",
  "font-display-insight",
  "third-parties-insight",
  "dom-size-insight",
  "long-critical-network-tree-insight",
])

function extractOpportunities(audits: Record<string, PsiAudit>): OpportunityEntry[] {
  const entries: OpportunityEntry[] = []

  for (const [auditId, audit] of Object.entries(audits)) {
    // Skip audits the page already passes
    if ((audit.score ?? 1) >= 0.9) continue
    // Must have a title and either a display value or measurable savings
    if (!audit.title) continue

    const savingsMs = audit.details?.overallSavingsMs ?? 0
    const savingsBytes = audit.details?.overallSavingsBytes ?? 0
    const hasDisplay = !!audit.displayValue
    const hasSavings = savingsMs > 0 || savingsBytes > 0

    // Either it's on our known allow-list, OR it has concrete savings data
    // the user can act on. Purely qualitative audits without either get dropped.
    if (!KNOWN_OPPORTUNITY_IDS.has(auditId) && !hasSavings) continue
    if (!hasSavings && !hasDisplay) continue
    // Very small savings are noise
    if (savingsMs > 0 && savingsMs < 50) continue
    if (savingsMs === 0 && savingsBytes > 0 && savingsBytes < 2048) continue

    entries.push({
      id: auditId,
      title: audit.title,
      description: audit.description ?? "",
      displayValue: audit.displayValue ?? "",
      savingsMs,
      savingsBytes,
      items: (audit.details?.items ?? []).slice(0, 5),
    })
  }

  // Sort: biggest time savings first, then byte savings, then the rest
  entries.sort((a, b) => {
    if (b.savingsMs !== a.savingsMs) return b.savingsMs - a.savingsMs
    if (b.savingsBytes !== a.savingsBytes) return b.savingsBytes - a.savingsBytes
    return 0
  })

  return entries.slice(0, 6)
}

/** Format PSI audit items into a readable list showing the actual resources flagged. */
function formatPsiItems(items: PsiAuditItem[], auditId: string): string | null {
  if (!items.length) return null

  const lines: string[] = []
  for (const item of items) {
    const parts: string[] = []

    // URL (truncate to keep it readable)
    const itemUrl = item.url ?? (item.node?.selector)
    if (itemUrl) {
      const short = itemUrl.length > 80 ? `${itemUrl.slice(0, 77)}…` : itemUrl
      parts.push(short)
    }

    // HTML snippet from the DOM
    if (item.node?.snippet) {
      const snip = item.node.snippet.length > 100 ? `${item.node.snippet.slice(0, 97)}…` : item.node.snippet
      parts.push(snip)
    }

    // Wasted time/bytes
    const metrics: string[] = []
    if (item.wastedMs && item.wastedMs > 0) metrics.push(`${Math.round(item.wastedMs)}ms wasted`)
    if (item.wastedBytes && item.wastedBytes > 0) metrics.push(`${Math.round(item.wastedBytes / 1024)} KiB wasted`)
    if (item.totalBytes && item.totalBytes > 0 && !item.wastedBytes) metrics.push(`${Math.round(item.totalBytes / 1024)} KiB`)
    if (item.cacheLifetimeMs !== undefined) {
      const hours = Math.round(item.cacheLifetimeMs / 3600000)
      metrics.push(hours > 0 ? `cache: ${hours}h` : "no cache")
    }
    if (metrics.length) parts.push(metrics.join(" · "))

    if (parts.length) lines.push(`- ${parts.join(" — ")}`)
  }

  return lines.length > 0 ? lines.join("\n") : null
}

/** Build fix text from the actual PSI data. The description from PageSpeed
 *  is the starting point. The flagged resources themselves live in `element`
 *  (rendered as "Found on page") so we do NOT repeat them in the fix, and we
 *  never link back to pagespeed.web.dev — users came here to get away from
 *  that. Haiku enrichment then layers framework-aware context on top. */
function getPsiFix(_auditId: string, _url: string, description: string, _items: PsiAuditItem[]): string {
  const cleanDesc = description.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim()
  return cleanDesc
}

export interface PerformanceData {
  lcp?: number      // ms
  cls?: number
  inp?: number      // ms
  fcp?: number      // ms
  ttfb?: number     // ms
  score?: number    // 0-100
}

export async function checkPerformance(url: string): Promise<{ issues: RawIssue[]; data: PerformanceData }> {
  const issues: RawIssue[] = []
  const data: PerformanceData = {}

  try {
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile${apiKey ? `&key=${apiKey}` : ""}`

    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) return { issues, data }

    const json: PsiResponse = await res.json()
    const audits = json.lighthouseResult?.audits
    const perfScore = json.lighthouseResult?.categories?.performance?.score

    if (!audits) return { issues, data }

    data.lcp = audits["largest-contentful-paint"]?.numericValue
    data.cls = audits["cumulative-layout-shift"]?.numericValue
    data.inp = audits["interaction-to-next-paint"]?.numericValue
    data.fcp = audits["first-contentful-paint"]?.numericValue
    data.ttfb = audits["server-response-time"]?.numericValue
    data.score = perfScore != null ? Math.round(perfScore * 100) : undefined

    // LCP
    if (data.lcp != null) {
      if (data.lcp > rules.performance.lcp_poor_ms) {
        issues.push({
          id: "lcp-poor",
          category: "performance",
          severity: "critical",
          title: `Slow Largest Contentful Paint (${(data.lcp / 1000).toFixed(1)}s)`,
          description: `LCP measures how long it takes for the main content to load. At ${(data.lcp / 1000).toFixed(1)}s, your page is well above Google's "poor" threshold of ${rules.performance.lcp_poor_ms / 1000}s. This directly impacts rankings and bounce rate.`,
          fix: "Optimise LCP by: (1) serving images in WebP/AVIF format, (2) adding loading='eager' and fetchpriority='high' on the hero image, (3) enabling a CDN, (4) reducing server response time.",
        })
      } else if (data.lcp > rules.performance.lcp_good_ms) {
        issues.push({
          id: "lcp-needs-improvement",
          category: "performance",
          severity: "warning",
          title: `Largest Contentful Paint needs improvement (${(data.lcp / 1000).toFixed(1)}s)`,
          description: `LCP is ${(data.lcp / 1000).toFixed(1)}s — in the "needs improvement" range. Google's target is under ${rules.performance.lcp_good_ms / 1000}s. Slow LCP hurts both rankings and user retention.`,
          fix: "Compress and resize images, use a CDN, and preload key resources with <link rel='preload'>.",
        })
      }
    }

    // CLS
    if (data.cls != null) {
      if (data.cls > rules.performance.cls_poor) {
        issues.push({
          id: "cls-poor",
          category: "performance",
          severity: "critical",
          title: `High Cumulative Layout Shift (${data.cls.toFixed(3)})`,
          description: `CLS measures visual stability — how much the page jumps around as it loads. A score of ${data.cls.toFixed(3)} is above the "poor" threshold of ${rules.performance.cls_poor}. Users may accidentally click the wrong element if buttons or text shift while loading.`,
          fix: "Fix CLS by: (1) always declaring width and height on images and iframes, (2) avoiding inserting content above existing content, (3) reserving space for ads and embeds with a min-height.",
        })
      } else if (data.cls > rules.performance.cls_good) {
        issues.push({
          id: "cls-needs-improvement",
          category: "performance",
          severity: "warning",
          title: `Cumulative Layout Shift needs improvement (${data.cls.toFixed(3)})`,
          description: `CLS is ${data.cls.toFixed(3)}, above the "good" threshold of ${rules.performance.cls_good}. Elements shift during page load, disrupting the user experience.`,
          fix: "Add explicit width and height attributes to all images. Avoid dynamically injecting content above the fold.",
        })
      }
    }

    // INP
    if (data.inp != null) {
      if (data.inp > rules.performance.inp_poor_ms) {
        issues.push({
          id: "inp-poor",
          category: "performance",
          severity: "critical",
          title: `Poor Interaction to Next Paint (${data.inp}ms)`,
          description: `INP measures how quickly the page responds to user interactions (clicks, taps, key presses). At ${data.inp}ms, it's above Google's "poor" threshold of ${rules.performance.inp_poor_ms}ms — the page feels sluggish.`,
          fix: "Reduce JavaScript execution time, break up long tasks (>50ms), defer non-critical scripts, and use a web worker for heavy computation.",
        })
      } else if (data.inp > rules.performance.inp_good_ms) {
        issues.push({
          id: "inp-needs-improvement",
          category: "performance",
          severity: "warning",
          title: `Interaction to Next Paint needs improvement (${data.inp}ms)`,
          description: `INP is ${data.inp}ms, above the "good" threshold of ${rules.performance.inp_good_ms}ms. User interactions are slightly delayed.`,
          fix: "Audit your JavaScript for long tasks using Chrome DevTools Performance panel. Consider lazy loading third-party scripts.",
        })
      }
    }

    // TTFB
    if (data.ttfb != null && data.ttfb > rules.performance.ttfb_poor_ms) {
      issues.push({
        id: "ttfb-slow",
        category: "performance",
        severity: "warning",
        title: `Slow server response time (${Math.round(data.ttfb)}ms TTFB)`,
        description: `Time to First Byte is ${Math.round(data.ttfb)}ms — the server is slow to respond. This delays everything else on the page and is often caused by slow hosting, no caching, or heavy server-side processing.`,
        fix: "Enable server-side caching, use a CDN to serve from edge locations closer to users, or upgrade your hosting plan. Investigate slow database queries if using server-rendered pages.",
      })
    }

    // FCP
    if (data.fcp != null && data.fcp > rules.performance.fcp_poor_ms) {
      issues.push({
        id: "fcp-slow",
        category: "performance",
        severity: "warning",
        title: `Slow First Contentful Paint (${(data.fcp / 1000).toFixed(1)}s)`,
        description: `FCP measures when the first content appears on screen. At ${(data.fcp / 1000).toFixed(1)}s, users are staring at a blank page for too long — this dramatically increases bounce rate.`,
        fix: "Eliminate render-blocking CSS and JS in <head>, inline critical CSS, and preload key fonts.",
      })
    }

    // Overall score summary — kept as a high-level overview issue.
    if (data.score != null && data.score < 90) {
      const severity = data.score < 50 ? "critical" : "info"
      const id = data.score < 50 ? "low-performance-score" : "medium-performance-score"
      const title = data.score < 50
        ? `Low PageSpeed score (${data.score}/100 on mobile)`
        : `PageSpeed score could be higher (${data.score}/100 on mobile)`
      const description = data.score < 50
        ? `Google's PageSpeed Insights gives this page a score of ${data.score}/100 on mobile. Scores below 50 are "poor" and significantly hurt rankings.`
        : `Mobile PageSpeed score is ${data.score}/100. Google considers 90+ as "good". See the individual PageSpeed suggestions below for specific improvements.`

      issues.push({
        id,
        category: "performance",
        severity,
        title,
        description,
        fix: `Focus on the individual suggestions flagged below. The biggest wins are listed first.`,
      })
    }

    // Emit each PageSpeed opportunity as its own trackable suggestion.
    const opportunities = extractOpportunities(audits)
    for (const op of opportunities) {
      let savings = op.displayValue
      if (!savings) {
        const parts: string[] = []
        if (op.savingsMs > 0) parts.push(`${(op.savingsMs / 1000).toFixed(1)}s`)
        if (op.savingsBytes > 0) parts.push(`${Math.round(op.savingsBytes / 1024)} KiB`)
        if (parts.length > 0) savings = `Est savings ${parts.join(" · ")}`
      }
      const cleanedDesc = op.description.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      const shortDesc = cleanedDesc.length > 200 ? `${cleanedDesc.slice(0, 197)}…` : cleanedDesc

      const highImpactAudits = new Set([
        "render-blocking-resources", "render-blocking-insight",
        "unused-javascript", "total-byte-weight",
      ])
      const isHighImpact = highImpactAudits.has(op.id) || op.savingsMs >= 500

      const fix = getPsiFix(op.id, url, op.description, op.items)
      const itemLines = formatPsiItems(op.items, op.id)

      issues.push({
        id: `psi-${op.id}`,
        category: "performance",
        severity: isHighImpact ? "warning" : "info",
        type: "suggestion",
        title: `${op.title}${savings ? ` — ${savings}` : ""}`,
        description: shortDesc,
        fix,
        element: itemLines ?? undefined,
      })
    }
  } catch (err) {
    // PSI is best-effort — don't fail the whole scan if it times out
    console.warn("PageSpeed Insights check failed:", err)
  }

  return { issues, data }
}
