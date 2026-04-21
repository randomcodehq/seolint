import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import type { RawIssue } from "../src/index"
import { checkJsonLd } from "../src/checks/seo/structured-data"

function check(head: string): RawIssue[] {
  const $ = cheerio.load(`<html><head>${head}</head><body></body></html>`)
  const issues: RawIssue[] = []
  checkJsonLd($, issues)
  return issues
}

function ids(issues: RawIssue[]) {
  return issues.map(i => i.id)
}

describe("structured data checks", () => {
  it("flags missing JSON-LD", () => {
    expect(ids(check(""))).toContain("missing-json-ld")
  })

  it("flags invalid JSON", () => {
    expect(ids(check('<script type="application/ld+json">{bad json</script>'))).toContain("invalid-json-ld")
  })

  it("passes valid minimal JSON-LD", () => {
    const schema = JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage" })
    const issues = check(`<script type="application/ld+json">${schema}</script>`)
    expect(ids(issues)).not.toContain("missing-json-ld")
    expect(ids(issues)).not.toContain("invalid-json-ld")
  })

  it("flags incomplete BlogPosting", () => {
    const schema = JSON.stringify({ "@context": "https://schema.org", "@type": "BlogPosting", headline: "Test" })
    expect(ids(check(`<script type="application/ld+json">${schema}</script>`))).toContain("incomplete-json-ld")
  })

  it("passes complete BlogPosting", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: "Test",
      author: { "@type": "Person", name: "Author" },
      datePublished: "2026-01-01",
    })
    expect(ids(check(`<script type="application/ld+json">${schema}</script>`))).not.toContain("incomplete-json-ld")
  })

  it("flags incomplete FAQPage", () => {
    const schema = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage" })
    expect(ids(check(`<script type="application/ld+json">${schema}</script>`))).toContain("incomplete-json-ld")
  })

  it("flags incomplete Product", () => {
    const schema = JSON.stringify({ "@context": "https://schema.org", "@type": "Product" })
    const issues = check(`<script type="application/ld+json">${schema}</script>`)
    expect(ids(issues)).toContain("incomplete-json-ld")
    const issue = issues.find(i => i.id === "incomplete-json-ld")!
    expect(issue.description).toContain("name")
    expect(issue.description).toContain("offers")
  })

  it("ignores unknown schema types", () => {
    const schema = JSON.stringify({ "@context": "https://schema.org", "@type": "CreativeWork" })
    expect(ids(check(`<script type="application/ld+json">${schema}</script>`))).not.toContain("incomplete-json-ld")
  })
})
