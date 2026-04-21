import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"

export function checkJsonLd($: CheerioAPI, issues: RawIssue[]) {
  const scripts = $('script[type="application/ld+json"]')

  if (scripts.length === 0) {
    issues.push({
      id: "missing-json-ld",
      category: "seo",
      severity: "info",
      type: "suggestion",
      title: "No structured data (JSON-LD)",
      description: "No JSON-LD structured data found. Structured data helps search engines and AI systems understand your content and unlocks rich results (star ratings, FAQs, breadcrumbs) in SERPs.",
      fix: "Add JSON-LD appropriate for this page type: SoftwareApplication or Organization for a homepage, BlogPosting for articles, FAQPage for FAQ sections, Product for e-commerce.",
    })
    return
  }

  let hasParseError = false
  let badSnippet = ""
  const parsed: Record<string, unknown>[] = []

  scripts.each((_, el) => {
    const raw = $(el).html() ?? ""
    try {
      const data = JSON.parse(raw)
      if (data && typeof data === "object") parsed.push(data)
    } catch {
      hasParseError = true
      if (!badSnippet) badSnippet = raw.trim().slice(0, 200)
    }
  })

  if (hasParseError) {
    issues.push({
      id: "invalid-json-ld",
      category: "seo",
      severity: "warning",
      title: "Structured data (JSON-LD) contains invalid JSON",
      description: "A JSON-LD script tag was found but contains malformed JSON. Google and AI crawlers cannot parse it and will ignore it entirely.",
      fix: "Validate your JSON-LD at https://search.google.com/test/rich-results and fix the syntax errors.",
      element: badSnippet ? `<script type="application/ld+json">\n${badSnippet}${badSnippet.length === 200 ? "…" : ""}\n</script>` : undefined,
    })
  }

  // Check for missing required fields on common schema types
  const REQUIRED_FIELDS: Record<string, string[]> = {
    SoftwareApplication: ["name", "url", "offers", "author"],
    Organization: ["name", "url"],
    WebSite: ["name", "url"],
    Product: ["name", "offers"],
    BlogPosting: ["headline", "author", "datePublished"],
    Article: ["headline", "author", "datePublished"],
    FAQPage: ["mainEntity"],
    LocalBusiness: ["name", "address"],
  }

  for (const data of parsed) {
    const type = (data["@type"] as string) ?? ""
    const required = REQUIRED_FIELDS[type]
    if (!required) continue

    const missing = required.filter(f => !data[f])
    if (missing.length > 0) {
      // Show the existing fields so Claude knows what's already there
      const presentFields = Object.keys(data).filter(k => k !== "@context").join(", ")
      issues.push({
        id: "incomplete-json-ld",
        category: "seo",
        severity: "warning",
        title: `Structured data (${type}) is missing required fields`,
        description: `The ${type} schema is missing: ${missing.join(", ")}. Incomplete structured data may be ignored by Google and won't qualify for rich results.`,
        fix: `Add the missing fields (${missing.join(", ")}) to your ${type} JSON-LD. Validate at https://search.google.com/test/rich-results.`,
        element: `@type: ${type} · present: ${presentFields} · missing: ${missing.join(", ")}`,
      })
    }
  }
}
