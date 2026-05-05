/**
 * Partner Integration — Full provisioning example
 *
 * Flow:
 *   1. Login with email + password
 *   2. Create Organization
 *   3. Invite an admin member to the org
 *   4. Create Disclaimer with:
 *        - Options (consent TTL, GCM, language)
 *        - Style (colors, position, theme)
 *        - Terms document (URL only)
 *        - Privacy document (URL only)
 *        - Cookie document (no-doc placeholder — generate after scan via scanId)
 *        - Optout disabled (no DSAR page)
 *        - Scan (fire-and-forget)
 *
 * Usage:
 *   export ADOPT_USER_EMAIL=you@example.com
 *   export ADOPT_USER_PASSWORD=your-password
 *
 *   # Dry-run (no API calls, shows planned tree)
 *   npx ts-node examples/partner-integration.ts --dry-run
 *
 *   # Real provisioning
 *   npx ts-node examples/partner-integration.ts
 */

import {
  AdoptProvisioningClient,
  ResumableProvisioningExecutor,
  OrganizationProvisioner,
  DisclaimerProvisioner,
  DisclaimerOptionsProvisioner,
  DisclaimerStyleProvisioner,
  TermsDocumentProvisioner,
  PrivacyDocumentProvisioner,
  CookieDocumentProvisioner,
  OptoutProvisioner,
  MemberProvisioner,
  ScanProvisioner,
  TagCategoriesProvisioner,
  MemberRole,
  ScanManager,
  ScanState,
  TagCategory,
  createFetcher,
  getInstallationSnippet,
  isTagBlocked,
} from '@adopt-tech/provisioning'
import type { Tag, TagCategoryEntry } from '@adopt-tech/provisioning'

const isDryRun = process.argv.includes('--dry-run')

// ── Config — replace with real values per tenant ────────────────────────────

