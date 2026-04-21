import { describe, it, expect } from "vitest"
import { classifyPage, extractDomain, homepageUrl } from "./classify-page"

describe("classifyPage", () => {
  it("classifies homepage", () => {
    expect(classifyPage("https://example.com/")).toBe("homepage")
    expect(classifyPage("https://example.com")).toBe("homepage")
  })

  it("classifies blog category index", () => {
    expect(classifyPage("https://example.com/blog")).toBe("category")
    expect(classifyPage("https://example.com/news")).toBe("category")
    expect(classifyPage("https://example.com/resources")).toBe("category")
  })

  it("classifies blog posts", () => {
    expect(classifyPage("https://example.com/blog/my-post")).toBe("blog_post")
    expect(classifyPage("https://example.com/blog/2026/how-to-do-seo")).toBe("blog_post")
    expect(classifyPage("https://example.com/news/breaking-story")).toBe("blog_post")
  })

  it("classifies pricing pages", () => {
    expect(classifyPage("https://example.com/pricing")).toBe("pricing")
    expect(classifyPage("https://example.com/plans")).toBe("pricing")
    expect(classifyPage("https://example.com/buy")).toBe("pricing")
  })

  it("classifies features pages", () => {
    expect(classifyPage("https://example.com/features")).toBe("features")
    expect(classifyPage("https://example.com/product")).toBe("features")
    expect(classifyPage("https://example.com/how-it-works")).toBe("features")
  })

  it("classifies info pages", () => {
    expect(classifyPage("https://example.com/about")).toBe("info")
    expect(classifyPage("https://example.com/contact")).toBe("info")
    expect(classifyPage("https://example.com/privacy")).toBe("info")
    expect(classifyPage("https://example.com/faq")).toBe("info")
  })

  it("falls back to subpage for unknown paths", () => {
    expect(classifyPage("https://example.com/some-random-page")).toBe("subpage")
    expect(classifyPage("https://example.com/deep/nested/path")).toBe("subpage")
  })

  it("handles malformed URLs gracefully", () => {
    expect(classifyPage("not-a-url")).toBe("subpage")
    expect(classifyPage("")).toBe("subpage")
  })
})

describe("extractDomain", () => {
  it("strips www", () => {
    expect(extractDomain("https://www.example.com/page")).toBe("example.com")
  })

  it("returns hostname only", () => {
    expect(extractDomain("https://example.com/blog/post")).toBe("example.com")
  })

  it("handles malformed URLs", () => {
    expect(extractDomain("not-a-url")).toBe("not-a-url")
  })
})

describe("homepageUrl", () => {
  it("strips path to root", () => {
    expect(homepageUrl("https://example.com/blog/post")).toBe("https://example.com/")
  })

  it("preserves protocol", () => {
    expect(homepageUrl("http://example.com/page")).toBe("http://example.com/")
  })
})
