import type { RawIssue } from "./index"
import type { FrameworkHint } from "./framework"

export interface GscContext {
  /** Total clicks over the window. */
  clicks: number
  /** Total impressions over the window. */
  impressions: number
  /** Impression-weighted CTR, 0-1. */
  ctr: number
  /** Impression-weighted average SERP position (lower = better). */
  position: number
  /** How many days of data are in the window. */
  daysWithData: number
  /** Window size in days. */
  days: number
}

interface PageContext {
  url: string
  title: string
  description: string
  h1: string
  bodyPreview: string
  framework: FrameworkHint
  /** Real Search Console numbers for this exact URL. When present, the AI is
   *  told to anchor every "why" sentence to the traffic impact. */
  gsc?: GscContext | null
}

/**
 * Pluggable AI handler. Passed into `enrichWithAiFixes` so the scanner
 * stays model- and vendor-agnostic. Consumers wire their own adapter
 * around Anthropic, OpenAI, a local model, or a mock in tests.
 *
 * The handler receives a fully-assembled system prompt + user message and
 * should return the raw text response. The scanner parses JSON out of the
 * response itself.
 */
export interface AiHandler {
  call(opts: {
    system: string
    messages: { role: "user" | "assistant"; content: string }[]
    model?: string
    maxTokens?: number
    /** Surfaced so consumers can attribute usage (Supabase logging, cost
     *  dashboards, per-user rate limiting). Purely informational — scanner
     *  doesn't read it. */
    domain?: string
  }): Promise<string>
}

