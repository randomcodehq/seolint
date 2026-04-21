import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"

export function checkAccessibility($: CheerioAPI): RawIssue[] {
  const issues: RawIssue[] = []

  checkImageAlt($, issues)
  checkFormLabels($, issues)
  checkSkipLink($, issues)
  checkFocusOutline($, issues)

  return issues
}

function checkImageAlt($: CheerioAPI, issues: RawIssue[]) {
  let missingCount = 0
  const missingSrcs: string[] = []

  $("img").each((_, el) => {
    const alt = $(el).attr("alt")
    if (alt === undefined) {
      missingCount++
      const src = $(el).attr("src") ?? "(no src)"
      missingSrcs.push(`<img src="${src.slice(0, 80)}">`)
    }
  })

  if (missingCount > 0) {
    issues.push({
      id: "images-missing-alt",
      category: "accessibility",
      severity: "warning",
      title: `${missingCount} image${missingCount > 1 ? "s" : ""} missing alt attribute`,
      description: `${missingCount} <img> element${missingCount > 1 ? "s are" : " is"} missing the alt attribute entirely. Alt text is required for WCAG compliance and allows screen readers to describe images to visually impaired users. Search engines also use alt text to index image content.`,
      fix: 'Add alt attributes to all images. For meaningful images, describe the content: alt="Team photo at our Berlin office". For purely decorative images, use an empty alt: alt="".',
      element: missingSrcs.slice(0, 5).join("\n") + (missingCount > 5 ? `\n…and ${missingCount - 5} more` : ""),
    })
  }
}

function checkFormLabels($: CheerioAPI, issues: RawIssue[]) {
  let unlabelledCount = 0
  const unlabelledInputs: string[] = []

  $("input, select, textarea").each((_, el) => {
    const type = $(el).attr("type")?.toLowerCase()
    if (type === "hidden" || type === "submit" || type === "button" || type === "reset") return

    const id = $(el).attr("id")
    const name = $(el).attr("name")
    const hasLabel = id ? $(`label[for="${id}"]`).length > 0 : false
    const hasAriaLabel = $(el).attr("aria-label") || $(el).attr("aria-labelledby")

    if (!hasLabel && !hasAriaLabel) {
      unlabelledCount++
      const attrs = [
        el.tagName,
        type ? `type="${type}"` : null,
        id ? `id="${id}"` : null,
        name ? `name="${name}"` : null,
      ].filter(Boolean).join(" ")
      unlabelledInputs.push(`<${attrs}>`)
    }
  })

  if (unlabelledCount > 0) {
    issues.push({
      id: "form-inputs-missing-labels",
      category: "accessibility",
      severity: "warning",
      title: `${unlabelledCount} form input${unlabelledCount > 1 ? "s" : ""} missing labels`,
      description: `${unlabelledCount} form field${unlabelledCount > 1 ? "s have" : " has"} no associated label. Screen reader users cannot identify what the field is for without a label.`,
      fix: 'Associate labels using the for/id pattern: <label for="email">Email</label> <input id="email" type="email">. Alternatively, add aria-label="Email" directly on the input.',
      element: unlabelledInputs.slice(0, 5).join("\n") + (unlabelledCount > 5 ? `\n…and ${unlabelledCount - 5} more` : ""),
    })
  }
}

function checkSkipLink($: CheerioAPI, issues: RawIssue[]) {
  const firstLink = $("a").first()
  const href = firstLink.attr("href") ?? ""
  const text = firstLink.text().toLowerCase()

  const hasSkipLink = href.startsWith("#") && (
    text.includes("skip") || text.includes("main") || text.includes("content")
  )

  if (!hasSkipLink) {
    issues.push({
      id: "missing-skip-link",
      category: "accessibility",
      severity: "info",
      title: "No skip navigation link",
      description: "No skip-to-content link detected. Keyboard-only users must tab through every navigation item on every page without a skip link — a WCAG 2.4.1 Level A violation.",
      fix: 'Add a skip link as the first element in <body>: <a href="#main-content" class="sr-only focus:not-sr-only">Skip to main content</a>. Add id="main-content" to your <main> element.',
    })
  }
}

function checkFocusOutline($: CheerioAPI, issues: RawIssue[]) {
  // Detect inline styles that globally remove outlines
  const styleBlocks = $("style").text()
  const hasGlobalOutlineNone = /\*\s*\{[^}]*outline\s*:\s*none/i.test(styleBlocks) ||
    /\*\s*\{[^}]*outline\s*:\s*0/i.test(styleBlocks)

  if (hasGlobalOutlineNone) {
    issues.push({
      id: "outline-removed",
      category: "accessibility",
      severity: "warning",
      title: "Focus outlines may be globally removed",
      description: 'A CSS rule like * { outline: none } was detected. Removing focus outlines makes keyboard navigation impossible for sighted keyboard users — a WCAG 2.4.7 Level AA violation.',
      fix: 'Remove the global outline: none rule. If you dislike the default browser outline, style it instead: :focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }',
      element: `* { outline: none } (detected in inline <style>)`,
    })
  }
}