const RUN_ID = Date.now()
const ORG_NAME = `Acme Typography Test ${RUN_ID}`
const ORG_PATH = `acme-typography-test-${RUN_ID}`
const DOMAIN = 'https://www.goadopt.io'
const ADMIN_EMAIL = process.env['ADOPT_USER_EMAIL'] ?? 'admin@example.com'
const TERMS_URL = `${DOMAIN}/terms-of-use.pdf`
const PRIVACY_URL = `${DOMAIN}/privacy-policy.pdf`

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const username = process.env['ADOPT_USER_EMAIL'] ?? 'you@example.com'
  const password = process.env['ADOPT_USER_PASSWORD'] ?? 'your-password'
  if (!username || !password) {
    throw new Error('ADOPT_USER_EMAIL and ADOPT_USER_PASSWORD must be set')
  }

  // Client uses credentials mode — re-authenticates automatically when JWT expires.
  const client = new AdoptProvisioningClient({
    environment: 'staging',
    username,
    password,
  })

  // ── 1. Build the provisioner tree ─────────────────────────────────────────

  const org = new OrganizationProvisioner('partner-org', {
    name: ORG_NAME,
    pathName: ORG_PATH,
  })

  // Admin member — invited to the org (not the disclaimer).
  // MemberRole.Admin: can manage disclaimers and invite other members.
  org.addChild(
    new MemberProvisioner('partner-admin', {
      email: ADMIN_EMAIL,
      role: MemberRole.Admin,
      organizationName: ORG_NAME,
    }),
  )

  const disclaimer = new DisclaimerProvisioner('partner-banner', {
    name: 'Cookie Banner',
    domains: [DOMAIN],
  })

  // Banner behaviour — GCM, language fallback
  disclaimer.addChild(
    new DisclaimerOptionsProvisioner('partner-options', {
      googleConsentMode: true,
      fallBackLanguage: 'pt',
    }),
  )

  // Visual style — anchored bottom-left, modern theme.
  disclaimer.addChild(
    new DisclaimerStyleProvisioner('partner-style', {
      primaryColorLight: '#00A86B',
      textColorLight: '#222222',
      backgroundColorLight: '#FFFFFF',
      positionController: 'left',
      disclaimerTheme: 'modern',
      typography: {
        title: { font: 'poppins', size: '18px' },
        body: { font: 'poppins', size: '13px' },
        buttons: { font: 'poppins', size: '13px' },
      },
      uniformButtons: false,
      content: [
        {
          language: 'pt',
          legislation: 'lgpd',
          content: {
            bannerTitle: 'Cookie Banner A',
            preferencesTitle: 'Cookie Preferences A',
            body: 'A We use cookies to enhance your experience. By continuing to use our website, you agree to our Cookie Policy.',
            buttons: {
              accept: 'Accept A',
              options: 'Options A',
              savePreferences: 'Save Preferences A',
              showMore: 'Show More A',
            },
          },
        },
      ],
    }),
  )

  // Terms of use — link only (no upload)
  disclaimer.addChild(
    new TermsDocumentProvisioner('partner-terms', {
      language: 'pt',
      organizationId: '', // resolved from grandparent org at runtime
      url: TERMS_URL,
    }),
  )

  // Privacy policy — link only (no upload)
  disclaimer.addChild(
    new PrivacyDocumentProvisioner('partner-privacy', {
      language: 'pt',
      organizationId: '', // resolved from grandparent org at runtime
      url: PRIVACY_URL,
    }),
  )

  // Optout disabled — tenant does not want a DSAR portal.
  disclaimer.addChild(
    new OptoutProvisioner('partner-optout', {
      noOptOut: true,
    }),
  )

  // Scan before cookie doc — fire-and-forget creates the scan record immediately.
  // CookieDocumentProvisioner with autoGenerate:true will poll for this scan's ID
  // and pass it to create_cookie_policy_document as scrap_scan_id (AiGenerating).
  // When the scan finishes, the backend Hasura trigger auto-generates the content.
  disclaimer.addChild(
    new ScanProvisioner('partner-scan', {
      mode: 'fire-and-forget',
    }),
  )

  // Cookie policy — auto-generated from scan data.
  // Polls for the latest scan (triggered above) to link scrap_scan_id.
  disclaimer.addChild(
    new CookieDocumentProvisioner('partner-cookie-doc', {
      language: 'pt',
      organizationId: '', // resolved from grandparent org at runtime
      autoGenerate: true,
      documentName: 'Cookie Policy',
    }),
  )

  org.addChild(disclaimer)

  // ── 2. Execute (idempotent — re-running the same stateId resumes/skips) ───

  const executor = new ResumableProvisioningExecutor({
    client,
    config: {
      rollbackOnError: true,
      isDryRun,
    },
  })

  console.log(isDryRun ? '[dry-run] no API calls will be made' : 'Provisioning…')
  const result = await executor.execute({ organizations: [org] })

  if (!result.success) {
    console.error('✗ Provisioning failed:', result.error)
    console.error('  rollback was attempted automatically')
    process.exit(1)
  }

  console.log('✓ Provisioning complete')
  if (isDryRun) return

  // ── 3. Verify via fetchers ─────────────────────────────────────────────────

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

  const members = await fetcher.organizations({ id: orgRecord.id }).members().fetch()
  console.log(`✓ Members:    ${members.totalCount ?? 0}`)

  const snippet = getInstallationSnippet(disc.id)
  console.log('\nInstallation snippet (paste in <head>):')
  console.log(snippet.html)
  console.log('\nNext steps to bring the disclaimer Online:')
  console.log(`  1. Inject the snippet above on ${DOMAIN}`)
  console.log('  2. Verify installation: client.checkDisclaimerInstallation(disclaimerId)')

  // ── 4. Check scan status ───────────────────────────────────────────────────
  // The ScanProvisioner above used fire-and-forget, so the scan may still be running.
  // Use ScanManager.poll() to check the current state without waiting.
  // Use ScanManager.triggerAndWait() when you need to block until completion.

  const scanManager = new ScanManager(client)
  const scan = await scanManager.poll(disc.id)
  console.log(`\n✓ Scan:  ${scan?.state ?? 'not found'} (id: ${scan?.id ?? '-'})`)

  if (scan?.state !== ScanState.Completed) {
    console.log('  Scan not yet complete. To wait for it:')
    console.log('    const done = await scanManager.triggerAndWait(disc.id, {')
    console.log('      timeoutMs: 120_000,')
    console.log("      onProgress: (state) => console.log('scan:', state),")
    console.log('    })')
    return
  }

  // ── 5. Fetch tags discovered by the scan ──────────────────────────────────
  // TagsFetcher.fetch() auto-resolves the current tags_version so you always
  // get tags from the latest completed scan, not stale past versions.

  const { blocked, notBlocked, total } = await fetcher
    .tags({ disclaimerId: disc.id })
    .fetchWithBlockStatus()

  console.log(`\n✓ Tags found by scan: ${total}`)
  console.log(`  🔴 Blocked:     ${blocked.length}`)
  console.log(`  🟢 Not blocked: ${notBlocked.length}`)

  const allTags = [...blocked, ...notBlocked]
  for (const tag of allTags.slice(0, 10)) {
    const status = isTagBlocked(tag) ? 'blocked' : 'active'
    console.log(
      `  • ${tag.name.padEnd(30)} [${tag.tags_category?.name ?? tag.tag_category}] — ${status}`,
    )
  }

  // ── 6. Edit tags — recategorize and set auto-block ────────────────────────
  // Use `TagCategory` enum to set the category for each tag.
  // Example: move every unknown tag to marketing and enable auto-blocking.
  //
  // TagCategory values: Required | Statistics | Marketing | Functional | Performance | Unknown

  const reclassified: TagCategoryEntry[] = allTags.map((t: Tag) => ({
    id: t.id,
    tagCategory: t.tag_category === TagCategory.Unknown
      ? TagCategory.Marketing   // reclassify unknown → marketing (example rule)
      : t.tag_category,         // keep existing category for everything else
    autoBlock: t.tag_category === TagCategory.Marketing,
  }))

  if (reclassified.length > 0) {
    const tagExecutor = new ResumableProvisioningExecutor({ client, config: {} })
    await tagExecutor.executeForDisclaimer(disc.id, [
      new TagCategoriesProvisioner('tag-cats', { tags: reclassified }),
    ])
    console.log(`\n✓ Tag categories updated for ${reclassified.length} tag(s)`)
  }
}

main().catch((err) => {
  console.error('Partner integration failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
