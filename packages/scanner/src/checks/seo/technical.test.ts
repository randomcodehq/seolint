import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { checkHttps, checkCanonical, checkRobotsMeta, checkViewport, checkLang } from "./technical"
import type { RawIssue } from "../../index"

describe("checkHttps", () => {
  it("flags http URLs", () => {
    const issues: RawIssue[] = []
    checkHttps("http://example.com", issues)
    expect(issues[0].id).toBe("not-https")
    expect(issues[0].element).toBe("http://example.com")
  })

  it("passes https URLs", () => {
    const issues: RawIssue[] = []
    checkHttps("https://example.com", issues)
    expect(issues).toHaveLength(0)
  })
})

describe("checkCanonical", () => {
  it("flags missing canonical", () => {
    const issues: RawIssue[] = []
    checkCanonical(cheerio.load("<html><head></head></html>"), "https://example.com", issues)
    expect(issues[0].id).toBe("missing-canonical")
  })

  it("passes when canonical exists", () => {
    const issues: RawIssue[] = []
    checkCanonical(
      cheerio.load(`<link rel="canonical" href="https://example.com">`),
      "https://example.com",
      issues,
    )
    expect(issues).toHaveLength(0)
  })
})

describe("checkRobotsMeta", () => {
  it("flags noindex and includes element", () => {
    const issues: RawIssue[] = []
    checkRobotsMeta(cheerio.load(`<meta name="robots" content="noindex, follow">`), issues)
    const noindex = issues.find((i) => i.id === "noindex")
    expect(noindex).toBeDefined()
    expect(noindex!.element).toBe(`<meta name="robots" content="noindex, follow">`)
  })

  it("flags nosnippet and includes element", () => {
    const issues: RawIssue[] = []
    checkRobotsMeta(cheerio.load(`<meta name="robots" content="nosnippet">`), issues)
    const nosnippet = issues.find((i) => i.id === "nosnippet")
    expect(nosnippet).toBeDefined()
    expect(nosnippet!.element).toBe(`<meta name="robots" content="nosnippet">`)
  })

  it("flags both noindex and nosnippet", () => {
    const issues: RawIssue[] = []
    checkRobotsMeta(cheerio.load(`<meta name="robots" content="noindex, nosnippet">`), issues)
    expect(issues.map((i) => i.id)).toContain("noindex")
    expect(issues.map((i) => i.id)).toContain("nosnippet")
  })

  it("passes clean robots tag", () => {
    const issues: RawIssue[] = []
    checkRobotsMeta(cheerio.load(`<meta name="robots" content="index, follow">`), issues)
    expect(issues).toHaveLength(0)
  })

  it("passes when no robots tag", () => {
    const issues: RawIssue[] = []
    checkRobotsMeta(cheerio.load("<html></html>"), issues)
    expect(issues).toHaveLength(0)
  })
})

describe("checkViewport", () => {
  it("flags missing viewport", () => {
    const issues: RawIssue[] = []
    checkViewport(cheerio.load("<html><head></head></html>"), issues)
    expect(issues[0].id).toBe("missing-viewport")
  })

  it("passes when viewport exists", () => {
    const issues: RawIssue[] = []
    checkViewport(cheerio.load(`<meta name="viewport" content="width=device-width, initial-scale=1">`), issues)
    expect(issues).toHaveLength(0)
  })
})

describe("checkLang", () => {
  it("flags missing lang attribute", () => {
    const issues: RawIssue[] = []
    checkLang(cheerio.load("<html><body></body></html>"), issues)
    expect(issues[0].id).toBe("missing-lang")
    expect(issues[0].element).toContain("<html>")
  })

  it("passes when lang is set", () => {
    const issues: RawIssue[] = []
    checkLang(cheerio.load(`<html lang="en"><body></body></html>`), issues)
    expect(issues).toHaveLength(0)
  })
})
