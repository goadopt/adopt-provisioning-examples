/**
 * API: DSAR portal (Data Subject Access Requests)
 *
 * Creates or updates the DSAR portal linked to the org's disclaimer, and allows
 * querying platform default texts to pre-populate UI forms.
 *
 * Accessible in the platform at: Privacy > Settings > Requests page
 * (via the "Advanced Options" button on the "Requests page" tab).
 *
 * Operation modes (MODE):
 *   create   → create/update the DSAR portal (default)
 *   read     → display the current configuration of the portal linked to the disclaimer
 *   unlink   → unlink the portal from the disclaimer (portal still exists)
 *   delete   → unlink and permanently delete the portal
 *   defaults → display platform default texts by language
 *
 * Usage:
 *   export ADOPT_USER_EMAIL=you@example.com
 *   export ADOPT_USER_PASSWORD=your-password
 *   export ORG_PATHNAME=my-org-path
 *   export DPO_USER_ID=uuid-of-responsible-user
 *
 *   npx ts-node examples/api-dsar.ts                       # create/update
 *   MODE=read     npx ts-node examples/api-dsar.ts         # read current config
 *   MODE=unlink   npx ts-node examples/api-dsar.ts         # unlink from disclaimer
 *   MODE=delete   npx ts-node examples/api-dsar.ts         # unlink + permanently delete
 *   MODE=defaults LANGUAGE=pt npx ts-node examples/api-dsar.ts
 */

import {
  AdoptProvisioningClient,
  ResumableProvisioningExecutor,
  RequestsPageProvisioner,
  Legislation,
  DsarRequestType,
  createFetcher,
} from '@adopt-tech/provisioning'
import type { Language } from '@adopt-tech/provisioning'

const ORG_PATHNAME  = process.env['ORG_PATHNAME']  ?? 'adopt-provisioning-docs-demo'
const DISCLAIMER_ID = process.env['DISCLAIMER_ID']            // optional
const DPO_USER_ID   = process.env['DPO_USER_ID']   ?? ''
const MODE          = process.env['MODE']          ?? 'create'
const LANGUAGE      = process.env['LANGUAGE'] as Language | undefined
// REQUESTS_PAGE_MASTER_ID: required for MODE=delete when the org has multiple portals.
// If omitted, delete mode resolves the masterId automatically via getLinkedDsar().
const REQUESTS_PAGE_MASTER_ID = process.env['REQUESTS_PAGE_MASTER_ID']

