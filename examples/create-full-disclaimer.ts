/**
 * Create a fully configured disclaimer in a single API call.
 *
 * Uses the create_disclaimer_with_branding Hasura action which provisions
 * org + disclaimer + style + documents + optional DSAR all server-side,
 * returning the created IDs and install code.
 *
 * After provisioning, fetches the org and disclaimer back to verify the result.
 *
 * Usage:
 *   export ADOPT_USER_EMAIL=you@example.com
 *   export ADOPT_USER_PASSWORD=your-password
 *   export PROVISION_URL=https://yoursite.com   # optional, defaults to https://example.com
 *
 *   npx ts-node examples/create-full-disclaimer.ts
 */

import { AdoptProvisioningClient, createFetcher } from '../src'

const URL_TO_PROVISION = process.env['PROVISION_URL'] ?? 'https://example.com'

async function main(): Promise<void> {
  const client = new AdoptProvisioningClient({
    environment: 'staging',
    username: process.env['ADOPT_USER_EMAIL']!,
    password: process.env['ADOPT_USER_PASSWORD']!,
  })

  // ── 1. Provision ──────────────────────────────────────────────────────────

  console.log(`Provisioning disclaimer for ${URL_TO_PROVISION}…`)

  const results = await client.createFullDisclaimer({
    urls: [URL_TO_PROVISION],
    immediateAvailable: true,
    skipBranding: true,
    org: {
      orgPathname: 'my-org-slug',
      orgName: 'My Organization',
    },
    style: {
      mainColor: '#00DD80',
      textColor: '#000000',
      backgroundColor: '#ffffff',
    },
    dsar: {
      createDsar: true,
      inviteDpoAsAdmin: true,
      // dpo: 'dpo@yourcompany.com', // defaults to authenticated user when omitted
    },
    documents: {
      cookieUrl: 'https://example.com/cookie-policy',
      privacyUrl: 'https://example.com/privacy-policy',
      termsUrl: 'https://example.com/terms',
    },
  })

  console.log('\n✓ Provisioned (' + results.length + ' result(s)):')
  for (const r of results) {
    console.log('  -----')
    console.log('  Org ID:       ', r.organizationId)
    console.log('  Disclaimer ID:', r.disclaimerId)
    console.log('  Dashboard:    ', r.dashboardUrl)
    console.log('  Install:\n', r.installCode)
  }

  const result = results[0]
  if (!result) throw new Error('No result returned')

  // ── 2. Verify by fetching back ────────────────────────────────────────────

  console.log('\nVerifying via fetcher…')
  const fetcher = createFetcher(client)

  const orgPage = await fetcher.organizations({ id: result.organizationId }).fetch()
  const org = orgPage.data[0]
  if (!org) throw new Error(`Org ${result.organizationId} not found after provisioning`)
  console.log('✓ Org:        ', org.id, `(${org.pathname})`)

  const discPage = await fetcher.organizations({ id: org.id }).disclaimers().fetch()
  const disc = discPage.data[0]
  if (!disc) throw new Error(`Disclaimer not found for org ${org.id}`)
  console.log('✓ Disclaimer: ', disc.id, `(${disc.pathname})`)
  console.log('✓ Status:     ', disc.disclaimer_status_id ?? 'n/a')

  const docs = await fetcher.disclaimers({ id: disc.id }).getDocuments()
  console.log('✓ Documents:')
  console.log('    Privacy:  ', docs?.document_master_privacy_id ?? '—')
  console.log('    Cookie:   ', docs?.document_master_cookies_id ?? '—')
  console.log('    Terms:    ', docs?.document_master_terms_id ?? '—')
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err)
  if (err && typeof err === 'object' && 'response' in err)
    console.error('Response:', JSON.stringify((err as Record<string, unknown>).response, null, 2))
  process.exit(1)
})
