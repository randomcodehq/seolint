#!/usr/bin/env node

const API_BASE = process.env.SEOLINT_API_URL ?? "https://www.seolint.dev"
const API_KEY = process.env.SEOLINT_API_KEY ?? ""

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "seolint-cli/0.1.1" }
  if (API_KEY) h["Authorization"] = `Bearer ${API_KEY}`
  return h
}

function printUsage() {
  console.log(`
  seolint — scan any website for SEO issues

  Usage:
    seolint scan <url>        Scan a URL and print the report
    seolint scan <url> --json Output raw JSON instead of markdown
    seolint help              Show this message

  Environment:
    SEOLINT_API_KEY   Your API key (get one at seolint.dev/connections)

  Examples:
    seolint scan https://example.com
    SEOLINT_API_KEY=sl_xxx seolint scan https://mysite.com --json
    npx seolint scan https://example.com
`)
}

async function scan(url: string, json: boolean) {
  // Normalise URL
  let fullUrl = url
  if (!/^https?:\/\//i.test(fullUrl)) fullUrl = `https://${fullUrl}`

  process.stderr.write(`Scanning ${fullUrl}...\n`)

  // Start scan
  const startRes = await fetch(`${API_BASE}/api/v1/scan`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ url: fullUrl }),
  })

  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({})) as Record<string, string>
    console.error(`Error: ${err.error ?? startRes.statusText}`)
    process.exit(1)
  }

  const { scanId } = await startRes.json()

  // Poll
  const maxWait = 90_000
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    const res = await fetch(`${API_BASE}/api/v1/scan/${scanId}`, { headers: headers() })
    if (!res.ok) {
      console.error(`Poll error: ${res.status}`)
      process.exit(1)
    }

    const data = await res.json()

    if (data.status === "complete") {
      if (json) {
        console.log(JSON.stringify(data.issues ?? [], null, 2))
      } else if (data.markdown) {
        console.log(data.markdown)
      } else {
        // Fallback: format issues as text
        const issues = (data.issues ?? []) as Array<{
          severity: string; title: string; category: string; description: string; fix: string
        }>
        if (issues.length === 0) {
          console.log("No issues found. The site looks good!")
        } else {
          console.log(`\n${issues.length} issues found:\n`)
          for (const issue of issues) {
            console.log(`  [${issue.severity.toUpperCase()}] ${issue.title}`)
            console.log(`  ${issue.description}`)
            console.log(`  Fix: ${issue.fix}\n`)
          }
        }
      }

      process.stderr.write(`Done. Report: ${API_BASE}/scan/${scanId}\n`)
      return
    }

    if (data.status === "error") {
      console.error(`Scan failed: ${data.error_message ?? "Unknown error"}`)
      process.exit(1)
    }

    // Still pending
    const elapsed = Math.floor((Date.now() - start) / 1000)
    process.stderr.write(`\r  ${elapsed}s elapsed...`)
    await new Promise(r => setTimeout(r, 3000))
  }

  console.error("Scan timed out after 90 seconds")
  process.exit(1)
}

// Parse args
const args = process.argv.slice(2)
const command = args[0]

if (!command || command === "help" || command === "--help" || command === "-h") {
  printUsage()
  process.exit(0)
}

if (command === "scan") {
  const url = args[1]
  if (!url) {
    console.error("Error: URL required. Usage: seolint scan <url>")
    process.exit(1)
  }
  const json = args.includes("--json")
  scan(url, json).catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
} else {
  console.error(`Unknown command: ${command}`)
  printUsage()
  process.exit(1)
}
