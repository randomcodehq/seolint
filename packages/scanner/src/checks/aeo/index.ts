import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"
import { classifyPage } from "../../classify-page"

export function checkAeo($: CheerioAPI, url?: string): RawIssue[] {
  const issues: RawIssue[] = []
  checkThinContent($, issues)
  checkEeaT($, issues)
  checkQuestionHeadings($, issues)
  checkFaqSuggestion($, url, issues)
  return issues
}

function checkThinContent($: CheerioAPI, issues: RawIssue[]) {
  const bodyClone = $("body").clone()
  bodyClone.find("nav, footer, header, aside, script, style, [aria-hidden='true']").remove()
  const text = bodyClone.text().replace(/\s+/g, " ").trim()
  const wordCount = text.split(" ").filter((w) => w.length > 1).length

  if (wordCount < 150) {
    issues.push({
      id: "thin-content-critical",
      category: "aeo",
      severity: "critical",
      title: `Very thin content — only ~${wordCount} words`,
      description:
        "AI systems (ChatGPT, Perplexity, Google AI Overviews) almost never cite pages with fewer than 150 meaningful words. This page has too little content to be considered authoritative on any topic.",
      fix: "Add at least 300–600 words of substantive content. Explain what the page is about, answer the key questions your visitors have, and provide real value. Even 4–5 well-written paragraphs will dramatically improve AI citation probability.",
    })
    return
  }

  if (wordCount < 300) {
    issues.push({
      id: "thin-content",
      category: "aeo",
      severity: "warning",
      title: `Thin content — only ~${wordCount} words`,
      description:
        "AI systems treat pages under 300 words as thin content — they rarely cite them in generated answers. More substantive pages consistently rank higher in both traditional and AI search.",
      fix: "Expand the page to at least 300–500 meaningful words. Add context, examples, or a short FAQ section. Focus on depth over length — answer the questions your audience is actually asking.",
    })
  }
}

function checkEeaT($: CheerioAPI, issues: RawIssue[]) {
  const hasAuthorMeta = !!$('meta[name="author"]').attr("content")
  const hasArticleAuthor = !!$('meta[property="article:author"]').attr("content")
  const hasAuthorMarkup = $('[rel="author"], [itemprop="author"], .author, [class*="author"]').length > 0
  const hasAuthor = hasAuthorMeta || hasArticleAuthor || hasAuthorMarkup

  const hasTimestamp = $("time[datetime]").length > 0
  const hasPublishedMeta = !!$('meta[property="article:published_time"]').attr("content")
  const hasDate = hasTimestamp || hasPublishedMeta

  if (!hasAuthor && !hasDate) {
    issues.push({
      id: "missing-eeat-signals",
      category: "aeo",
      severity: "warning",
      title: "No E-E-A-T signals found",
      description:
        "Google and AI systems use E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) to decide whether content is worth citing. No author attribution or publication date was found — both are key trust signals.",
      fix: `Add an author byline: <address rel="author">Your Name</address> and a publication date: <time datetime="2026-01-15">January 15, 2026</time>. In Next.js, also add article:author and article:published_time Open Graph meta tags.`,
    })
    return
  }

  if (!hasAuthor) {
    issues.push({
      id: "missing-author-signal",
      category: "aeo",
      severity: "info",
      type: "suggestion",
      title: "No author attribution found",
      description:
        "AI systems evaluate authoritativeness through author attribution. No author name or byline was detected on this page.",
      fix: `Add an author byline: <address rel="author">Your Name</address> or a visible byline section. Also add <meta name="author" content="Your Name"> in <head>.`,
    })
  }
}

