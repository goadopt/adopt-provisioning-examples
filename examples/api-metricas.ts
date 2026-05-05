/**
 * API: Consent metrics
 *
 * Fetches the "Consent metrics" screen data from the org pathname.
 * Equivalent to the panel shown at Privacy > Overview in the platform:
 *
 *   Consents | Rejections | Opt-outs | Acceptance rate | Rejection rate
 *
 * Usage:
 *   export ADOPT_USER_EMAIL=you@example.com
 *   export ADOPT_USER_PASSWORD=your-password
 *   export ORG_PATHNAME=my-org-path
 *   export MONTH=4          # optional, defaults to current month
 *   export YEAR=2026        # optional, defaults to current year
 *
 *   npx ts-node examples/api-metricas.ts
 */

import { AdoptProvisioningClient, createFetcher } from '@adopt-tech/provisioning'

const ORG_PATHNAME = process.env['ORG_PATHNAME'] ?? 'adopt-provisioning-docs-demo'
const now   = new Date()
const YEAR  = Number(process.env['YEAR']  ?? now.getFullYear())
const MONTH = Number(process.env['MONTH'] ?? now.getMonth() + 1)

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

async function main(): Promise<void> {
  const client = new AdoptProvisioningClient({
    environment: 'staging',
    username: process.env['ADOPT_USER_EMAIL'] ?? 'you@example.com',
    password: process.env['ADOPT_USER_PASSWORD'] ?? 'your-password',
  })

  const fetcher = createFetcher(client)

  // ── 1. Resolve org → disclaimer ───────────────────────────────────────────

  const orgPage  = await fetcher.organizations({ pathname: ORG_PATHNAME }).fetch()
  const org      = orgPage.data[0]
  if (!org) throw new Error(`Organization not found: ${ORG_PATHNAME}`)

  const discPage = await fetcher.organizations({ pathname: ORG_PATHNAME }).disclaimers().fetch()
  const disc = discPage.data[0]
  if (!disc) throw new Error(`No disclaimer found for ${ORG_PATHNAME}`)

  // ── 2. Fetch monthly metrics ──────────────────────────────────────────────
  // Equivalent to the "Consent metrics" panel in the platform.
  // monthlyForDisclaimer uses the monthly_metrics table (month_type='month').

  const metrics = await fetcher.metrics().monthlyForDisclaimer(disc.id, YEAR, MONTH)

  // ── 3. Display in UI format ───────────────────────────────────────────────

  console.log(`\nConsent metrics — ${MONTH_NAMES[MONTH]} ${YEAR}`)
  console.log('─'.repeat(60))
  console.log(`Org:        ${org.pathname} (${org.id})`)
  console.log(`Disclaimer: ${disc.id}`)
  console.log()
  console.log(`Consents       ${metrics.consents.toLocaleString('en').padStart(8)}`)
  console.log(`Rejections     ${metrics.rejections.toLocaleString('en').padStart(8)}`)
  console.log(`Opt-outs       ${metrics.opt_outs.toLocaleString('en').padStart(8)}`)
  console.log(`Unique users   ${metrics.unique_users.toLocaleString('en').padStart(8)}`)
  console.log(`Acceptance     ${(metrics.acceptance_rate * 100).toFixed(1).padStart(7)}%`)
  console.log(`Rejection      ${(metrics.rejection_rate * 100).toFixed(1).padStart(7)}%`)

  if (metrics.dsar_total > 0) {
    console.log()
    console.log(`DSAR requests  ${metrics.dsar_total.toString().padStart(8)}`)
    for (const [type, count] of Object.entries(metrics.dsar_by_type)) {
      console.log(`  ${type}: ${count}`)
    }
  }

  // ── 4. Fetch previous month for delta comparison ──────────────────────────
  const prevMonth = MONTH === 1 ? 12 : MONTH - 1
  const prevYear  = MONTH === 1 ? YEAR - 1 : YEAR
  const prev = await fetcher.metrics().monthlyForDisclaimer(disc.id, prevYear, prevMonth)

  if (prev.unique_users > 0 || prev.consents > 0) {
    const delta = (curr: number, before: number) => {
      if (before === 0) return ''
      const d = ((curr - before) / before * 100).toFixed(0)
      return Number(d) >= 0 ? ` (+${d}%)` : ` (${d}%)`
    }
    console.log()
    console.log(`vs. ${MONTH_NAMES[prevMonth]}:`)
    console.log(`  Consents     ${delta(metrics.consents,        prev.consents)}`)
    console.log(`  Rejections   ${delta(metrics.rejections,      prev.rejections)}`)
    console.log(`  Acceptance   ${delta(metrics.acceptance_rate, prev.acceptance_rate)}`)
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
