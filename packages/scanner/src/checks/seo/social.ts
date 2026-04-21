import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"

export function checkOpenGraph($: CheerioAPI, issues: RawIssue[]) {
  const missing: string[] = []
  const present: string[] = []

  const ogTitle = $('meta[property="og:title"]').attr("content")
  const ogDesc = $('meta[property="og:description"]').attr("content")
  const ogImage = $('meta[property="og:image"]').attr("content")

  if (!ogTitle) missing.push("og:title"); else present.push(`og:title="${ogTitle.slice(0, 60)}"`)
  if (!ogDesc) missing.push("og:description"); else present.push(`og:description="${ogDesc.slice(0, 60)}"`)
  if (!ogImage) missing.push("og:image"); else present.push(`og:image="${ogImage.slice(0, 80)}"`)

  if (missing.length > 0) {
    issues.push({
      id: "missing-og-tags",
      category: "seo",
      severity: "warning",
      title: `Missing Open Graph tags: ${missing.join(", ")}`,
      description: "Open Graph tags control how your page looks when shared on social media (LinkedIn, Facebook, Slack). Missing tags result in poor-looking previews that get fewer clicks.",
      fix: `Add the missing tags in <head>:\n${missing.map(t => `<meta property="${t}" content="...">`).join("\n")}\nFor og:image, use a 1200×630px image.`,
      element: [
        ...present,
        ...missing.map(t => `${t}: (missing)`),
      ].join("\n"),
    })
  }
}

export function checkTwitterCard($: CheerioAPI, issues: RawIssue[]) {
  if (!$('meta[name="twitter:card"]').attr("content")) {
    issues.push({
      id: "missing-twitter-card",
      category: "seo",
      severity: "info",
      type: "suggestion",
      title: "Missing Twitter/X card tag",
      description: "No twitter:card meta tag found. Without it, links shared on X show as plain text instead of a rich preview card.",
      fix: 'Add <meta name="twitter:card" content="summary_large_image"> in <head>.',
    })
  }
}
