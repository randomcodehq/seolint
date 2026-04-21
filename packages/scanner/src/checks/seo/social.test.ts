import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { checkOpenGraph, checkTwitterCard } from "./social"
import type { RawIssue } from "../../index"

describe("checkOpenGraph", () => {
  it("flags all missing OG tags", () => {
    const issues: RawIssue[] = []
    checkOpenGraph(cheerio.load("<html><head></head></html>"), issues)
    expect(issues[0].id).toBe("missing-og-tags")
    expect(issues[0].title).toContain("og:title")
    expect(issues[0].title).toContain("og:description")
    expect(issues[0].title).toContain("og:image")
    expect(issues[0].element).toContain("og:title: (missing)")
    expect(issues[0].element).toContain("og:description: (missing)")
    expect(issues[0].element).toContain("og:image: (missing)")
  })

  it("only flags missing tags — includes present ones in element", () => {
    const issues: RawIssue[] = []
    checkOpenGraph(
      cheerio.load(`
        <meta property="og:title" content="My Site">
        <meta property="og:description" content="A great site">
      `),
      issues,
    )
    expect(issues[0].id).toBe("missing-og-tags")
    expect(issues[0].title).not.toContain("og:title")
    expect(issues[0].title).toContain("og:image")
    expect(issues[0].element).toContain(`og:title="My Site"`)
    expect(issues[0].element).toContain("og:image: (missing)")
  })

  it("passes when all OG tags present", () => {
    const issues: RawIssue[] = []
    checkOpenGraph(
      cheerio.load(`
        <meta property="og:title" content="Title">
        <meta property="og:description" content="Desc">
        <meta property="og:image" content="https://example.com/og.png">
      `),
      issues,
    )
    expect(issues).toHaveLength(0)
  })
})

describe("checkTwitterCard", () => {
  it("flags missing twitter:card", () => {
    const issues: RawIssue[] = []
    checkTwitterCard(cheerio.load("<html></html>"), issues)
    expect(issues[0].id).toBe("missing-twitter-card")
  })

  it("passes when twitter:card exists", () => {
    const issues: RawIssue[] = []
    checkTwitterCard(
      cheerio.load(`<meta name="twitter:card" content="summary_large_image">`),
      issues,
    )
    expect(issues).toHaveLength(0)
  })
})
