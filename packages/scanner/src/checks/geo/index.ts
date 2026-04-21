import type { RawIssue } from "../../index"

// AI retrieval bots — these serve live answers in ChatGPT, Claude, Perplexity.
// Blocking them removes your site from AI search results (different from training bots like GPTBot).
const AI_RETRIEVAL_BOTS = ["chatgpt-user", "oai-searchbot", "claude-user", "claude-searchbot", "perplexitybot"]

async function fetchText(baseUrl: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`${new URL(baseUrl).origin}${path}`, {
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": "SEOLint/1.0 (+https://seolint.dev/bot)" },
    })
    return res.ok ? res.text() : null
  } catch {
    return null
  }
}

async function probeExists(baseUrl: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`${new URL(baseUrl).origin}${path}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": "SEOLint/1.0 (+https://seolint.dev/bot)" },
    })
    return res.ok
  } catch {
    return false
  }
}

function findBlockedRetrievalBots(robotsTxt: string): string[] {
  const blocked: string[] = []
  const lines = robotsTxt.toLowerCase().split("\n").map(l => l.trim())

  let currentAgents: string[] = []
  for (const line of lines) {
    if (line.startsWith("user-agent:")) {
      currentAgents = [line.replace("user-agent:", "").trim()]
    } else if (line.startsWith("disallow:") && line.includes("/")) {
      const disallowedPath = line.replace("disallow:", "").trim()
      if (disallowedPath === "/" || disallowedPath === "/*") {
        for (const agent of currentAgents) {
          if (AI_RETRIEVAL_BOTS.includes(agent)) blocked.push(agent)
        }
      }
    }
  }

  return blocked
}

export interface CheckGeoOptions {
  /** Skip every site-wide probe (robots.txt, sitemap.xml, llms.txt, skills.md,
   *  feed). Caller owns dedup: in the agent multi-page rotation, the homepage
   *  scan runs these once; sub-path scans pass `true` so the weekly brief
   *  doesn't list "llms.txt missing" on five URLs in a row. Standalone scans
   *  triggered from /api/scan or /api/v1/scan leave this undefined so a user
   *  scanning a single sub-page still gets the full site picture. */
  skipSiteWideChecks?: boolean
}

export async function checkGeo(url: string, options?: CheckGeoOptions): Promise<RawIssue[]> {
  if (options?.skipSiteWideChecks) return []
  const [robotsTxt, sitemapExists, llmsTxtExists, skillsMdExists, feedExists] = await Promise.all([
    fetchText(url, "/robots.txt"),
    probeExists(url, "/sitemap.xml"),
    probeExists(url, "/llms.txt"),
    probeExists(url, "/skills.md"),
    Promise.all([
      probeExists(url, "/feed.xml"),
      probeExists(url, "/rss.xml"),
      probeExists(url, "/feed"),
    ]).then((results) => results.some(Boolean)),
  ])

  const issues: RawIssue[] = []

  // robots.txt presence
  if (!robotsTxt) {
    issues.push({
      id: "missing-robots-txt",
      category: "seo",
      severity: "info",
      title: "No robots.txt found",
      description: "No robots.txt was found. Without it, crawlers have no guidance on which pages to skip — and you cannot control which AI bots access your content for training vs. search answers.",
      fix: "Create a /robots.txt at your domain root. At minimum: allow all crawlers and reference your sitemap. Add specific User-agent blocks to opt out of AI training (GPTBot, ClaudeBot) while keeping AI search bots (ChatGPT-User, PerplexityBot) allowed.",
    })
  } else {
    // robots.txt exists — check if AI retrieval bots are blocked
    const blockedBots = findBlockedRetrievalBots(robotsTxt)
    if (blockedBots.length > 0) {
      issues.push({
        id: "ai-retrieval-bots-blocked",
        category: "aeo",
        severity: "warning",
        title: `AI search bots blocked in robots.txt (${blockedBots.join(", ")})`,
        description: `Your robots.txt blocks ${blockedBots.join(", ")}. These are retrieval bots — they serve live answers in ChatGPT, Claude, and Perplexity. Blocking them removes your site from AI search results entirely.`,
        fix: "Remove the Disallow rules for retrieval bots. You can still block training bots (GPTBot, ClaudeBot, Google-Extended, CCBot) while keeping retrieval bots (ChatGPT-User, OAI-SearchBot, Claude-User, PerplexityBot) allowed.",
      })
    }
  }

  if (!sitemapExists) {
    issues.push({
      id: "missing-sitemap",
      category: "seo",
      severity: "info",
      title: "No XML sitemap found",
      description: "No sitemap.xml found at the root. Sitemaps tell search engines and AI crawlers which pages exist and when they were last updated — important for getting content indexed quickly.",
      fix: "Create a sitemap.xml at your domain root and reference it in robots.txt: Sitemap: https://yourdomain.com/sitemap.xml. Next.js generates one automatically from app/sitemap.ts.",
    })
  }

  if (!llmsTxtExists) {
    issues.push({
      id: "missing-llms-txt",
      category: "aeo",
      severity: "info",
      type: "suggestion",
      title: "No llms.txt found (GEO opportunity)",
      description: "No llms.txt found. This emerging standard (llmstxt.org) gives AI assistants a structured map of your site's most important pages — without parsing ads or navigation. Adoption is growing; no confirmed ranking impact yet but costs nothing to add.",
      fix: "Create /llms.txt at your domain root. Format: # Site Name\\n> One-paragraph summary.\\n\\n## Key pages\\n- [Page title](URL): Description. Full spec at llmstxt.org.",
    })
  }

  if (!skillsMdExists) {
    issues.push({
      id: "missing-skills-md",
      category: "aeo",
      severity: "info",
      type: "suggestion",
      title: "No skills.md found (AI agent integration)",
      description: "No skills.md found at /skills.md. This file is fetched by AI coding assistants (Cursor, Copilot, Claude) when developers ask how to integrate with your product or API. It's the machine-readable equivalent of your developer docs — helps AI agents recommend your tool.",
      fix: "Create /skills.md at your domain root. Include: product name, what it does, API base URL and key endpoints with request/response examples, authentication method, pricing tiers, and links to full docs. Reference it from your llms.txt.",
    })
  }

  if (!feedExists) {
    issues.push({
      id: "missing-rss-feed",
      category: "seo",
      severity: "info",
      type: "suggestion",
      title: "No RSS/Atom feed found",
      description: "No feed.xml or rss.xml found. Perplexity and other AI crawlers use RSS feeds to detect content updates and prioritise recrawling fresh content.",
      fix: "Add an RSS or Atom feed at /feed.xml. Most blog/CMS platforms generate one automatically. In Next.js, create app/feed.xml/route.ts using the 'feed' npm package.",
    })
  }

  return issues
}
