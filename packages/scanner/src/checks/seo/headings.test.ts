import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { checkH1, checkHeadingHierarchy } from "./headings"
import type { RawIssue } from "../../index"

describe("checkH1", () => {
  it("flags missing H1", () => {
    const issues: RawIssue[] = []
    checkH1(cheerio.load("<html><body><h2>Subtitle</h2></body></html>"), issues)
    expect(issues[0].id).toBe("missing-h1")
    expect(issues[0].element).toBeUndefined()
  })

  it("flags multiple H1s and includes element with each heading", () => {
    const issues: RawIssue[] = []
    checkH1(cheerio.load("<h1>First heading</h1><h1>Second heading</h1>"), issues)
    expect(issues[0].id).toBe("multiple-h1")
    expect(issues[0].element).toContain("<h1>First heading</h1>")
    expect(issues[0].element).toContain("<h1>Second heading</h1>")
  })

  it("passes a single H1", () => {
    const issues: RawIssue[] = []
    checkH1(cheerio.load("<h1>Only heading</h1>"), issues)
    expect(issues).toHaveLength(0)
  })
})

describe("checkHeadingHierarchy", () => {
  it("flags H1 → H3 skip", () => {
    const issues: RawIssue[] = []
    checkHeadingHierarchy(cheerio.load("<h1>Title</h1><h3>Skipped level</h3>"), issues)
    expect(issues[0].id).toBe("heading-hierarchy-skip")
    expect(issues[0].element).toBe("<h3>Skipped level</h3>")
  })

  it("flags H2 → H4 skip", () => {
    const issues: RawIssue[] = []
    checkHeadingHierarchy(cheerio.load("<h1>Title</h1><h2>Section</h2><h4>Deep</h4>"), issues)
    expect(issues[0].id).toBe("heading-hierarchy-skip")
    expect(issues[0].element).toBe("<h4>Deep</h4>")
  })

  it("passes correct hierarchy", () => {
    const issues: RawIssue[] = []
    checkHeadingHierarchy(cheerio.load("<h1>Title</h1><h2>Section</h2><h3>Sub</h3>"), issues)
    expect(issues).toHaveLength(0)
  })

  it("reports only the first skip", () => {
    const issues: RawIssue[] = []
    checkHeadingHierarchy(cheerio.load("<h1>T</h1><h3>Skip 1</h3><h5>Skip 2</h5>"), issues)
    expect(issues).toHaveLength(1)
  })
})
