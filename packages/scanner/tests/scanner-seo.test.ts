import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { checkSeo } from "../src/checks/seo/index"

function html(body: string, head = ""): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${body}</body></html>`
}

function scan(htmlStr: string, url = "https://example.com") {
  const $ = cheerio.load(htmlStr)
  return checkSeo($, url)
}

function ids(issues: { id: string }[]) {
  return issues.map(i => i.id)
}

describe("SEO checks", () => {
  it("flags missing title", () => {
    const issues = scan(html("<h1>Hello</h1>"))
    expect(ids(issues)).toContain("missing-title")
  })

  it("passes with valid title", () => {
    const issues = scan(html("<h1>Hello</h1>", "<title>My Page Title</title>"))
    expect(ids(issues)).not.toContain("missing-title")
  })

  it("flags title too long", () => {
    const longTitle = "A".repeat(70)
    const issues = scan(html("<h1>Hello</h1>", `<title>${longTitle}</title>`))
    expect(ids(issues)).toContain("title-too-long")
  })

  it("flags missing meta description", () => {
    const issues = scan(html("<h1>Hello</h1>", "<title>My Page</title>"))
    expect(ids(issues)).toContain("missing-description")
  })

  it("passes with valid meta description", () => {
    const issues = scan(html("<h1>Hello</h1>", '<title>My Page</title><meta name="description" content="A short description of the page.">'))
    expect(ids(issues)).not.toContain("missing-description")
  })

  it("flags missing H1", () => {
    const issues = scan(html("<p>No heading</p>", "<title>Page</title>"))
    expect(ids(issues)).toContain("missing-h1")
  })

  it("flags multiple H1s", () => {
    const issues = scan(html("<h1>First</h1><h1>Second</h1>", "<title>Page</title>"))
    expect(ids(issues)).toContain("multiple-h1")
  })

  it("flags missing canonical", () => {
    const issues = scan(html("<h1>Hello</h1>", "<title>Page</title>"))
    expect(ids(issues)).toContain("missing-canonical")
  })

  it("passes with canonical", () => {
    const issues = scan(html("<h1>Hello</h1>", '<title>Page</title><link rel="canonical" href="https://example.com">'))
    expect(ids(issues)).not.toContain("missing-canonical")
  })

  it("flags missing Open Graph tags", () => {
    const issues = scan(html("<h1>Hello</h1>", "<title>Page</title>"))
    expect(ids(issues)).toContain("missing-og-tags")
  })

  it("flags missing JSON-LD", () => {
    const issues = scan(html("<h1>Hello</h1>", "<title>Page</title>"))
    expect(ids(issues)).toContain("missing-json-ld")
  })

  it("flags incomplete JSON-LD for SoftwareApplication", () => {
    const schema = JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", "name": "Test" })
    const issues = scan(html("<h1>Hello</h1>", `<title>Page</title><script type="application/ld+json">${schema}</script>`))
    expect(ids(issues)).toContain("incomplete-json-ld")
  })

  it("passes complete JSON-LD for SoftwareApplication", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Test",
      url: "https://example.com",
      author: { "@type": "Organization", name: "Test" },
      offers: { "@type": "Offer", price: "0" },
    })
    const issues = scan(html("<h1>Hello</h1>", `<title>Page</title><script type="application/ld+json">${schema}</script>`))
    expect(ids(issues)).not.toContain("incomplete-json-ld")
  })

  it("flags images without alt text", () => {
    const issues = scan(html('<h1>Hello</h1><img src="photo.jpg">', "<title>Page</title>"))
    expect(ids(issues)).toContain("images-missing-alt")
  })

  it("flags missing lang attribute", () => {
    const $ = cheerio.load('<!DOCTYPE html><html><head><title>Page</title></head><body><h1>Hi</h1></body></html>')
    const issues = checkSeo($, "https://example.com")
    expect(ids(issues)).toContain("missing-lang")
  })
})
