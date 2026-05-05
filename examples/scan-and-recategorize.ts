/**
 * Run a scan and reclassify the tags it discovers
 *
 * Full scan + categorization loop:
 *   1. Trigger a scan (wait or fire-and-forget)
 *   2. Fetch discovered tags via TagsFetcher (auto-versioned — gets current scan only)
 *   3. Reclassify tags via TagCategoriesProvisioner (save_publish_tags)
 *
 * Usage:
 *   # .env
 *   #   ADOPT_USER_TOKEN=<cognito-jwt>
 *   #   EXISTING_DISCLAIMER_ID=<uuid>
 *
 *   # Wait for scan to complete, then recategorize
 *   npx ts-node examples/scan-and-recategorize.ts
 *
 *   # Fire-and-forget — scan is queued, no recategorization
 *   npx ts-node examples/scan-and-recategorize.ts --fire-and-forget
 */

import {
  AdoptProvisioningClient,
  ResumableProvisioningExecutor,
  TagCategoriesProvisioner,
  ScanManager,
  ScanState,
  createFetcher,
} from '@adopt-tech/provisioning'
import type { Tag, TagCategoryEntry } from '@adopt-tech/provisioning'

const fireAndForget = process.argv.includes('--fire-and-forget')

async function main(): Promise<void> {
  const token = process.env['ADOPT_USER_TOKEN']
  if (!token) throw new Error('ADOPT_USER_TOKEN env var is required')

  const disclaimerId = process.env['EXISTING_DISCLAIMER_ID']
  if (!disclaimerId) {
    throw new Error('EXISTING_DISCLAIMER_ID env var is required (UUID of an existing disclaimer)')
  }

  const client = new AdoptProvisioningClient({ environment: 'staging', token })
  const fetcher = createFetcher(client)

  // ── Step 1: Scan ──────────────────────────────────────────────────────────
  const scanManager = new ScanManager(client)

  if (fireAndForget) {
    await scanManager.trigger(disclaimerId)
    console.log(
      '✓ Scan queued (fire-and-forget). Re-run without --fire-and-forget to wait + recategorize.',
    )
    return
  }

  console.log('Triggering scan and waiting for completion (up to 2min)…')
  const completedScan = await scanManager.triggerAndWait(disclaimerId, {
    timeoutMs: 120_000,
    pollIntervalMs: 5_000,
    onProgress: (state) => console.log(`  scan state: ${state}`),
  })

  if (completedScan.state !== ScanState.Completed) {
    throw new Error(`Scan did not complete cleanly: state=${completedScan.state}`)
  }
  console.log('✓ Scan completed')

  // ── Step 2: Fetch discovered tags via SDK (auto-versioned) ─────────────────
  // TagsFetcher.fetch() automatically resolves the current tags_version from
  // disclaimer_versions so only tags from the latest scan are returned.
  const { blocked, notBlocked, total } = await fetcher.tags({ disclaimerId }).fetchWithBlockStatus()

  console.log(`\n✓ Scan found ${total} tag(s):`)
  console.log(`  🔴 Blocked:     ${blocked.length}`)
  console.log(`  🟢 Not blocked: ${notBlocked.length}`)

  const allTags = [...blocked, ...notBlocked]
  for (const t of allTags.slice(0, 20)) {
    const cat = t.tags_category?.name ?? t.tag_category
    const status = isTagEffectivelyBlocked(t) ? '🔴' : '🟢'
    console.log(`  ${status} ${t.name} (category: ${cat}, auto_block: ${t.auto_block})`)
  }
  if (allTags.length > 20) console.log(`  … and ${allTags.length - 20} more`)

  // ── Step 3: Reclassify tags ───────────────────────────────────────────────
  const updates = pickTagsToRecategorize(allTags)
  if (updates.length === 0) {
    console.log('\nNo tags matched recategorization rules — done.')
    return
  }

  console.log(`\nRecategorizing ${updates.length} tag(s)…`)

  const result = await new ResumableProvisioningExecutor({ client }).executeForDisclaimer(
    disclaimerId,
    [new TagCategoriesProvisioner('recat-tags', { tags: updates, uncheckTags: false })],
  )

  if (!result.success) throw new Error(`Recategorization failed: ${result.error}`)
  console.log('✓ Tags recategorized and published')
}

/** Returns true when all cookies inside a tag are blocked (actual blocked state, not auto_block flag) */
function isTagEffectivelyBlocked(tag: Tag): boolean {
  const cookies = tag.cookies ?? []
  return cookies.length > 0 && cookies.every((c) => c.blocked)
}

/**
 * Example heuristic: tags whose category name includes "marketing" or "analytics"
 * get auto-block enabled. Replace with your own rules.
 *
 * Note: tagCategory must be the category ID from the tags_categories table,
 * not the display name. Check your tags_categories table for valid IDs.
 */
function pickTagsToRecategorize(tags: Tag[]): TagCategoryEntry[] {
  const updates: TagCategoryEntry[] = []

  for (const tag of tags) {
    const categoryName = (tag.tags_category?.name ?? '').toLowerCase()
    const isMarketing = categoryName.includes('marketing') || categoryName.includes('publicidade')
    if (!isMarketing) continue

    updates.push({
      id: tag.id,
      tagCategory: tag.tag_category, // keep same category, just set autoBlock
      autoBlock: true,
    })
  }

  return updates
}

main().catch((err) => {
  console.error('Scan example failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
