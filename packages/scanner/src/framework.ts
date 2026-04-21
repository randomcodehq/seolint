// Sniff the framework/CMS from the rendered HTML so AI fix instructions can
// reference the right file paths (e.g. Next.js → app/layout.tsx, WordPress →
// header.php, vanilla → index.html). Cheap pure-cheerio detection — no extra
// network calls. Best-effort: returns "unknown" when nothing matches.

import type { CheerioAPI } from "cheerio"

export type Framework =
  | "nextjs-app"     // Next.js App Router (app/layout.tsx)
  | "nextjs-pages"   // Next.js Pages Router (pages/_document.tsx)
  | "react"          // CRA / Vite React (src/App.tsx, public/index.html)
  | "vue"            // Vue (src/App.vue, index.html)
  | "nuxt"           // Nuxt (app.vue, nuxt.config.ts)
  | "astro"          // Astro (src/layouts/*.astro)
  | "svelte"         // SvelteKit (src/app.html, src/routes/+layout.svelte)
  | "wordpress"      // WordPress (header.php, functions.php)
  | "shopify"        // Shopify (theme.liquid)
  | "webflow"        // Webflow (visual editor — code edits not applicable)
  | "wix"            // Wix
  | "squarespace"    // Squarespace
  | "html"           // Plain static HTML
  | "unknown"

export interface FrameworkHint {
  framework: Framework
  /** Human-readable label for AI prompts and UI */
  label: string
  /** Likely file paths the agent should look at first */
  filePaths: string[]
  /** Whether code edits are applicable at all (Webflow/Wix/Squarespace = no) */
  editable: boolean
}

const HINTS: Record<Framework, Omit<FrameworkHint, "framework">> = {
  "nextjs-app":   { label: "Next.js (App Router)",  filePaths: ["app/layout.tsx", "app/page.tsx", "app/[route]/page.tsx"],                editable: true  },
  "nextjs-pages": { label: "Next.js (Pages Router)", filePaths: ["pages/_document.tsx", "pages/_app.tsx", "pages/index.tsx"],              editable: true  },
  react:          { label: "React",                  filePaths: ["public/index.html", "src/App.tsx", "src/index.tsx"],                     editable: true  },
  vue:            { label: "Vue",                    filePaths: ["index.html", "src/App.vue", "src/main.ts"],                              editable: true  },
  nuxt:           { label: "Nuxt",                   filePaths: ["app.vue", "nuxt.config.ts", "layouts/default.vue"],                      editable: true  },
  astro:          { label: "Astro",                  filePaths: ["src/layouts/Layout.astro", "src/pages/index.astro"],                     editable: true  },
  svelte:         { label: "SvelteKit",              filePaths: ["src/app.html", "src/routes/+layout.svelte", "src/routes/+page.svelte"],  editable: true  },
  wordpress:      { label: "WordPress",              filePaths: ["wp-content/themes/<your-theme>/header.php", "wp-content/themes/<your-theme>/functions.php"], editable: true  },
  shopify:        { label: "Shopify",                filePaths: ["layout/theme.liquid", "snippets/meta-tags.liquid"],                      editable: true  },
  webflow:        { label: "Webflow",                filePaths: ["Project Settings → Custom Code → Head Code"],                            editable: false },
  wix:            { label: "Wix",                    filePaths: ["Site Manager → SEO → Custom Meta Tags"],                                 editable: false },
  squarespace:    { label: "Squarespace",            filePaths: ["Settings → Advanced → Code Injection → Header"],                         editable: false },
  html:           { label: "static HTML",            filePaths: ["index.html"],                                                            editable: true  },
  unknown:        { label: "your site",              filePaths: ["the file containing your <head> element"],                               editable: true  },
}

export function detectFramework($: CheerioAPI, html: string): FrameworkHint {
  // Order matters — more specific signatures first.

  // Next.js — both routers stamp `id="__next"` in the body, plus a generator
  if ($('div[id="__next"]').length > 0 || /__NEXT_DATA__/.test(html)) {
    // App Router uses /_next/static/chunks/app/, Pages Router uses /_next/static/chunks/pages/
    if (/\/_next\/static\/chunks\/app\//.test(html)) return build("nextjs-app")
    if (/\/_next\/static\/chunks\/pages\//.test(html)) return build("nextjs-pages")
    return build("nextjs-app") // default to App Router (the modern path)
  }

  // Nuxt
  if ($('div[id="__nuxt"]').length > 0 || /__NUXT__/.test(html)) return build("nuxt")

  // Astro — leaves `data-astro-cid-*` attributes and `astro-island` elements
  if (/data-astro-cid-|astro-island/.test(html)) return build("astro")

  // SvelteKit — body has `__svelte` data or kit-specific scripts
  if (/__sveltekit|svelte-kit/.test(html)) return build("svelte")

  // Vue (non-Nuxt) — `id="app"` plus `__VUE__` or vue-specific data attrs
  if (($('div[id="app"]').length > 0 && /__VUE__|vue\.runtime|vue\.global/.test(html)) || /<!--\[-->/.test(html)) return build("vue")

  // WordPress — wp-content/wp-json paths everywhere
  if (/wp-content\/|wp-json\/|wp-includes\//.test(html)) return build("wordpress")

  // Shopify — cdn.shopify.com or Shopify object
  if (/cdn\.shopify\.com|Shopify\.theme/.test(html)) return build("shopify")

  // Webflow — webflow.com CDN or wf- classes
  if (/webflow\.com|w-webflow|data-wf-/.test(html)) return build("webflow")

  // Wix — wix.com CDN or wixstatic
  if (/wixstatic\.com|wix\.com|_wix/.test(html)) return build("wix")

  // Squarespace
  if (/squarespace\.com|Squarespace\./.test(html)) return build("squarespace")

  // Generic React (CRA / Vite) — `id="root"` plus react in DOM
  if ($('div[id="root"]').length > 0 && /react/i.test(html)) return build("react")

  // Generic meta generator tag fallback
  const generator = $('meta[name="generator"]').attr("content")?.toLowerCase() ?? ""
  if (generator.includes("next.js")) return build("nextjs-app")
  if (generator.includes("nuxt")) return build("nuxt")
  if (generator.includes("astro")) return build("astro")
  if (generator.includes("wordpress")) return build("wordpress")
  if (generator.includes("hugo") || generator.includes("jekyll") || generator.includes("eleventy")) return build("html")

  // Plain HTML — has an html tag and very little JS framework cruft
  if ($("html").length > 0 && !/react|vue|svelte/i.test(html)) return build("html")

  return build("unknown")
}

function build(framework: Framework): FrameworkHint {
  return { framework, ...HINTS[framework] }
}
