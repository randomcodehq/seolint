import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"
import rules from "../../rules.json"

export function checkTitle($: CheerioAPI, issues: RawIssue[]) {
  const title = $("title").text().trim()

  if (!title) {
    issues.push({
      id: "missing-title",
      category: "seo",
      severity: "critical",
      title: "Missing page title",
      description: "The page has no <title> tag. Search engines use the title as the primary ranking signal and display it in search results.",
      fix: `Add a <title> tag between 30–60 characters that includes your primary keyword near the front.`,
    })
    return
  }

  if (title.length > rules.seo.title_max_chars) {
    issues.push({
      id: "title-too-long",
      category: "seo",
      severity: "warning",
      title: "Page title too long",
      description: `Your title is ${title.length} characters. Google truncates titles above ${rules.seo.title_max_chars} characters in search results, hiding the end of your message.`,
      fix: `Shorten the title to under ${rules.seo.title_max_chars} characters. Current title: "${title}"`,
      element: `<title>${title}</title>`,
    })
  } else if (title.length < rules.seo.title_min_chars) {
    issues.push({
      id: "title-too-short",
      category: "seo",
      severity: "info",
      type: "suggestion",
      title: "Page title is very short",
      description: `Your title is only ${title.length} characters. Short titles miss the opportunity to include keywords and context.`,
      fix: `Expand the title to 30–${rules.seo.title_max_chars} characters with your primary keyword included.`,
      element: `<title>${title}</title>`,
    })
  }
}

export function checkDescription($: CheerioAPI, issues: RawIssue[]) {
  const desc = $('meta[name="description"]').attr("content")?.trim()

  if (!desc) {
    issues.push({
      id: "missing-description",
      category: "seo",
      severity: "critical",
      title: "Missing meta description",
      description: "No meta description found. This is the text shown below your title in search results — it directly affects click-through rate.",
      fix: `Add <meta name="description" content="..."> between ${rules.seo.description_min_chars}–${rules.seo.description_max_chars} characters. Write it like ad copy: lead with the benefit, include the primary keyword.`,
    })
    return
  }

  if (desc.length > rules.seo.description_max_chars) {
    issues.push({
      id: "description-too-long",
      category: "seo",
      severity: "warning",
      title: "Meta description too long",
      description: `Your description is ${desc.length} characters. Google truncates descriptions above ${rules.seo.description_max_chars} characters, cutting off your message.`,
      fix: `Shorten to under ${rules.seo.description_max_chars} characters. Current: "${desc.slice(0, 80)}…"`,
      element: `<meta name="description" content="${desc.slice(0, 200)}${desc.length > 200 ? "…" : ""}">`,
    })
  } else if (desc.length < rules.seo.description_min_chars) {
    issues.push({
      id: "description-too-short",
      category: "seo",
      severity: "info",
      type: "suggestion",
      title: "Meta description is very short",
      description: `Your description is only ${desc.length} characters. Short descriptions waste valuable real estate in search results.`,
      fix: `Expand to ${rules.seo.description_min_chars}–${rules.seo.description_max_chars} characters. Describe what the page offers and include a benefit or call to action.`,
      element: `<meta name="description" content="${desc}">`,
    })
  }
}
