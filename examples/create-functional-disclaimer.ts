/**
 * Create a fully functional disclaimer (Online-ready) on staging
 *
 * Builds the complete tree required for the disclaimer to reach "Online" status:
 *   Organization
 *     └── Disclaimer
 *           ├── Style          (visual config — required for branded UI)
 *           ├── Terms doc      (legal — required)
 *           ├── Privacy doc    (legal — required)
 *           ├── Cookie doc     (legal — required for Online status)
 *           └── Optout         (LGPD/GDPR data subject rights — required)
 *
 * `rollbackOnError: true` is set so that any failure mid-tree triggers cleanup
 * of all entities created in this run, leaving the org tree in its pre-run state.
 *
 * After execution the script verifies the result by fetching the org and
 * disclaimer back via the fetcher API.
 *
 * Usage:
 *   # .env
 *   #   ADOPT_USER_TOKEN=<cognito-jwt>
 *
 *   # Dry-run (no API calls — prints planned tree only)
 *   npx ts-node examples/create-functional-disclaimer.ts --dry-run
 *
 *   # Real provisioning
 *   npx ts-node examples/create-functional-disclaimer.ts
 */

import {
  AdoptProvisioningClient,
  ResumableProvisioningExecutor,
  OrganizationProvisioner,
  DisclaimerProvisioner,
  DisclaimerStyleProvisioner,
  TermsDocumentProvisioner,
  PrivacyDocumentProvisioner,
  CookieDocumentProvisioner,
  OptoutProvisioner,
  createFetcher,
} from '@adopt-tech/provisioning'

const isDryRun = process.argv.includes('--dry-run')

const STATE_ID = 'example-functional-disclaimer'
const ORG_PATH = 'example-functional-org'
const ORG_NAME = 'Example Functional Org'
const DOMAIN = 'https://example.com'

async function main(): Promise<void> {
  const token = process.env['ADOPT_USER_TOKEN']
  if (!token) throw new Error('ADOPT_USER_TOKEN env var is required')

  const client = new AdoptProvisioningClient({
    environment: 'staging',
    token,
  })

  // ── 1. Build the provisioner tree ─────────────────────────────────────────

  // Organization — the top-level entity. Synthetic ID 'example-org' is used by
  // children to reference it; it gets resolved to a real UUID at execution.
  const org = new OrganizationProvisioner('example-org', {
    name: ORG_NAME,
    pathName: ORG_PATH,
  })

  // Disclaimer — the cookie banner config. organizationId is resolved from the
  // parent org at execution time.
  const disclaimer = new DisclaimerProvisioner('example-disclaimer', {
    name: 'Main Banner',
    domains: [DOMAIN],
  })

  // Visual style
  disclaimer.addChild(
    new DisclaimerStyleProvisioner('example-style', {
      primaryColorLight: '#00DD80',
      textColorLight: '#34464C',
      backgroundColorLight: '#FFFFFF',
      positionController: 'right',
      disclaimerTheme: 'modern',
    }),
  )

  // Terms-of-use document (PT)
  disclaimer.addChild(
    new TermsDocumentProvisioner('example-terms', {
      language: 'pt',
      organizationId: '', // resolved from grandparent org at runtime
      url: `${DOMAIN}/terms.pdf`,
    }),
  )

  // Privacy policy document (PT)
  disclaimer.addChild(
    new PrivacyDocumentProvisioner('example-privacy', {
      language: 'pt',
      organizationId: '',
      url: `${DOMAIN}/privacy.pdf`,
    }),
  )

  // Cookie policy document (PT) — REQUIRED for the disclaimer to reach Online
  disclaimer.addChild(
    new CookieDocumentProvisioner('example-cookie-doc', {
      language: 'pt',
      organizationId: '',
      noDoc: false,
      documentName: 'Cookie Policy',
    }),
  )

  // Optout / data subject rights page
  disclaimer.addChild(
    new OptoutProvisioner('example-optout', {
      noOptOut: false,
      optOutEmail: 'dpo@example.com',
      pageName: 'Manage your consent',
    }),
  )

  org.addChild(disclaimer)

  // ── 2. Execute with rollbackOnError: true ─────────────────────────────────
  // If any provisioner fails, the executor will delete every entity it created
  // in this run (in reverse dependency order). Re-running the same stateId
  // resumes / skips already-completed provisioners (idempotent).

  const executor = new ResumableProvisioningExecutor({
    client,
    stateId: STATE_ID,
    config: {
      isDryRun,
      rollbackOnError: true,
    },
  })

  console.log(isDryRun ? '[dry-run] no API calls will be made' : 'Provisioning…')
  const result = await executor.execute({ organizations: [org] })

  if (!result.success) {
    console.error('✗ Provisioning failed:', result.error)
    console.error('  rollback was attempted automatically')
    process.exit(1)
  }
  console.log('✓ Provisioning completed')
  if (isDryRun) return

  // ── 3. Verify by fetching the result back ─────────────────────────────────

  const fetcher = createFetcher(client)

  const orgPage = await fetcher.organizations({ pathname: ORG_PATH }).fetch()
  const orgRecord = orgPage.data[0]
  if (!orgRecord) {
    console.error('✗ Org not found after provisioning')
    process.exit(1)
  }
  console.log(`✓ Org:        ${orgRecord.id} (${orgRecord.pathname})`)

  const discPage = await fetcher.organizations({ id: orgRecord.id }).disclaimers().fetch()
  const disc = discPage.data[0]
  if (!disc) {
    console.error('✗ Disclaimer not found after provisioning')
    process.exit(1)
  }
  console.log(`✓ Disclaimer: ${disc.id} (${disc.pathname})`)
  console.log(`✓ Status:     ${disc.disclaimer_status_id ?? 'n/a'}`)

  console.log('\nNext steps to bring the disclaimer Online:')
  console.log(`  1. Inject the script tag on ${DOMAIN}:`)
  console.log(`     <script src="https://tag.goadopt.io/injector.js?website_id=${disc.id}"></script>`)
  console.log('  2. Trigger a scan (see examples/scan-and-recategorize.ts)')
  console.log('  3. Verify installation: client.checkDisclaimerInstallation(disclaimerId)')
}

main().catch((err) => {
  console.error('Example failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