// Fires only on article-shaped pages that show NO sign of an FAQ. "Article-
// shaped" means any one of: classifyPage reports blog_post, the page declares
// BlogPosting/Article/NewsArticle/TechArticle JSON-LD, or it carries both an
// author byline and a publication date (the E-E-A-T pair Google treats as an
// article signal). A page that's merely long but isn't article-shaped (long
// changelog, API reference, verbose pricing page) no longer gets flagged.
// Surfaces as a suggestion because a short FAQ is one of the few edits that
// moves both rich-results eligibility (FAQPage schema) and AI-assistant
// citation (question-shaped chunks) in the same shot.
function checkFaqSuggestion($: CheerioAPI, url: string | undefined, issues: RawIssue[]) {
  if (!url) return

  let pathname = ""
  try { pathname = new URL(url).pathname.toLowerCase() } catch { return }
  if (pathname === "" || pathname === "/") return

  // Pages that ARE an FAQ or a listing don't need the suggestion.
  if (/\/faqs?(\/|$)/.test(pathname)) return
  if (/\/(tag|category|author|archive)\//.test(pathname)) return

  // Gate 1: URL classifier flags it as a blog post (/blog/*, /posts/*,
  // /articles/*, /news/*, /insights/*, /resources/*).
  const isBlogPost = classifyPage(url) === "blog_post"

  // Gate 2: the page declares itself an article via JSON-LD. Walks @graph
  // arrays so Yoast/framework-generated bundles match too.
  let hasArticleSchema = false
  $('script[type="application/ld+json"]').each((_, el) => {
    if (hasArticleSchema) return
    try {
      const data = JSON.parse($(el).html() ?? "")
      const walk = (node: unknown): boolean => {
        if (!node || typeof node !== "object") return false
        const obj = node as Record<string, unknown>
        const type = obj["@type"]
        const typeStr = Array.isArray(type) ? type.join(",") : String(type ?? "")
        if (/\b(BlogPosting|Article|NewsArticle|TechArticle)\b/i.test(typeStr)) return true
        const graph = obj["@graph"]
        if (Array.isArray(graph)) return graph.some(walk)
        return false
      }
      if (walk(data)) hasArticleSchema = true
    } catch { /* ignore malformed — structured-data check reports it */ }
  })

  // Gate 3: E-E-A-T pair — author AND date are both present. Same markers
  // the existing E-E-A-T check looks for, so a page that passes that check
  // on both axes is treated as "clearly an article".
  const hasAuthor = !!$('meta[name="author"]').attr("content")
    || !!$('meta[property="article:author"]').attr("content")
    || $('[rel="author"], [itemprop="author"], .author, [class*="author"]').length > 0
  const hasDate = $("time[datetime]").length > 0
    || !!$('meta[property="article:published_time"]').attr("content")
  const hasEeaTPair = hasAuthor && hasDate

  if (!isBlogPost && !hasArticleSchema && !hasEeaTPair) return

  // FAQPage JSON-LD (handles both bare objects and @graph arrays).
  let hasFaqSchema = false
  $('script[type="application/ld+json"]').each((_, el) => {
    if (hasFaqSchema) return
    try {
      const data = JSON.parse($(el).html() ?? "")
      const walk = (node: unknown): boolean => {
        if (!node || typeof node !== "object") return false
        const obj = node as Record<string, unknown>
        const type = obj["@type"]
        const typeStr = Array.isArray(type) ? type.join(",") : String(type ?? "")
        if (/FAQPage/i.test(typeStr)) return true
        const graph = obj["@graph"]
        if (Array.isArray(graph)) return graph.some(walk)
        return false
      }
      if (walk(data)) hasFaqSchema = true
    } catch { /* malformed JSON-LD is handled by the structured-data check */ }
  })
  if (hasFaqSchema) return

  // Accordion cluster is a strong "FAQ lives here" signal.
  if ($("details").length >= 3) return

  // 3+ question-ending H2/H3 headings look like an FAQ even without schema.
  const questionHeadings = $("h2, h3").filter((_, el) => $(el).text().trim().endsWith("?")).length
  if (questionHeadings >= 3) return

  // Elements literally class- or id-named "faq".
  const hasFaqMarkup = $("[class], [id]").filter((_, el) => {
    const cls = ($(el).attr("class") ?? "").toLowerCase()
    const id = ($(el).attr("id") ?? "").toLowerCase()
    return cls.includes("faq") || id.includes("faq")
  }).length > 0
  if (hasFaqMarkup) return

  issues.push({
    id: "missing-faq-section",
    category: "aeo",
    severity: "info",
    type: "suggestion",
    title: "No FAQ section detected on this content page",
    description:
      "Pages that end with a short FAQ section (3 to 5 questions and answers) are disproportionately surfaced by Google rich results, AI Overviews, and LLM assistants. A FAQ gives structured answers to the exact questions your readers ask, and FAQPage JSON-LD signals them to Google.",
    fix:
      'Add a short FAQ section at the bottom of the page with 3 to 5 real questions your readers ask, each followed by a 1 to 3 sentence answer. Mirror the visible questions in FAQPage JSON-LD: {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"...","acceptedAnswer":{"@type":"Answer","text":"..."}}]}. Keep questions natural and literal ("How much does it cost?", not "Pricing").',
  })
}

function checkQuestionHeadings($: CheerioAPI, issues: RawIssue[]) {
  const headings = $("h2, h3")
    .map((_, el) => $(el).text().trim().toLowerCase())
    .get()

  if (headings.length < 3) return

  const questionPrefixes = ["what ", "how ", "why ", "when ", "who ", "which ", "where ", "can ", "does ", "is ", "are "]
  const hasQuestion = headings.some(
    (h) => h.endsWith("?") || questionPrefixes.some((p) => h.startsWith(p))
  )

  if (!hasQuestion) {
    issues.push({
      id: "no-question-headings",
      category: "aeo",
      severity: "info",
      type: "suggestion",
      title: "No question-format headings",
      description:
        "AI systems (ChatGPT, Perplexity, Google AI) frequently pull answers from pages that structure content as questions and answers. None of your headings match the question patterns AI looks for.",
      fix: `Rewrite some H2 or H3 headings as questions. Example: "Our Services" → "What services do we offer?", "Pricing" → "How much does it cost?". This directly increases the chance of being cited in AI-generated answers.`,
    })
  }
}
