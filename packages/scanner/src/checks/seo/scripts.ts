import type { CheerioAPI } from "cheerio"
import type { RawIssue } from "../../index"

export function checkRenderBlockingScripts($: CheerioAPI, issues: RawIssue[]) {
  let blockingCount = 0

  $("head script[src]").each((_, el) => {
    // Module scripts are deferred by default
    if ($(el).attr("type") === "module") return
    if (!$(el).attr("defer") && !$(el).attr("async")) blockingCount++
  })

  if (blockingCount > 0) {
    issues.push({
      id: "render-blocking-scripts",
      category: "performance",
      severity: "warning",
      title: `${blockingCount} render-blocking script${blockingCount > 1 ? "s" : ""} in <head>`,
      description: `${blockingCount} <script src="..."> tag${blockingCount > 1 ? "s" : ""} in <head> lack defer or async. These block the browser from rendering until the script downloads and executes — directly hurting LCP and FCP.`,
      fix: 'Add defer to scripts that don\'t need to run before the page renders: <script src="..." defer>. Use async only for truly independent scripts like analytics.',
    })
  }
}
