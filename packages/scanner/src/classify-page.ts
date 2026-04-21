// Simple URL-based page classifier — no AI needed

export type PageType =
  | "homepage"
  | "blog_post"
  | "category"
  | "pricing"
  | "features"
  | "info"
  | "subpage"

export function classifyPage(url: string): PageType {
  let path = "/"
  try {
    path = new URL(url).pathname.replace(/\/$/, "") || "/"
  } catch {
    return "subpage"
  }

  if (path === "/") return "homepage"

  const parts = path.split("/").filter(Boolean)
  const first = parts[0]?.toLowerCase() ?? ""
  const depth = parts.length

  // Category index pages
  if (depth === 1 && ["blog", "news", "articles", "posts", "insights", "resources"].includes(first)) {
    return "category"
  }

  // Blog/news posts (depth > 1 under a blog-like slug)
  if (depth >= 2 && ["blog", "news", "articles", "posts", "insights", "resources"].includes(first)) {
    return "blog_post"
  }

  // Pricing
  if (["pricing", "plans", "price", "subscribe", "buy"].includes(first)) return "pricing"

  // Features / product
  if (["features", "product", "products", "solutions", "platform", "how-it-works"].includes(first)) {
    return "features"
  }

  // Info pages
  if (["about", "team", "contact", "faq", "help", "careers", "legal", "privacy", "terms"].includes(first)) {
    return "info"
  }

  return "subpage"
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function homepageUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.hostname}/`
  } catch {
    return url
  }
}
