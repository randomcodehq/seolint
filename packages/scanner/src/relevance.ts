/**
 * Relevance weights (1–10) per issue ID.
 * Used to rank issues within the same severity tier — higher = shown first.
 * Update this when you know certain issues have more/less real-world impact.
 */
export const ISSUE_WEIGHTS: Record<string, number> = {
  // Critical tier
  "not-https":             10,
  "noindex":               10,
  "missing-viewport":       9,
  "missing-title":          9,
  "missing-description":    8,
  "missing-h1":             8,
  "lcp-poor":               8,
  "inp-poor":               7,
  "cls-poor":               7,
  "low-performance-score":  6,

  // Warning tier
  "render-blocking-scripts":  9,
  "images-missing-alt":       8,
  "images-missing-dimensions":8,
  "missing-canonical":        8,
  "missing-og-tags":          7,
  "missing-lang":             7,
  "multiple-h1":              6,
  "title-too-long":           6,
  "description-too-long":     6,
  "form-inputs-missing-labels":6,
  "lcp-needs-improvement":    6,
  "no-internal-links":        5,
  "invalid-json-ld":          5,
  "ttfb-slow":                5,
  "fcp-slow":                 5,
  "inp-needs-improvement":    5,
  "cls-needs-improvement":    5,
  "outline-removed":          5,

  // Warning / AEO tier
  "nosnippet":                    7,
  "ai-retrieval-bots-blocked":    8,
  "thin-content-critical":        9,
  "thin-content":                 7,
  "missing-eeat-signals":         7,
  "missing-author-signal":        5,
  "no-question-headings":         4,
  "missing-faq-section":          6,

  // Info tier
  "missing-json-ld":          8,
  "missing-sitemap":          7,
  "missing-llms-txt":         7,
  "missing-skills-md":        6,
  "images-not-modern-format": 7,
  "images-missing-lazy-load": 6,
  "title-too-short":          5,
  "description-too-short":    5,
  "generic-link-text":        5,
  "missing-robots-txt":       5,
  "missing-rss-feed":         4,
  "medium-performance-score": 4,
  "heading-hierarchy-skip":   4,
  "missing-skip-link":        4,
  "missing-twitter-card":     4,
  "missing-favicon":          3,
  "url-too-long":             3,

  // PSI suggestions (psi-* prefix)
  "psi-render-blocking-resources": 8,
  "psi-render-blocking-insight":   8,
  "psi-unused-javascript":         7,
  "psi-total-byte-weight":         7,
  "psi-uses-long-cache-ttl":       6,
  "psi-cache-insight":             6,
  "psi-legacy-javascript":         5,
  "psi-modern-image-formats":      6,
  "psi-uses-optimized-images":     6,
  "psi-image-delivery-insight":    6,
  "psi-offscreen-images":          5,
  "psi-dom-size":                  5,
  "psi-dom-size-insight":          5,
  "psi-third-party-summary":       5,
  "psi-third-parties-insight":     5,
  "psi-long-tasks":                6,
  "psi-mainthread-work-breakdown": 5,
  "psi-bootup-time":               5,
  "psi-non-composited-animations": 4,
  "psi-network-dependency-tree-insight": 4,
  "psi-lcp-breakdown-insight":     5,
  "psi-critical-request-chains":   5,
  "psi-prioritize-lcp-image":      7,
  "psi-lcp-lazy-loaded":           7,
  "psi-server-response-time":      6,
  "psi-unused-css-rules":          5,
  "psi-uses-text-compression":     5,
  "psi-uses-responsive-images":    5,
  "psi-uses-rel-preconnect":       4,
  "psi-font-display":              4,
  "psi-duplicated-javascript":     5,
}

export const DEFAULT_WEIGHT = 5

export function getWeight(issueId: string): number {
  return ISSUE_WEIGHTS[issueId] ?? DEFAULT_WEIGHT
}
