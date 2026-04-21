import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"

const VALID_LANG_RE = /^[a-z]{2}(-[A-Za-z]{2,})?$/

export function checkHreflang($: CheerioAPI, url: string, issues: RawIssue[]) {
  const hreflangTags = $('link[rel="alternate"][hreflang]')

  // If no hreflang at all but the page has a lang attribute, it might be multilingual
  // Only flag if there are signals of multiple languages (lang switcher links, etc.)
  if (hreflangTags.length === 0) {
    // Check for common multilingual signals
    const hasLangSwitcher =
      $('a[hreflang]').length > 0 ||
      $('[class*="lang-switch"], [class*="language-select"], [class*="locale-switch"]').length > 0 ||
      $('select[name*="lang"], select[name*="locale"], select[name*="language"]').length > 0

    const hasMultipleLangLinks =
      $('a[href*="/en/"], a[href*="/de/"], a[href*="/fr/"], a[href*="/es/"], a[href*="/nl/"], a[href*="/da/"], a[href*="/sv/"], a[href*="/ja/"], a[href*="/zh/"], a[href*="/pt/"], a[href*="/it/"]').length >= 2

    if (hasLangSwitcher || hasMultipleLangLinks) {
      issues.push({
        id: "missing-hreflang",
        category: "seo",
        severity: "warning",
        title: "Multilingual site without hreflang tags",
        description: "This page appears to have multiple language versions but no hreflang link tags. Without hreflang, search engines may show the wrong language version to users, or treat translations as duplicate content — hurting rankings in all languages.",
        fix: 'Add <link rel="alternate" hreflang="xx" href="..."> for each language version, including the current page. Always include hreflang="x-default" pointing to your default/fallback language version.',
      })
    }
    return
  }

  // Has hreflang tags — validate them
  const langs = new Set<string>()
  let hasSelfReference = false
  let hasXDefault = false
  const invalidLangs: string[] = []

  hreflangTags.each((_, el) => {
    const lang = $(el).attr("hreflang") ?? ""
    const href = $(el).attr("href") ?? ""

    if (lang === "x-default") {
      hasXDefault = true
      return
    }

    if (!VALID_LANG_RE.test(lang)) {
      invalidLangs.push(lang)
    }

    langs.add(lang)

    // Check if current page is self-referenced
    try {
      const tagUrl = new URL(href, url).href.replace(/\/$/, "")
      const currentUrl = url.replace(/\/$/, "")
      if (tagUrl === currentUrl) hasSelfReference = true
    } catch { /* skip malformed */ }
  })

  if (invalidLangs.length > 0) {
    issues.push({
      id: "hreflang-invalid-lang",
      category: "seo",
      severity: "warning",
      title: `Invalid hreflang language codes: ${invalidLangs.join(", ")}`,
      description: "Some hreflang tags use language codes that don't follow the ISO 639-1 format. Invalid codes are ignored by search engines, making those language versions invisible.",
      fix: `Use valid ISO 639-1 codes (e.g. "en", "de", "fr") optionally with region (e.g. "en-US", "pt-BR"). Invalid codes found: ${invalidLangs.join(", ")}`,
    })
  }

  if (!hasSelfReference) {
    issues.push({
      id: "hreflang-missing-self",
      category: "seo",
      severity: "warning",
      title: "Hreflang tags don't include a self-referencing entry",
      description: "The hreflang annotations on this page don't include a link back to the current page's own language. Google requires each page to reference itself in the hreflang set — without it, the entire hreflang cluster may be ignored.",
      fix: `Add a self-referencing hreflang tag: <link rel="alternate" hreflang="[this page's language]" href="${url}">`,
    })
  }

  if (!hasXDefault) {
    issues.push({
      id: "hreflang-missing-x-default",
      category: "seo",
      severity: "info",
      type: "suggestion",
      title: "No x-default hreflang tag",
      description: 'No hreflang="x-default" found. The x-default tag tells search engines which page to show when the user\'s language doesn\'t match any of your translations. Without it, users may land on the wrong language version.',
      fix: 'Add <link rel="alternate" hreflang="x-default" href="[your default language URL]"> to indicate the fallback page.',
    })
  }
}

export function checkLangConsistency($: CheerioAPI, issues: RawIssue[]) {
  const htmlLang = $("html").attr("lang")?.toLowerCase().trim()
  if (!htmlLang) return // missing-lang is already caught in technical.ts

  // Check if content-language header meta conflicts with html lang
  const contentLang = $('meta[http-equiv="content-language"]').attr("content")?.toLowerCase().trim()
  if (contentLang && contentLang !== htmlLang && !contentLang.startsWith(htmlLang)) {
    issues.push({
      id: "lang-mismatch",
      category: "seo",
      severity: "warning",
      title: `Language mismatch: <html lang="${htmlLang}"> vs content-language "${contentLang}"`,
      description: "The html lang attribute and the content-language meta tag specify different languages. This confuses search engines about which language the page is actually in, potentially serving it to the wrong audience.",
      fix: `Make them consistent. Remove the content-language meta tag (it's deprecated) and rely on <html lang="${htmlLang}"> as the single source of truth.`,
    })
  }
}
