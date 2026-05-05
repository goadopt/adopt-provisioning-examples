/**
 * API: Banner texts
 *
 * Populates the "Texts" tab in the platform settings:
 *   - Title: "Control your privacy"
 *   - Body: "Our site uses cookies to improve navigation."
 *   - Buttons: Customize | Reject | Accept
 *
 * Texts are per language + legislation. Entries not listed here
 * are preserved from the previous version (backend merge).
 *
 * Usage:
 *   export ADOPT_USER_EMAIL=you@example.com
 *   export ADOPT_USER_PASSWORD=your-password
 *   export ORG_PATHNAME=my-org-path
 *
 *   npx ts-node examples/api-textos.ts
 */

import { AdoptProvisioningClient, ResumableProvisioningExecutor, createFetcher, Legislation } from '@adopt-tech/provisioning'
import type { DisclaimerTextEntry, Language } from '@adopt-tech/provisioning'
import { DisclaimerStyleProvisioner } from '@adopt-tech/provisioning'

const ORG_PATHNAME  = process.env['ORG_PATHNAME']  ?? 'adopt-provisioning-docs-demo'
const DISCLAIMER_ID = process.env['DISCLAIMER_ID']            // optional

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

  // ── 2. Apply banner texts ─────────────────────────────────────────────────
  // Equivalent to the "Texts" tab in the platform.
  //
  // content[] supports multiple languages and legislations simultaneously.
  // Only the entries listed here are overwritten — all others are preserved.
  //
  // legislation: use values from Legislation.LGPD, Legislation.GDPR, etc.

  const executor = new ResumableProvisioningExecutor({ client, config: {} })

  const texts = new DisclaimerStyleProvisioner('texts', {
    content: [
      {
        language:    'pt' as Language,
        legislation: Legislation.LGPD,
        content: {
          // Title (the "Title" field on screen)
          bannerTitle: 'Controle sua privacidade',

          // Body (the "Text" field on screen)
          body: 'Nosso site usa cookies para melhorar a navegação.',

          // Button labels (the "Buttons" section on screen)
          buttons: {
            accept:          'Aceitar',      // "Accept all" button
            reject:          'Rejeitar',     // "Reject all" button
            options:         'Customizar',   // "Customize" button (opens preferences panel)
            savePreferences: 'Salvar',       // "Save" button inside the preferences panel
          },
        },
      },
      // Add other languages/legislations as needed:
      // { language: 'en', legislation: Legislation.GDPR, content: { ... } },
    ],
  })

  console.log('\nUpdating texts…')
  const result = await executor.executeForDisclaimer(disc.id, [texts])

  if (!result.success) throw new Error(`Failed: ${result.error}`)
  console.log('✓ Texts updated')

  // ── 3. Read back to confirm ───────────────────────────────────────────────

  const lang: Language = 'pt'
  const saved = await client.fetchDisclaimerTexts(disc.id, {
    languages:    [lang],
    legislations: [Legislation.LGPD],
  })
  const ptLgpd: DisclaimerTextEntry | undefined =
    saved?.['pt']?.[Legislation.LGPD] ?? (await client.fetchDisclaimerDefaultTexts(lang)) ?? undefined

  const source = saved?.['pt']?.[Legislation.LGPD] ? 'saved' : 'platform default'

  console.log(`\nTexts pt / lgpd (${source}):`)
  console.log('  Title:       ', ptLgpd?.titles?.card          ?? '—')
  console.log('  Body:        ', ptLgpd?.bodyTexts?.card        ?? '—')
  console.log('  Accept:      ', ptLgpd?.buttons?.acceptAll     ?? '—')
  console.log('  Reject:      ', ptLgpd?.buttons?.rejectAll     ?? '—')
  console.log('  Customize:   ', ptLgpd?.buttons?.acceptCustom  ?? '—')
  console.log('  Save:        ', ptLgpd?.buttons?.showPreferences ?? '—')
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
