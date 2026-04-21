import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { checkJsonLd } from "./structured-data"
import type { RawIssue } from "../../index"

describe("checkJsonLd", () => {
  it("flags missing JSON-LD", () => {
    const issues: RawIssue[] = []
    checkJsonLd(cheerio.load("<html><head></head></html>"), issues)
    expect(issues[0].id).toBe("missing-json-ld")
  })

  it("flags invalid JSON and includes snippet in element", () => {
    const issues: RawIssue[] = []
    checkJsonLd(
      cheerio.load(`<script type="application/ld+json">{ broken json: true </script>`),
      issues,
    )
    expect(issues[0].id).toBe("invalid-json-ld")
    expect(issues[0].element).toContain("application/ld+json")
    expect(issues[0].element).toContain("broken json")
  })

  it("flags incomplete schema and shows present/missing fields in element", () => {
    const issues: RawIssue[] = []
    const schema = { "@context": "https://schema.org", "@type": "BlogPosting", "headline": "My post" }
    checkJsonLd(
      cheerio.load(`<script type="application/ld+json">${JSON.stringify(schema)}</script>`),
      issues,
    )
    expect(issues[0].id).toBe("incomplete-json-ld")
    expect(issues[0].element).toContain("BlogPosting")
    expect(issues[0].element).toContain("headline")
    expect(issues[0].element).toContain("missing: author, datePublished")
  })

  it("passes valid complete schema", () => {
    const issues: RawIssue[] = []
    const schema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "My post",
      "author": { "@type": "Person", "name": "Daniel" },
      "datePublished": "2026-04-04",
    }
    checkJsonLd(
      cheerio.load(`<script type="application/ld+json">${JSON.stringify(schema)}</script>`),
      issues,
    )
    expect(issues).toHaveLength(0)
  })

  it("passes unknown schema types without flagging", () => {
    const issues: RawIssue[] = []
    const schema = { "@context": "https://schema.org", "@type": "UnknownType", "name": "Test" }
    checkJsonLd(
      cheerio.load(`<script type="application/ld+json">${JSON.stringify(schema)}</script>`),
      issues,
    )
    expect(issues).toHaveLength(0)
  })
})
