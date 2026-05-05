/**
 * API: Banner options
 *
 * Populates the "Requests page" tab in the platform settings:
 *   - Enable Google Consent Mode
 *   - Hide banner and controller after consent
 *
 * Also available via "Advanced Options":
 *   - Fallback language
 *   - Consent TTL (days)
 *
 * Operation modes (MODE):
 *   update → apply options to the disclaimer (default)
 *   read   → display current options
 *
 * Usage:
 *   export ADOPT_USER_EMAIL=you@example.com
 *   export ADOPT_USER_PASSWORD=your-password
 *   export ORG_PATHNAME=my-org-path
 *
 *   npx ts-node examples/api-options.ts
 *   MODE=read npx ts-node examples/api-options.ts
 */

import {
  AdoptProvisioningClient,
  ResumableProvisioningExecutor,
  DisclaimerOptionsProvisioner,
  createFetcher,
} from '@adopt-tech/provisioning'

const ORG_PATHNAME  = process.env['ORG_PATHNAME']  ?? 'adopt-provisioning-docs-demo'
const DISCLAIMER_ID = process.env['DISCLAIMER_ID']            // optional
const MODE          = process.env['MODE']          ?? 'update'

async function main(): Promise<void> {
  const client = new AdoptProvisioningClient({
    environment: 'staging',
    username: process.env['ADOPT_USER_EMAIL'] ?? 'you@example.com',
    password: process.env['ADOPT_USER_PASSWORD'] ?? 'your-password',
  })

  const fetcher = createFetcher(client)

  // ── 1. Resolve disclaimer ─────────────────────────────────────────────────
  // If DISCLAIMER_ID is set, fetch directly by ID (useful when the org has multiple
  // disclaimers and data[0] may not be the correct one).

  const discPage = DISCLAIMER_ID
    ? await fetcher.disclaimers({ id: DISCLAIMER_ID }).fetch()
    : await fetcher.organizations({ pathname: ORG_PATHNAME }).disclaimers().fetch()
  const disc = discPage.data[0]
  if (!disc)
    throw new Error(
      DISCLAIMER_ID ? `Disclaimer ${DISCLAIMER_ID} not found` : `No disclaimer found for ${ORG_PATHNAME}`,
    )
  console.log(`✓ Disclaimer: ${disc.id}`)

  if (MODE === 'read') {
    // ── Read current options ──────────────────────────────────────────────
    const opts = await fetcher.disclaimers({ id: disc.id }).getOptions()
    if (!opts) { console.log('No options configured.'); return }

    const fallback = (opts.languages_configuration as { fallback?: string } | null)?.fallback
    const langs    = (opts.languages_configuration as { languages?: string[] } | null)?.languages ?? []

    console.log()
    console.log('Configured options:')
    console.log('  Google Consent Mode:     ', opts.google_consent_mode ? 'Yes' : 'No')
    console.log('  Hide after consent:      ', opts.hide_disclaimer     ? 'Yes' : 'No')
    console.log('  Consent TTL:             ', opts.consent_ttl_in_days ?? '(default)', 'days')
    console.log('  Fallback language:       ', fallback ?? '(not set)')
    console.log('  Languages:               ', langs.length ? langs.join(', ') : '(all)')
    console.log('  Manual block:            ', opts.manual_block  ? 'Yes' : 'No')
    console.log('  Accessibility:           ', opts.accessibility ? 'Yes' : 'No')
    return
  }

  // ── 2. Apply banner options ───────────────────────────────────────────────
  // Equivalent to the "Requests page" tab + "Advanced Options" in the platform.
  //
  // googleConsentMode: enables Google Consent Mode v2 integration
  // hideAfterConsent:  hides banner and controller after the visitor consents
  // fallBackLanguage:  language used when the visitor's language has no translation
  // consentTTLDays:    consent validity in days (default: 365; max depends on plan)

  const executor = new ResumableProvisioningExecutor({ client, config: {} })

  const options = new DisclaimerOptionsProvisioner('options', {
    // ── "Requests page" tab ───────────────────────────────────────────────
    googleConsentMode: true,    // Enable Google Consent Mode
    hideAfterConsent:  true,    // Hide banner and controller after consent

    // ── Advanced Options ──────────────────────────────────────────────────
    fallBackLanguage:  'pt',    // Fallback language when no translation exists
    consentTTLDays:    30,      // Consent validity (max depends on plan)
  })

  console.log('\nApplying options…')
  const result = await executor.executeForDisclaimer(disc.id, [options])

  if (!result.success) throw new Error(`Failed: ${result.error}`)
  console.log('✓ Options updated')

  console.log()
  console.log('Options applied:')
  console.log('  [✓] Enable Google Consent Mode')
  console.log('  [✓] Hide banner and controller after consent')
  console.log('  Fallback language: pt')
  console.log('  Consent TTL: 30 days (max varies by plan)')
  console.log()
  console.log('Next step: configure the DSAR requests page')
  console.log('  See: examples/api-dsar.ts')
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
