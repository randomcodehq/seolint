import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"

export function checkHttps(url: string, issues: RawIssue[]) {
  try {
    if (new URL(url).protocol === "http:") {
      issues.push({
        id: "not-https",
        category: "seo",
        severity: "critical",
        title: "Page served over HTTP, not HTTPS",
        description: "HTTPS is a confirmed Google ranking signal. HTTP pages show a 'Not secure' warning in Chrome, which damages user trust and reduces conversions.",
        fix: "Install an SSL certificate and redirect all HTTP traffic to HTTPS with a 301 redirect. Hosts like Vercel, Netlify and Cloudflare provide free SSL via Let's Encrypt.",
        element: url,
      })
    }
  } catch { /* malformed URL — skip */ }
}

export function checkCanonical($: CheerioAPI, url: string, issues: RawIssue[]) {
  const canonical = $('link[rel="canonical"]').attr("href")

  if (!canonical) {
    issues.push({
      id: "missing-canonical",
      category: "seo",
      severity: "warning",
      title: "Missing canonical URL",
      description: "No canonical link found. Without it, search engines may index multiple versions of the same page (http vs https, trailing slash vs none), splitting your ranking power.",
      fix: `Add <link rel="canonical" href="${url}"> in the <head> of this page.`,
    })
  }
}

export function checkRobotsMeta($: CheerioAPI, issues: RawIssue[]) {
  const robotsContent = $('meta[name="robots"]').attr("content") ?? ""
  const robots = robotsContent.toLowerCase()

  if (robots.includes("noindex")) {
    issues.push({
      id: "noindex",
      category: "seo",
      severity: "critical",
      title: "Page is set to noindex",
      description: "A robots meta tag with noindex is blocking search engines from indexing this page. It will not appear in search results.",
      fix: 'Remove <meta name="robots" content="noindex"> or change the content to "index, follow".',
      element: `<meta name="robots" content="${robotsContent}">`,
    })
  }

  if (robots.includes("nosnippet")) {
    issues.push({
      id: "nosnippet",
      category: "aeo",
      severity: "warning",
      title: "nosnippet is blocking AI Overviews and rich snippets",
      description: 'A robots meta tag with "nosnippet" prevents Google from using this page\'s content in AI Overviews, AI Mode, and featured snippets. As of March 2025, this is a confirmed exclusion signal for AI-generated search results.',
      fix: 'Remove "nosnippet" from your robots meta tag unless you intentionally want to exclude this page from AI search features. Use "max-snippet:150" if you want to limit (not block) the amount of content used.',
      element: `<meta name="robots" content="${robotsContent}">`,
    })
  }
}

export function checkViewport($: CheerioAPI, issues: RawIssue[]) {
  if (!$('meta[name="viewport"]').attr("content")) {
    issues.push({
      id: "missing-viewport",
      category: "seo",
      severity: "critical",
      title: "Missing viewport meta tag",
      description: "No viewport meta tag found. Without it, mobile browsers render the page at desktop width — causing a terrible mobile experience and hurting mobile rankings.",
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> in <head>.',
    })
  }
}

export function checkLang($: CheerioAPI, issues: RawIssue[]) {
  if (!$("html").attr("lang")) {
    issues.push({
      id: "missing-lang",
      category: "accessibility",
      severity: "warning",
      title: "Missing language attribute on <html>",
      description: "The <html> tag has no lang attribute. Screen readers use this to determine the correct pronunciation, and it helps search engines understand the page language.",
      fix: 'Add a lang attribute: <html lang="en"> (or your appropriate language code).',
      element: `<html> (no lang attribute)`,
    })
  }
}

export function checkJsRendering($: CheerioAPI, issues: RawIssue[]) {
  const bodyClone = $("body").clone()
  bodyClone.find("script, style, noscript, svg").remove()
  const text = bodyClone.text().replace(/\s+/g, " ").trim()
  const wordCount = text.split(" ").filter((w) => w.length > 1).length

  // Empty root element = unmistakable CSR shell
  const hasEmptyRoot =
    ($("#root").length > 0 || $("#app").length > 0) &&
    $("#root, #app").text().trim().length < 30

  // Heuristic: very little visible text + multiple inline scripts = likely JS-rendered
  const inlineScripts = $("script:not([src])").length
  const likelyJsRendered = wordCount < 80 && inlineScripts >= 2

  if (!hasEmptyRoot && !likelyJsRendered) return

  const hasNoscriptFallback = $("noscript").text().replace(/\s+/g, " ").trim().length > 40

  issues.push({
    id: "js-dependent-content",
    category: "seo",
    severity: hasNoscriptFallback ? "warning" : "critical",
    title: "Page content may be invisible to crawlers without JavaScript",
    description: `Only ~${wordCount} words are present in the raw HTML. Most of the content appears to be injected by JavaScript at runtime. Googlebot renders JS but on a delay — other crawlers (Bing, GPTBot, ClaudeBot, Perplexity) often can't. This page may be effectively invisible in AI search results.${hasNoscriptFallback ? " A <noscript> fallback was found, which helps." : " No <noscript> fallback was found."}`,
    fix: "Ensure critical content — heading, description, and main body text — is present in the initial HTML response before JavaScript runs. In Next.js: use Server Components, generateStaticParams, or getServerSideProps. In React (CRA): migrate to Next.js or Remix. In Vue: use Nuxt. As a quick check, disable JavaScript in your browser DevTools and reload the page — what you see is roughly what crawlers see.",
    element: `~${wordCount} words in raw HTML · ${inlineScripts} inline scripts · ${hasNoscriptFallback ? "noscript fallback present" : "no noscript fallback"}`,
  })
}

export function checkFavicon($: CheerioAPI, issues: RawIssue[]) {
  const favicon =
    $('link[rel="icon"]').attr("href") ??
    $('link[rel="shortcut icon"]').attr("href") ??
    $('link[rel="apple-touch-icon"]').attr("href")

  if (!favicon) {
    issues.push({
      id: "missing-favicon",
      category: "ux",
      severity: "info",
      type: "suggestion",
      title: "No favicon found",
      description: "No favicon detected. Favicons appear in browser tabs, bookmarks, and search results — a missing favicon looks unprofessional.",
      fix: 'Add <link rel="icon" href="/favicon.ico"> in <head>. Use a 32×32px .ico or 192×192px .png.',
    })
  }
}