// Takes raw issues with generic fix text, returns issues with AI-personalised
// fix instructions formatted as direct, executable steps that an AI coding agent
// (Claude Code, Cursor, Windsurf) can apply without rewriting them.
//
// Gracefully no-ops when no AI handler is provided OR when the handler throws.
// Scanner is usable with zero AI — you get structured issues with generic
// fix strings; the AI layer upgrades those to agent-ready prose.
export async function enrichWithAiFixes(
  issues: RawIssue[],
  context: PageContext,
  ai?: AiHandler | null,
): Promise<RawIssue[]> {
  // Only enrich issues that have a real impact — skip info-level to save cost
  const toEnrich = issues.filter((i) => i.severity === "critical" || i.severity === "warning")
  if (toEnrich.length === 0) return issues
  if (!ai) return issues

  try {
    const issueList = toEnrich
      .map((i, idx) => {
        const base = `${idx + 1}. id=${i.id} | title=${i.title} | description=${i.description}`
        return i.element ? `${base}\n   element_found: ${i.element}` : base
      })
      .join("\n")

    // Framework-aware system prompt — the `fix` is a prompt an AI coding
    // agent (Claude Code, Cursor, Windsurf) will consume. NOT a numbered list
    // for humans. Dense natural language with inline file paths and fenced
    // code blocks is what agents parse best. The `why` is the page-specific
    // impact the agent can quote when it explains what it's doing.
    const systemPrompt = `You write SEO fix prompts that get pasted into an AI coding agent (Claude Code, Cursor, Windsurf). The agent reads your text, finds the file, and makes the change. Your output must be OPTIMISED FOR THE AGENT, not for a human skimming a dashboard.

Stack hint: this site appears to be built with ${context.framework.label}.
Likely files to edit: ${context.framework.filePaths.join(", ")}
${context.framework.editable ? "" : "IMPORTANT: this is a no-code platform. Edits happen in the platform UI, not in code files. Reference the UI path, not file paths."}
${context.gsc && context.gsc.impressions > 0
  ? `Search Console data (last ${context.gsc.days} days for this exact URL): ${context.gsc.clicks} clicks, ${context.gsc.impressions.toLocaleString()} impressions, average position ${context.gsc.position.toFixed(1)}, CTR ${(context.gsc.ctr * 100).toFixed(1)}%. This is REAL traffic data — ground every "why" sentence in these numbers. If impressions are in the thousands, say "this page gets X impressions/month so even a small CTR lift…". If position is 8-15, frame fixes as "you're close to page 1". If clicks are near zero despite impressions, that's a title/snippet problem. Never say "improve SEO" — quantify.`
  : context.gsc && context.gsc.daysWithData === 0
    ? "Search Console has no data for this exact URL yet. Don't speculate about traffic — treat fixes as first-principles correctness."
    : ""}

For each issue you must produce TWO things:

(1) "fix" — an agent-optimal instruction. Rules:
- Write DENSE NATURAL-LANGUAGE INSTRUCTIONS, NOT a numbered list. Agents parse prose with inline references better than bullet points.
- Name the specific file path inline with backticks (e.g. \`app/layout.tsx\`). Use the stack hint above. If you genuinely don't know the file, say "the file containing your <head>" not "your HTML file".
- Include the EXACT code to write in a fenced code block (triple backticks with a language tag). Never describe code in words.
- Reference WHERE in the file to make the change (e.g. "inside <head>, right after the existing viewport meta").
- Ground the fix to this page: use the page's actual title / H1 / brand name from the context where it makes the fix more specific.
- If element_found is provided, reference its actual content so the agent knows which element to replace.
- Keep the whole fix under 120 words. Dense, concrete, copy-pasteable.
- Do NOT start with "To fix this", "You should", "Open the file and...". Start with the action directly.
- Do NOT write "1." "2." "3." numbered steps. Do NOT write bullet points. Write in prose.

(2) "why" — one or two sentences explaining why this matters for THIS specific page. Rules:
- Reference the page's actual goal, content, or audience. NOT generic SEO theory.
- Tie the issue to a concrete impact ("Without this, your /pricing page won't show rich result snippets for 'cheap CNC parts' which is your H1 keyword").
- If element_found is provided, point at it ("Your current <h1> is 'Welcome' — Google can't tell what this page is about").
- Maximum 2 sentences. No motivational filler. No "search engines need this" abstractions.

Good example output (dense prose, inline code, grounded to the page):
\`\`\`json
{
  "missing-title": {
    "fix": "In \`app/layout.tsx\`, inside the \`<head>\` block (just after the existing \`<meta name=\\"viewport\\">\`), add:\\n\\n\`\`\`tsx\\n<title>Acme Widgets — Custom CNC parts shipped in 48h</title>\\n\`\`\`\\n\\nUse the phrasing from the existing H1 so the title matches the page's actual value prop. If there's an existing empty or default title tag, replace it rather than adding a second one.",
    "why": "The page has no <title> at all, so Google's SERP shows the URL slug instead of a real headline — the single biggest CTR killer for a product page targeting 'CNC parts'. Your H1 'Custom CNC parts shipped in 48h' is a ready-to-use starting point."
  }
}
\`\`\`

Bad example (DO NOT WRITE — this is what a human would write for another human):
\`\`\`json
{
  "missing-title": {
    "fix": "1. Open app/layout.tsx\\n2. Add a <title> tag inside the <head>\\n3. Set it to your brand name + value prop",
    "why": "Search engines use the title tag to understand what your page is about"
  }
}
\`\`\`

Output format: valid JSON only — an object mapping each issue id to {fix, why}. Both fields are required.`

    const userMessage = `Page being audited: ${context.url}

Page context:
- title: ${context.title || "(none)"}
- meta description: ${context.description || "(none)"}
- h1: ${context.h1 || "(none)"}
- body preview: ${(context.bodyPreview || "(none)").slice(0, 400)}

Issues to fix:
${issueList}

Respond with valid JSON only — an object mapping issue id to {"fix": "...", "why": "..."}. Both fields required.`

    let domain: string | undefined
    try { domain = new URL(context.url).hostname } catch { /* leave undefined */ }

    const raw = await ai.call({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      model: "claude-haiku-4-5-20251001",
      maxTokens: 3500,
      domain,
    })

    // Extract JSON even if the model wraps it in markdown
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return issues

    const fixes: Record<string, { fix?: string; why?: string } | string> = JSON.parse(jsonMatch[0])

    return issues.map((issue) => {
      const entry = fixes[issue.id]
      if (!entry) return issue

      // Tolerate both old (string) and new (object) shapes so partial outputs
      // don't blank out the fix field.
      if (typeof entry === "string") {
        return { ...issue, fix: entry }
      }
      return {
        ...issue,
        fix: typeof entry.fix === "string" ? entry.fix : issue.fix,
        why: typeof entry.why === "string" ? entry.why : issue.why,
      }
    })
  } catch (err) {
    console.warn("AI fix enrichment failed, using generic fixes:", err)
    return issues
  }
}
