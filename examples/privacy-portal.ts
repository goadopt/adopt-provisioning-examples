/**
 * Privacy Portal (DSAR) full setup example
 *
 * Creates an Organization → Disclaimer → RequestsPage with:
 *   - Multi-language support (PT + EN)
 *   - Custom texts per language
 *   - Linked privacy and cookie documents
 *   - LGPD legislation request types
 *
 * Usage:
 *   ADOPT_USER_EMAIL=you@example.com ADOPT_USER_PASSWORD=pass \
 *   npx ts-node examples/privacy-portal.ts
 *
 *   # Dry-run
 *   npx ts-node examples/privacy-portal.ts --dry-run
 */

import {
  login,
  AdoptProvisioningClient,
  ResumableProvisioningExecutor,
  OrganizationProvisioner,
  DisclaimerProvisioner,
  DisclaimerStyleProvisioner,
  PrivacyDocumentProvisioner,
  CookieDocumentProvisioner,
  OptoutProvisioner,
  RequestsPageProvisioner,
  createFetcher,
  Legislation,
  DsarRequestType,
  DsarExtraField,
} from '@adopt-tech/provisioning'

const isDryRun = process.argv.includes('--dry-run')

async function main() {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const email = process.env['ADOPT_USER_EMAIL']
  const password = process.env['ADOPT_USER_PASSWORD']
  if (!email || !password) throw new Error('ADOPT_USER_EMAIL and ADOPT_USER_PASSWORD are required')

  const { accessToken } = await login('staging', email, password)
  const client = new AdoptProvisioningClient({ environment: 'staging', token: accessToken })

  // ── Provisioner tree ─────────────────────────────────────────────────────
  const org = new OrganizationProvisioner('privacy-portal-org', {
    name: 'Privacy Portal Example',
    pathName: 'privacy-portal-example',
  })

  const disclaimer = new DisclaimerProvisioner('privacy-portal-disc', {
    name: 'Privacy Portal Banner',
    domains: ['https://privacyportal-example.com'],
  })

  disclaimer.addChild(new DisclaimerStyleProvisioner('pp-style', {
    primaryColorLight: '#6C5CE7',
    textColorLight: '#2D3436',
    backgroundColorLight: '#FFFFFF',
    positionController: 'left',
    positionCard: 'same',
    controllerIcon: 'adopt',
    texts: '{}',
    disclaimerTheme: 'default',
  }))

  disclaimer.addChild(new PrivacyDocumentProvisioner('pp-privacy', {
    language: 'pt',
    organizationId: '',
    url: 'https://privacyportal-example.com/privacy-policy.pdf',
  }))

  disclaimer.addChild(new CookieDocumentProvisioner('pp-cookies', {
    language: 'pt',
    organizationId: '',
    url: 'https://privacyportal-example.com/cookie-policy.pdf',
  }))

  disclaimer.addChild(new OptoutProvisioner('pp-optout', {
    noOptOut: false,
    optOutEmail: process.env['DPO_EMAIL'] ?? 'dpo@example.com',
    pageName: 'Gerencie seus consentimentos',
  }))

  // Full DSAR requests page with all optional fields
  disclaimer.addChild(new RequestsPageProvisioner('pp-dsar', {
    organizationId: '',   // resolved from grandparent org at runtime
    name: 'Privacy Portal - Direitos do Titular',
    dpoUserId: process.env['DPO_USER_ID'] ?? '',

    languages: {
      fallback: 'pt',
      languages: ['pt', 'en'],
    },

    texts: [
      {
        language: 'pt',
        title: 'Exercite seus direitos',
        introduction: 'Conforme a LGPD, você pode solicitar acesso, correção, exclusão e portabilidade dos seus dados pessoais.',
        docsTitle: 'Documentos relacionados',
      },
      {
        language: 'en',
        title: 'Exercise your rights',
        introduction: 'Under LGPD, you can request access, correction, deletion and portability of your personal data.',
        docsTitle: 'Related documents',
      },
    ],

    requests: [
      {
        legislation: Legislation.LGPD,
        requests: [
          DsarRequestType.DataAccess,
          DsarRequestType.DataCorrection,
          DsarRequestType.DataRemoval,
          DsarRequestType.DataPortability,
          DsarRequestType.ConsentRevocation,
        ],
      },
    ],

    extraFields: [DsarExtraField.Document],
  }))

  org.addChild(disclaimer)

  // ── Execute ───────────────────────────────────────────────────────────────
  const executor = new ResumableProvisioningExecutor({
    client,
    stateId: 'privacy-portal-example',
    config: { isDryRun, rollbackOnError: true },
  })

  console.log(isDryRun ? '[dry-run]' : 'Provisioning privacy portal…')
  const result = await executor.execute({ organizations: [org] })

  if (!result.success) {
    console.error('✗ Failed:', result.error)
    process.exit(1)
  }
  console.log('✓ Provisioning complete')
  if (isDryRun) return

  // ── Verify ────────────────────────────────────────────────────────────────
  const fetcher = createFetcher(client)

  const orgPage = await fetcher.organizations({ pathname: 'privacy-portal-example' }).fetch()
  const orgRecord = orgPage.data[0]
  if (!orgRecord) { console.error('✗ Org not found'); process.exit(1) }

  const discPage = await fetcher.organizations({ id: orgRecord.id }).disclaimers().fetch()
  const disc = discPage.data[0]
  if (!disc) { console.error('✗ Disclaimer not found'); process.exit(1) }

  console.log(`\n✓ Org:        ${orgRecord.name} (${orgRecord.id})`)
  console.log(`✓ Disclaimer: ${disc.pathname} (${disc.id})`)

  const domains = await fetcher.disclaimers({ id: disc.id }).getDomains()
  console.log(`✓ Domains:    ${domains.map(d => d.url).join(', ')}`)

  const opts = await fetcher.disclaimers({ id: disc.id }).getOptout()
  console.log(`✓ Optout:     email=${opts?.opt_out_email}, noOptOut=${opts?.no_opt_out}`)
}

main().catch(err => {
  console.error('Example failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