async function main(): Promise<void> {
  const client = new AdoptProvisioningClient({
    environment: 'staging',
    username: process.env['ADOPT_USER_EMAIL'] ?? 'you@example.com',
    password: process.env['ADOPT_USER_PASSWORD'] ?? 'your-password',
  })

  const fetcher = createFetcher(client)

  if (MODE === 'read') {
    // ── Read the current configuration of the linked portal ──────────────
    const discPage = DISCLAIMER_ID
      ? await fetcher.disclaimers({ id: DISCLAIMER_ID }).fetch()
      : await fetcher.organizations({ pathname: ORG_PATHNAME }).disclaimers().fetch()
    const disc = discPage.data[0]
    if (!disc) throw new Error(`Disclaimer not found for ${ORG_PATHNAME}`)

    const dsar = await fetcher.disclaimers({ id: disc.id }).getLinkedDsar()
    if (!dsar) {
      console.log('No DSAR portal linked to this disclaimer.')
      return
    }

    const page = dsar.page
    console.log('Linked DSAR portal:')
    console.log('  masterId:  ', dsar.requestsPageMasterId)
    console.log('  Name:      ', page.name)
    console.log('  DPO:       ', page.user_dpo_id)
    console.log('  Languages: ', page.language_configuration?.languages?.join(', ') ?? '—')
    console.log('  Fields:    ', page.extra_fields?.join(', ') ?? '(none)')
    console.log(
      '  Requests:  ',
      page.requests_page_requests.map((r) => `${r.legislation}(${r.requests.length})`).join(', '),
    )
    console.log(
      '  Texts:     ',
      page.requests_page_texts.map((t) => t.language).join(', ') || '(platform defaults)',
    )
    const docs = page.requests_page_docs?.[0]
    console.log(
      '  Documents: ',
      [
        docs?.document_master_privacy_id && 'privacy',
        docs?.document_master_cookies_id && 'cookies',
        docs?.document_master_terms_id   && 'terms',
      ]
        .filter(Boolean)
        .join(', ') || '(none)',
    )
    console.log('  Style:     ', JSON.stringify(page.requests_page_styles?.[0]?.style ?? {}))
    console.log('  Link:      ', fetcher.dsarPortalUrl(dsar.requestsPageMasterId))
    return
  }

  if (MODE === 'unlink' || MODE === 'delete') {
    // ── Unlink the portal from the disclaimer ─────────────────────────────
    // After unlinking, the disclaimer no longer shows the opt-out link to the portal.
    // The portal still exists and can be linked to another disclaimer.
    const discPage = DISCLAIMER_ID
      ? await fetcher.disclaimers({ id: DISCLAIMER_ID }).fetch()
      : await fetcher.organizations({ pathname: ORG_PATHNAME }).disclaimers().fetch()
    const disc = discPage.data[0]
    if (!disc) throw new Error(`Disclaimer not found for ${ORG_PATHNAME}`)

    let masterId = REQUESTS_PAGE_MASTER_ID
    if (!masterId) {
      const dsar = await fetcher.disclaimers({ id: disc.id }).getLinkedDsar()
      if (!dsar) { console.log('No portal linked.'); return }
      masterId = dsar.requestsPageMasterId
    }

    console.log(`Unlinking portal ${masterId} from disclaimer ${disc.id}…`)
    await client.unlinkRequestPage(disc.id)
    console.log('✓ Portal unlinked')

    if (MODE === 'delete') {
      console.log('Deleting portal…')
      await client.deleteRequestsPage(masterId)
      console.log('✓ Portal permanently deleted')
    }
    return
  }

  if (MODE === 'defaults') {
    // ── Platform default texts ────────────────────────────────────────────
    // These are the values the hub renders when the portal has no custom texts.
    // Useful to pre-populate UI forms.

    const defaults = await fetcher.dsarDefaults(LANGUAGE)

    if (LANGUAGE) {
      const entry = defaults[0]
      if (!entry) throw new Error(`Language '${LANGUAGE}' not found`)

      console.log(`Default texts — ${entry.language}`)
      console.log()
      console.log('Title:        ', entry.texts.title)
      console.log('Introduction: ', entry.texts.introduction.replace(/\n/g, ' ').slice(0, 80) + '…')
      console.log('Docs heading: ', entry.texts.docsTitle)
      console.log('Submit button:', entry.texts.buttons.send)
      console.log()
      console.log('Field labels:')
      console.log('  Email:      ', entry.texts.fields.email.name)
      console.log('  Name:       ', entry.texts.fields.name.name)
      console.log('  Country:    ', entry.texts.fields.country.name)
      console.log('  Notes:      ', entry.texts.fields.obs.name)
      console.log('  Document:   ', entry.texts.fields.document.name)
      console.log()
      console.log('Request type labels:')
      const r = entry.texts.requests
      console.log('  dataExistence:           ', r.dataExistence)
      console.log('  dataAccess:              ', r.dataAccess)
      console.log('  dataCorrection:          ', r.dataCorrection)
      console.log('  dataSharingInformation:  ', r.dataSharingInformation)
      console.log('  dataAnonymization:       ', r.dataAnonymization)
      console.log('  dataRemoval:             ', r.dataRemoval)
      console.log('  dataPortability:         ', r.dataPortability)
      console.log('  consentRevocation:       ', r.consentRevocation)
      console.log('  consentRefusal:          ', r.consentRefusal)
      console.log('  automatedDecisionReview: ', r.automatedDecisionReview)
      console.log('  doNotSellData:           ', r.doNotSellData)
    } else {
      console.log(`${defaults.length} available languages:`)
      console.log(defaults.map((d) => d.language).sort().join(', '))
    }
    return
  }

  // ── 1. Resolve disclaimer ─────────────────────────────────────────────────
  // If DISCLAIMER_ID is set, fetch directly by ID (useful when the org has multiple
  // disclaimers and data[0] may not be the correct one).

  const discPage = DISCLAIMER_ID
    ? await fetcher.disclaimers({ id: DISCLAIMER_ID }).fetch()
    : await fetcher.organizations({ pathname: ORG_PATHNAME }).disclaimers().fetch()
  const disc = discPage.data[0]
  if (!disc)
    throw new Error(
      DISCLAIMER_ID
        ? `Disclaimer ${DISCLAIMER_ID} not found`
        : `No disclaimer found for ${ORG_PATHNAME}`,
    )
  console.log(`✓ Disclaimer: ${disc.id}`)

  // ── 2. Resolve document masters linked to the disclaimer ──────────────────
  // Uses documents already linked to the disclaimer to populate the portal toggles.

  const disclaimerDocs  = await fetcher.disclaimers({ id: disc.id }).getDocuments()
  const privacyMasterId = disclaimerDocs?.document_master_privacy_id
  const cookiesMasterId = disclaimerDocs?.document_master_cookies_id
  const termsMasterId   = disclaimerDocs?.document_master_terms_id

  console.log('Documents linked to disclaimer:')
  console.log(`  Privacy: ${privacyMasterId ?? '(not linked)'}`)
  console.log(`  Cookies: ${cookiesMasterId ?? '(not linked)'}`)
  console.log(`  Terms:   ${termsMasterId   ?? '(not linked)'}`)

  // ── 3. Create/update the DSAR portal ─────────────────────────────────────
  // RequestsPageProvisioner links the DSAR portal to the disclaimer.
  // organizationId is resolved automatically from the disclaimerId.

  const executor = new ResumableProvisioningExecutor({ client, config: {} })

  const dsar = new RequestsPageProvisioner('dsar', {
    name:      'Requests Portal',
    dpoUserId: DPO_USER_ID,

    languages: {
      fallback:  'pt',
      languages: ['pt', 'en'],
    },

    texts: [
      {
        language:     'pt',
        title:        'Seus direitos de privacidade',
        introduction: 'Aqui você pode exercer seus direitos previstos na LGPD e outras legislações.',
      },
      {
        language:     'en',
        title:        'Your privacy rights',
        introduction: 'Here you can exercise your rights under GDPR and other regulations.',
      },
    ],

    // NOTE: documents are not inherited between versions — always pass IDs explicitly
    // to keep them. Omitting or passing {} clears all document links.
    documents: { privacyMasterId, cookiesMasterId, termsMasterId },

    requests: [
      {
        legislation: Legislation.LGPD,
        requests: [
          DsarRequestType.DataAccess,
          DsarRequestType.DataRemoval,
          DsarRequestType.DataPortability,
          DsarRequestType.DataCorrection,
        ],
      },
      {
        legislation: Legislation.GDPR,
        requests: [
          DsarRequestType.DataAccess,
          DsarRequestType.DataRemoval,
          DsarRequestType.DataPortability,
        ],
      },
    ],
  })

  console.log('\nCreating/updating DSAR portal…')
  const result = await executor.executeForDisclaimer(disc.id, [dsar])

  if (!result.success) throw new Error(`Failed: ${result.error}`)
  console.log('✓ DSAR portal created/updated')

  console.log()
  console.log('DSAR portal configured:')
  console.log('  Name:      Requests Portal')
  console.log('  DPO:       ' + DPO_USER_ID)
  console.log('  Languages: pt, en (fallback: pt)')
  console.log(
    '  Documents: privacy=' + (privacyMasterId ? '✓' : '—') +
    '  cookies='             + (cookiesMasterId ? '✓' : '—') +
    '  terms='               + (termsMasterId   ? '✓' : '—'),
  )
  console.log('  LGPD:      Access, Removal, Portability, Correction')
  console.log('  GDPR:      Access, Removal, Portability')

  const linkedDsar = await fetcher.disclaimers({ id: disc.id }).getLinkedDsar()
  if (linkedDsar)
    console.log('  Link:      ', fetcher.dsarPortalUrl(linkedDsar.requestsPageMasterId))
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
