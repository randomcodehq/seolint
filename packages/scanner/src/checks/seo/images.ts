import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"

const LEGACY_FORMATS = new Set(["jpg", "jpeg", "png", "gif"])

export function checkImages($: CheerioAPI, issues: RawIssue[]) {
  let missingAlt = 0
  let missingDimensions = 0
  let legacyFormat = 0
  let missingLazyLoad = 0

  $("img").each((idx, el) => {
    const src = $(el).attr("src") ?? ""
    const alt = $(el).attr("alt")
    const isAboveFold = idx < 2 // first 2 images are assumed above-fold

    if (alt === undefined) missingAlt++
    if (!$(el).attr("width") || !$(el).attr("height")) missingDimensions++

    const ext = src.split("?")[0].split(".").pop()?.toLowerCase()
    if (ext && LEGACY_FORMATS.has(ext)) legacyFormat++

    if (!isAboveFold && $(el).attr("loading") !== "lazy") missingLazyLoad++
  })

  if (missingAlt > 0) {
    const missingAltSrcs: string[] = []
    $("img").each((_, el) => {
      if ($(el).attr("alt") === undefined) {
        const src = $(el).attr("src") ?? "(no src)"
        missingAltSrcs.push(`<img src="${src.slice(0, 80)}">`)
      }
    })
    issues.push({
      id: "images-missing-alt",
      category: "accessibility",
      severity: "warning",
      title: `${missingAlt} image${missingAlt > 1 ? "s" : ""} missing alt text`,
      description: `${missingAlt} <img> element${missingAlt > 1 ? "s are" : " is"} missing the alt attribute. Alt text is required for WCAG compliance and allows screen readers to describe images. Search engines also use it to index image content.`,
      fix: 'Add alt to all images. Describe the content: alt="Team at our Berlin office". For decorative images use alt="".',
      element: missingAltSrcs.slice(0, 5).join("\n") + (missingAlt > 5 ? `\n…and ${missingAlt - 5} more` : ""),
    })
  }

  if (missingDimensions > 0) {
    issues.push({
      id: "images-missing-dimensions",
      category: "performance",
      severity: "warning",
      title: `${missingDimensions} image${missingDimensions > 1 ? "s" : ""} missing width/height`,
      description: `${missingDimensions} image${missingDimensions > 1 ? "s are" : " is"} missing explicit width and height attributes. Without these, the browser cannot reserve space before images load — causing layout shift (CLS).`,
      fix: 'Add width and height matching the image\'s natural size: <img src="..." width="800" height="600">. Set height: auto in CSS to preserve aspect ratio.',
    })
  }

  if (legacyFormat > 0) {
    issues.push({
      id: "images-not-modern-format",
      category: "performance",
      severity: "info",
      type: "suggestion",
      title: `${legacyFormat} image${legacyFormat > 1 ? "s" : ""} not in WebP or AVIF format`,
      description: `${legacyFormat} image${legacyFormat > 1 ? "s are" : " is"} served as JPEG, PNG, or GIF. WebP is ~30% smaller than JPEG at the same quality; AVIF is ~20% smaller still — directly improving LCP.`,
      fix: 'Convert to WebP at squoosh.app. Use <picture> for fallback: <picture><source srcset="img.webp" type="image/webp"><img src="img.jpg"></picture>.',
    })
  }

  if (missingLazyLoad > 0) {
    issues.push({
      id: "images-missing-lazy-load",
      category: "performance",
      severity: "info",
      type: "suggestion",
      title: `${missingLazyLoad} below-fold image${missingLazyLoad > 1 ? "s" : ""} not lazy loaded`,
      description: `${missingLazyLoad} off-screen image${missingLazyLoad > 1 ? "s" : ""} load eagerly. Lazy loading defers them until the user scrolls, reducing initial page weight and improving LCP.`,
      fix: 'Add loading="lazy" to images not in the initial viewport. Never add it to above-the-fold images — it delays your most important content.',
    })
  }
}
