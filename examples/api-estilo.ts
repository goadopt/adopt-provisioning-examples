/**
 * API: Banner style
 *
 * Populates the "Style" tab in the platform settings:
 *   - Colors (Primary, Background, Text)
 *   - Positioning (Left / Right)
 *   - Fonts (Title, Body, Buttons — family, size, line-height)
 *   - Uniform Accept/Reject button style
 *
 * Operation modes (MODE):
 *   update → apply style to the disclaimer (default)
 *   read   → display the current configured style
 *
 * Note: fonts are read back as compiled CSS (e.g. "Roboto, Arial, sans-serif"),
 * not as provisioner enum values.
 *
 * Usage:
 *   export ADOPT_USER_EMAIL=you@example.com
 *   export ADOPT_USER_PASSWORD=your-password
 *   export ORG_PATHNAME=my-org-path
 *   export DISCLAIMER_ID=uuid  # optional — use when the org has multiple disclaimers
 *
 *   npx ts-node examples/api-estilo.ts
 *   MODE=read npx ts-node examples/api-estilo.ts
 */

import { AdoptProvisioningClient, ResumableProvisioningExecutor, createFetcher } from '@adopt-tech/provisioning'
import { DisclaimerStyleProvisioner } from '@adopt-tech/provisioning'

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
    // ── Read the current style of the disclaimer ──────────────────────────
    const style = await fetcher.disclaimers({ id: disc.id }).getStyle()
    if (!style) { console.log('No style configured.'); return }

    const card = style.disclaimer_css?.styles?.web?.card ?? {}

    console.log()
    console.log('Current style:')
    console.log('  Colors:')
    console.log('    Primary:    ', style.primary_color_light    ?? '(not set)')
    console.log('    Background: ', style.background_color_light ?? '(not set)')
    console.log('    Text:       ', style.text_color_light       ?? '(not set)')
    console.log('  Position:      ', style.position_controller   ?? '(not set)')
    console.log('  Uniform buttons:', style.disclaimer_css?.useButtonsWithSameColor ? 'Yes' : 'No')
    console.log('  Fonts (compiled CSS):')
    if (card['title'])
      console.log(`    Title:   ${card['title'].fontFamily}  ${card['title'].fontSize}  ${card['title'].lineHeight}`)
    if (card['textRowContent'])
      console.log(`    Body:    ${card['textRowContent'].fontFamily}  ${card['textRowContent'].fontSize}  ${card['textRowContent'].lineHeight}`)
    if (card['acceptAllButton'])
      console.log(`    Buttons: ${card['acceptAllButton'].fontFamily}  ${card['acceptAllButton'].fontSize}  ${card['acceptAllButton'].lineHeight}`)
    return
  }

  // ── 2. Apply full style ───────────────────────────────────────────────────
  // Equivalent to the "Style" tab in the platform.
  //
  // Supported fonts: 'roboto' | 'nunito' | 'openSans' | 'lato' | 'montserrat' | 'poppins'
  // The platform also shows "Arial" — use disclaimerJsonCss directly for that.
  //
  // linkColor: not yet supported as a direct field; use darkLightCss to customize.

  const executor = new ResumableProvisioningExecutor({ client, config: {} })

  const style = new DisclaimerStyleProvisioner('style', {
    // ── Colors ───────────────────────────────────────────────────────────
    primaryColorLight:    '#00DD80',   // Primary
    backgroundColorLight: '#FFFFFF',   // Background
    textColorLight:       '#21262D',   // Text

    // ── Position ─────────────────────────────────────────────────────────
    positionController: 'left',        // 'left' | 'right'

    // ── Fonts ─────────────────────────────────────────────────────────────
    typography: {
      title:   { font: 'roboto', size: '22px', lineHeight: '24px' },
      body:    { font: 'roboto', size: '16px', lineHeight: '18px' },
      buttons: { font: 'roboto', size: '12px', lineHeight: '14px' },
    },

    // ── Uniform Accept/Reject button style ────────────────────────────────
    uniformButtons: true,

    // ── Banner texts (title, body, button labels) ─────────────────────────
    // See examples/api-textos.ts to configure texts.
    content: [],
  })

  console.log('\nApplying style…')
  const result = await executor.executeForDisclaimer(disc.id, [style])

  if (!result.success) throw new Error(`Failed: ${result.error}`)
  console.log('✓ Style updated')

  console.log()
  console.log('Style applied:')
  console.log('  Colors:')
  console.log('    Primary    #00DD80')
  console.log('    Background #FFFFFF')
  console.log('    Text       #21262D')
  console.log('  Position: Left')
  console.log('  Fonts:')
  console.log('    Title   Roboto  22px  24px line-height')
  console.log('    Body    Roboto  16px  18px')
  console.log('    Buttons Roboto  12px  14px')
  console.log('  Uniform Accept/Reject: Yes')
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
