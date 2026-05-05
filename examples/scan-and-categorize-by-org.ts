/**
 * Scan and categorize — starting from an org pathname
 *
 * Use this when everything is already provisioned and you just want to:
 *   1. Resolve the org + disclaimer from a known pathname
 *   2. Trigger a fresh scan and wait for it to complete
 *   3. Fetch the discovered tags
 *   4. Apply your categorization rules and publish
 *
 * Usage:
 *   export ADOPT_USER_EMAIL=you@example.com
 *   export ADOPT_USER_PASSWORD=your-password
 *   export ORG_PATHNAME=my-org-path
 *
 *   npx ts-node examples/scan-and-categorize-by-org.ts
 */

import {
  AdoptProvisioningClient,
  ResumableProvisioningExecutor,
  TagCategoriesProvisioner,
  TagCategory,
  ScanManager,
  ScanState,
  createFetcher,
  isTagBlocked,
} from '@adopt-tech/provisioning'
import type { Tag, TagCategoryEntry } from '@adopt-tech/provisioning'

const ORG_PATHNAME = process.env['ORG_PATHNAME'] ?? 'acme-typography-test-1777656967716'

async function main(): Promise<void> {
  const username = process.env['ADOPT_USER_EMAIL'] ?? 'you@example.com'
  const password = process.env['ADOPT_USER_PASSWORD'] ?? 'your-password'

  const client = new AdoptProvisioningClient({ environment: 'staging', username, password })
  const fetcher = createFetcher(client)

  // ── 1. Resolve org + disclaimer from pathname ──────────────────────────────

  const discPage = await fetcher.organizations({ pathname: ORG_PATHNAME }).disclaimers().fetch()
  const disc = discPage.data[0]
  if (!disc) throw new Error(`No disclaimer found for org ${ORG_PATHNAME}`)
  console.log(`✓ Disclaimer: ${disc.id}`)

  // ── 2. Run scan and wait for completion ────────────────────────────────────
  // If the latest scan is already completed, skip triggering a new one.

  const scanManager = new ScanManager(client)
  const existingScan = await scanManager.poll(disc.id)

  let scan = existingScan
  if (existingScan?.state !== ScanState.Completed) {
    console.log('\nTriggering scan (waiting up to 10 min)…')
    scan = await scanManager.triggerAndWait(disc.id, {
      timeoutMs: 600_000,
      pollIntervalMs: 10_000,
      onProgress: (state) => process.stdout.write(`  state: ${state}\r`),
    })
    console.log('')
  }

  if (scan?.state !== ScanState.Completed) {
    throw new Error(`Scan did not complete: state=${scan?.state}`)
  }
  console.log(`✓ Scan completed (${scan.id})`)

  // ── 3. Fetch discovered tags ───────────────────────────────────────────────
  // fetch() auto-resolves the current tags_version — always returns tags from
  // the latest scan, never stale versions.

  const { blocked, notBlocked, total } = await fetcher
    .tags({ disclaimerId: disc.id })
    .fetchWithBlockStatus()

  console.log(`\n✓ Tags found: ${total}`)
  console.log(`  🔴 Blocked:     ${blocked.length}`)
  console.log(`  🟢 Not blocked: ${notBlocked.length}`)

  const allTags = [...blocked, ...notBlocked]
  for (const tag of allTags) {
    const status = isTagBlocked(tag) ? 'blocked' : 'active'
    console.log(`  • ${tag.name.padEnd(30)} [${tag.tags_category?.name ?? tag.tag_category}] — ${status}`)
  }

  // ── 4. Apply categorization rules ─────────────────────────────────────────

  const reclassified = categorizeTags(allTags)

  if (reclassified.length === 0) {
    console.log('\nNo tags to update.')
    return
  }

  console.log(`\nUpdating ${reclassified.length} tag(s)…`)

  const executor = new ResumableProvisioningExecutor({ client, config: {} })
  const result = await executor.executeForDisclaimer(disc.id, [
    new TagCategoriesProvisioner('cats', { tags: reclassified }),
  ])

  if (!result.success) throw new Error(`Tag update failed: ${result.error}`)
  console.log('✓ Tag categories published')
}

// ── Categorization rules — implement your logic here ──────────────────────────
// Receives all tags from the latest scan. Return a TagCategoryEntry for each
// tag you want to change. Tags omitted from the return array keep their
// current category. Use the TagCategory enum for the available values:
//
//   TagCategory.Required | Statistics | Marketing | Functional | Performance | Unknown

function categorizeTags(tags: Tag[]): TagCategoryEntry[] {
  const first = tags[0]
  if (!first) return []

  return [{ id: first.id, tagCategory: TagCategory.Marketing }]
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
