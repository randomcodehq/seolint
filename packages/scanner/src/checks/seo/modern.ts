import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"

// Flags a page that ships rich-result schema AND has a noindex directive.
// Classic staging-to-prod bug: the noindex gets left on, but the schema
// still deploys. Google can't show rich results for a page it can't index.
export function checkSchemaNoindexConflict($: CheerioAPI, issues: RawIssue[]) {
  const hasJsonLd = $('script[type="application/ld+json"]').length > 0
  if (!hasJsonLd) return

  const robots = $('meta[name="robots"]').attr("content")?.toLowerCase() ?? ""
  const hasNoindex = /\bnoindex\b/.test(robots)
  if (!hasNoindex) return

  issues.push({
    id: "schema-noindex-conflict",
    category: "seo",
    severity: "warning",
    title: "Schema markup on a noindex page",
    description:
      "This page has JSON-LD structured data but is also marked noindex. Google won't show rich results for a page it isn't indexing, so the schema is shipped but unused. This pattern usually means a staging noindex was left on when the page went live.",
    fix: "Decide whether the page should be indexed. If yes, remove the noindex from <meta name=\"robots\">. If no, remove the JSON-LD block since it has no effect.",
    element: `<meta name="robots" content="${robots}">`,
  })
}

// Flags images that sit above the fold but have loading="lazy". Lazy-loading
// the LCP image delays the Largest Contentful Paint and tanks Core Web Vitals.
// Heuristic: the first <img> in document order is almost always above the fold,
// and any <img> inside <header>/<nav>/the first <section> is too.
export function checkLazyLoadingAboveFold($: CheerioAPI, issues: RawIssue[]) {
  const allImgs = $("img").toArray()
  if (allImgs.length === 0) return

  const aboveFoldImgs = new Set<typeof allImgs[number]>()

  // Always include the first image in the DOM.
  aboveFoldImgs.add(allImgs[0])

  // Include all images inside likely above-fold containers.
  $("header img, nav img, section:first-of-type img, main > :first-child img, [class*='hero'] img, [class*='banner'] img").each((_, el) => {
    aboveFoldImgs.add(el)
  })

  for (const el of aboveFoldImgs) {
    const $el = $(el)
    const loading = $el.attr("loading")?.toLowerCase()
    if (loading !== "lazy") continue

    const src = $el.attr("src") ?? $el.attr("data-src") ?? "(no src)"
    issues.push({
      id: "lazy-loading-above-fold",
      category: "seo",
      severity: "warning",
      title: "Lazy loading on an above-the-fold image",
      description:
        "An image that is likely visible on first paint has loading=\"lazy\". The browser defers loading until it enters the viewport, which delays your Largest Contentful Paint (LCP) and hurts Core Web Vitals.",
      fix: "Remove loading=\"lazy\" from images in the hero, header, or first screen. Use loading=\"eager\" for the LCP image and add fetchpriority=\"high\" for extra boost. Keep lazy loading only for images below the fold.",
      element: `<img src="${src}" loading="lazy">`,
    })
  }
}

// Scans inline HTML and inline scripts for tokens that look like leaked
// secrets. Catches the classic vibe-coding mistake of pasting API keys
// into frontend code. Only flags patterns with very low false-positive rates.
const SECRET_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "OpenAI API key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { label: "Anthropic API key", regex: /\bsk-ant-(?:api|admin)[0-9]{2}-[A-Za-z0-9_-]{20,}/ },
  { label: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "GitHub personal access token", regex: /\bghp_[A-Za-z0-9]{36}\b/ },
  { label: "GitHub OAuth token", regex: /\bgho_[A-Za-z0-9]{36}\b/ },
  { label: "Stripe secret key", regex: /\bsk_live_[A-Za-z0-9]{24,}/ },
  { label: "Stripe restricted key", regex: /\brk_live_[A-Za-z0-9]{24,}/ },
  { label: "SendGrid API key", regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { label: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { label: "Supabase service_role JWT", regex: /\beyJ[A-Za-z0-9_-]+?\.eyJ[A-Za-z0-9_-]+?role["'\s:]+["']?service_role/ },
  { label: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: "Private key block", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
]

export function checkLeakedSecrets($: CheerioAPI, issues: RawIssue[]) {
  const html = $.html()

  const seen = new Set<string>()
  for (const { label, regex } of SECRET_PATTERNS) {
    const match = html.match(regex)
    if (!match) continue
    if (seen.has(label)) continue
    seen.add(label)

    const masked = match[0].length > 14
      ? `${match[0].slice(0, 8)}…${match[0].slice(-4)}`
      : "[redacted]"

    issues.push({
      id: "leaked-secret",
      category: "seo",
      severity: "critical",
      title: `Possible leaked secret in page source: ${label}`,
      description:
        `A token matching the shape of a ${label} was found in the page HTML or inline JavaScript. Anything rendered in the browser is public. If this is a real secret, rotate it immediately and move it server-side.`,
      fix: `Rotate the ${label} now. Move the key to a server-side environment variable and call it from an API route, not the client. Never prefix secrets with NEXT_PUBLIC_ / VITE_ / PUBLIC_ — those are shipped to the browser by design.`,
      element: `…${masked}…`,
    })
  }
}
