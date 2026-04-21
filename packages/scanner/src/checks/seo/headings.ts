import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"

export function checkH1($: CheerioAPI, issues: RawIssue[]) {
  const h1s = $("h1")

  if (h1s.length === 0) {
    issues.push({
      id: "missing-h1",
      category: "seo",
      severity: "critical",
      title: "No H1 heading",
      description: "The page has no H1 heading. H1 is the strongest on-page SEO signal after the title tag and tells search engines what the page is about.",
      fix: "Add exactly one H1 heading that contains the primary keyword for this page.",
    })
  } else if (h1s.length > 1) {
    const h1Texts = h1s.toArray().map((el) => `<h1>${$(el).text().trim().slice(0, 80)}</h1>`).join("\n")
    issues.push({
      id: "multiple-h1",
      category: "seo",
      severity: "warning",
      title: `Multiple H1 headings (${h1s.length} found)`,
      description: `Found ${h1s.length} H1 headings. Only one H1 per page is recommended — multiple H1s dilute the ranking signal and confuse search engines about the page topic.`,
      fix: "Keep only one H1. Convert the others to H2 or H3 headings.",
      element: h1Texts,
    })
  }
}

export function checkHeadingHierarchy($: CheerioAPI, issues: RawIssue[]) {
  const headings = $("h1, h2, h3, h4, h5, h6").toArray()
  let prevLevel = 0

  for (const el of headings) {
    const level = parseInt(el.tagName[1], 10)
    if (prevLevel > 0 && level > prevLevel + 1) {
      const text = $(el).text().trim().slice(0, 100)
      issues.push({
        id: "heading-hierarchy-skip",
        category: "seo",
        severity: "info",
        title: "Heading hierarchy skips a level",
        description: `Found an H${level} directly after an H${prevLevel}. Skipping heading levels confuses screen readers and may weaken page structure signals for search engines.`,
        fix: `Change the H${level} to H${prevLevel + 1}, or add an intermediate H${prevLevel + 1} heading before it.`,
        element: `<h${level}>${text}</h${level}>`,
      })
      break // one report is enough
    }
    prevLevel = level
  }
}
