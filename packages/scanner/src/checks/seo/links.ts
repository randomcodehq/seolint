import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"
import rules from "../../rules.json"

const GENERIC_ANCHOR_TEXT = new Set(["click here", "read more", "here", "learn more", "more"])

export function checkLinks($: CheerioAPI, url: string, issues: RawIssue[]) {
  let internalCount = 0
  let genericTextCount = 0

  try {
    const base = new URL(url)

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? ""
      const text = $(el).text().trim().toLowerCase()

      if (GENERIC_ANCHOR_TEXT.has(text)) genericTextCount++

      try {
        if (new URL(href, base).hostname === base.hostname) internalCount++
      } catch {
        if (href.startsWith("/") || (!href.startsWith("http") && !href.startsWith("mailto:"))) {
          internalCount++
        }
      }
    })
  } catch { /* URL parse failed */ }

  if (internalCount < rules.seo.min_internal_links) {
    issues.push({
      id: "no-internal-links",
      category: "seo",
      severity: "warning",
      title: "No internal links found",
      description: "No links to other pages on this site were found. Internal links help search engines discover and crawl your content and distribute ranking authority.",
      fix: "Add at least 2–3 links to related pages on your site using descriptive anchor text.",
    })
  }

  if (genericTextCount > 0) {
    const genericExamples: string[] = []
    $("a[href]").each((_, el) => {
      const text = $(el).text().trim().toLowerCase()
      if (GENERIC_ANCHOR_TEXT.has(text)) {
        const href = $(el).attr("href") ?? ""
        genericExamples.push(`<a href="${href.slice(0, 60)}">${$(el).text().trim()}</a>`)
      }
    })
    issues.push({
      id: "generic-link-text",
      category: "seo",
      severity: "info",
      type: "suggestion",
      title: `${genericTextCount} link${genericTextCount > 1 ? "s" : ""} use generic anchor text`,
      description: `Found ${genericTextCount} link${genericTextCount > 1 ? "s" : ""} with text like "click here" or "read more". Generic anchor text provides no SEO signal and is inaccessible to screen reader users.`,
      fix: 'Replace generic text with descriptive phrases — instead of "click here", use "View our pricing plans".',
      element: genericExamples.slice(0, 5).join("\n"),
    })
  }
}

export function checkUrlLength(url: string, issues: RawIssue[]) {
  try {
    const { pathname, search } = new URL(url)
    if ((pathname + search).length > rules.seo.max_url_length) {
      issues.push({
        id: "url-too-long",
        category: "seo",
        severity: "info",
        type: "suggestion",
        title: "URL is too long",
        description: `The URL path is ${(pathname + search).length} characters. Long URLs are harder to share and may get truncated in search results.`,
        fix: "Shorten the URL. Remove stop words, use hyphens instead of underscores, and avoid unnecessary parameters.",
      })
    }
  } catch { /* skip */ }
}
