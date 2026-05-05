/**
 * Enable TCF and assign IAB vendors on an existing disclaimer
 *
 * Layers TCF configuration on top of a disclaimer that already exists
 * (e.g. one created by examples/create-functional-disclaimer.ts):
 *
 *   1. DisclaimerOptionsProvisioner with enableTCF: true
 *   2. TcfProvisioner with the IAB vendor IDs to enable (1, 2, 32, 755 here)
 *
 * After provisioning, verifies via the fetcher API:
 *   - vendors are bound to the disclaimer
 *
 * Usage:
 *   # .env
 *   #   ADOPT_USER_TOKEN=<cognito-jwt>
 *   #   EXISTING_DISCLAIMER_ID=<uuid-of-existing-disclaimer>
 *
 *   npx ts-node examples/tcf-setup.ts
 */

import {
  AdoptProvisioningClient,
  ResumableProvisioningExecutor,
  DisclaimerOptionsProvisioner,
  createFetcher,
} from '@adopt-tech/provisioning'
import { TcfProvisioner } from '@adopt-tech/provisioning/provisioners'

// IAB TCF vendor IDs to enable on this disclaimer.
// 1=Exponential Interactive, 2=Captify, 32=AppNexus, 755=Google Advertising Products
const IAB_VENDOR_IDS = ['1', '2', '32', '755']

async function main(): Promise<void> {
  const token = process.env['ADOPT_USER_TOKEN']
  if (!token) throw new Error('ADOPT_USER_TOKEN env var is required')

  const disclaimerId = process.env['EXISTING_DISCLAIMER_ID']
  if (!disclaimerId) {
    throw new Error('EXISTING_DISCLAIMER_ID env var is required (UUID of an existing disclaimer)')
  }

  const client = new AdoptProvisioningClient({
    environment: 'staging',
    token,
  })

  // ── 1. Verify the disclaimer exists ───────────────────────────────────────

  const fetcher = createFetcher(client)
  const disc = await fetcher.disclaimers({ id: disclaimerId }).getById(disclaimerId)
  if (!disc) throw new Error(`Disclaimer ${disclaimerId} not found`)
  console.log(`Targeting disclaimer ${disclaimerId}`)

  // ── 2. Layer in TCF configuration ─────────────────────────────────────────
  // executeForDisclaimer runs children directly on the existing disclaimer
  // without needing to build a fake org/disclaimer tree.

  const executor = new ResumableProvisioningExecutor({ client })

  console.log(`Enabling TCF + ${IAB_VENDOR_IDS.length} vendor(s)…`)
  const result = await executor.executeForDisclaimer(disclaimerId, [
    // TcfProvisioner also flips enableTcf=true, so this options step is
    // shown here just to make the two-step nature explicit.
    new DisclaimerOptionsProvisioner('tcf-options', { enableTCF: true }),
    new TcfProvisioner('tcf-vendors', { vendorIds: IAB_VENDOR_IDS, enableTcf: true }),
  ])

  if (!result.success) {
    console.error('✗ TCF setup failed:', result.error)
    process.exit(1)
  }
  console.log('✓ TCF setup completed')

  // ── 5. Verify — fetch the bound vendors back ──────────────────────────────

  const vendors = await fetcher.disclaimers({ id: disclaimerId }).vendors().fetch()
  console.log(`✓ Vendors bound to disclaimer: ${vendors.totalCount ?? vendors.data.length}`)
  for (const v of vendors.data.slice(0, 10)) {
    console.log(`  - vendor_id=${v.vendor_id} version=${v.version}`)
  }
  if ((vendors.totalCount ?? 0) > 10) {
    console.log(`  … and ${(vendors.totalCount ?? 0) - 10} more`)
  }
}

main().catch((err) => {
  console.error('TCF example failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
