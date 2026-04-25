import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { checkTitle, checkDescription } from "./meta"
import type { RawIssue } from "../../index"

function load(html: string) {
  return cheerio.load(html)
}

describe("checkTitle", () => {
  it("flags missing title", () => {
    const issues: RawIssue[] = []
    checkTitle(load("<html><head></head></html>"), issues)
    expect(issues).toHaveLength(1)
    expect(issues[0].id).toBe("missing-title")
    expect(issues[0].element).toBeUndefined()
  })

  it("flags title too long", () => {
    const longTitle = "A".repeat(105)
    const issues: RawIssue[] = []
    checkTitle(load(`<title>${longTitle}</title>`), issues)
    expect(issues[0].id).toBe("title-too-long")
    expect(issues[0].element).toBe(`<title>${longTitle}</title>`)
  })

  it("flags title too short", () => {
    const issues: RawIssue[] = []
    checkTitle(load("<title>Hi</title>"), issues)
    expect(issues[0].id).toBe("title-too-short")
    expect(issues[0].element).toBe("<title>Hi</title>")
  })

  it("passes a good title", () => {
    const issues: RawIssue[] = []
    checkTitle(load("<title>SEO Audit Tool for Developers — SEOLint</title>"), issues)
    expect(issues).toHaveLength(0)
  })
})

describe("checkDescription", () => {
  it("flags missing description", () => {
    const issues: RawIssue[] = []
    checkDescription(load("<html><head></head></html>"), issues)
    expect(issues[0].id).toBe("missing-description")
    expect(issues[0].element).toBeUndefined()
  })

  it("flags description too long and includes element", () => {
    const longDesc = "A".repeat(205)
    const issues: RawIssue[] = []
    checkDescription(load(`<meta name="description" content="${longDesc}">`), issues)
    expect(issues[0].id).toBe("description-too-long")
    expect(issues[0].element).toContain(`<meta name="description"`)
    expect(issues[0].element).toContain(longDesc.slice(0, 200))
  })

  it("flags description too short and includes element", () => {
    const issues: RawIssue[] = []
    checkDescription(load(`<meta name="description" content="Too short">`), issues)
    expect(issues[0].id).toBe("description-too-short")
    expect(issues[0].element).toBe(`<meta name="description" content="Too short">`)
  })

  it("passes a good description", () => {
    const issues: RawIssue[] = []
    const desc = "SEOLint scans your site, remembers every issue, and tells Claude exactly what to fix next."
    checkDescription(load(`<meta name="description" content="${desc}">`), issues)
    expect(issues).toHaveLength(0)
  })
})
