/**
 * API: Requests page — full configuration (LGPD / Brazil)
 *
 * Configures the full "Privacy > Settings > Requests page" screen in the platform:
 *
 *   - Notifications: DPO (Data Protection Officer) — responsible user_id
 *   - Texts: title, introduction and documents heading (per language)
 *   - Optional fields: full name, country of origin, observations
 *   - Documents: links existing document_masters from the disclaimer
 *   - LGPD request types: all 11 rights under Law 13.709/2018
 *   - Visual style: colors, fonts, margins and border radius
 *
 * Operation modes:
 *   CREATE_ONLY=true  → creates the portal; hub fills in text/type defaults at read time
 *   CREATE_ONLY=false → full configuration with custom texts, types and documents (default)
 *
 * Document prerequisite:
 *   Documents (Privacy Policy, Cookie Policy, Terms of Service) must exist on the
 *   disclaimer before being linked. Use api-documentos.ts to create them.
 *
 * Usage:
 *   export ADOPT_USER_EMAIL=you@example.com
 *   export ADOPT_USER_PASSWORD=your-password
 *   export ORG_PATHNAME=my-org-path
 *   export DPO_USER_ID=uuid-of-responsible-user
 *
 *   # Create with platform defaults (no custom content):
 *   CREATE_ONLY=true npx ts-node examples/api-requisicoes.ts
 *
 *   # Full configuration with documents, style and all fields:
 *   npx ts-node examples/api-requisicoes.ts
 */

import {
  AdoptProvisioningClient,
  ResumableProvisioningExecutor,
  RequestsPageProvisioner,
  Legislation,
  DsarRequestType,
  DsarExtraField,
  createFetcher,
} from '@adopt-tech/provisioning'
import type { RequestsPageStyle } from '@adopt-tech/provisioning'

const ORG_PATHNAME = process.env['ORG_PATHNAME'] ?? 'adopt-provisioning-docs-demo'
const DPO_USER_ID  = process.env['DPO_USER_ID']  ?? ''
const CREATE_ONLY  = process.env['CREATE_ONLY']   === 'true'

// ── Platform default style (dark theme) ──────────────────────────────────────
// These are the values initialized by the platform when the portal is created.
// Override below to customize (e.g. light theme for white-background sites).
const DEFAULT_STYLE: RequestsPageStyle = {
  logo: '',
  colors: {
    background: '#303740',   // Page background
    form:       '#21262D',   // Form / card background
    title:      '#00DD80',   // Title
    texts:      '#FAFBFC',   // Body text
    button:     '#00DD80',   // Button and links
    buttonText: '#0D1117',   // Button text
  },
  fonts: {
    title:  { family: 'nunito', size: 22, lineHeight: 24 },
    texts:  { family: 'nunito', size: 16, lineHeight: 18 },
    button: { family: 'nunito', size: 14, lineHeight: 24 },
  },
  margins: {
    horizontally: 20,   // Horizontal margin (px)
    vertically:   20,   // Vertical margin (px)
  },
  rounded: {
    banner: 16,   // Form border radius (px)
    button:  6,   // Button border radius (px)
  },
}

// ── Custom style (light theme example) ───────────────────────────────────────
// Supported font families: 'nunito' | 'roboto' | 'openSans' | 'lato' | 'montserrat' | 'poppins'
// For Arial or other custom fonts, adjust via external CSS on the portal.
const CUSTOM_STYLE: RequestsPageStyle = {
  ...DEFAULT_STYLE,
  colors: {
    background: '#FFFFFF',   // White background (light theme)
    form:       '#DDDDDD',   // Light gray form
    title:      '#00DD80',   // AdOpt green title
    texts:      '#21262D',   // Dark body text
    button:     '#00DD80',   // AdOpt green button
    buttonText: '#21262D',   // Dark button text
  },
  fonts: {
    title:  { family: 'nunito', size: 22, lineHeight: 24 },
    texts:  { family: 'nunito', size: 16, lineHeight: 18 },
    button: { family: 'nunito', size: 12, lineHeight: 14 },
  },
  rounded: {
    banner: 16,    // Form border radius
    button: 50,    // Pill button
  },
}

async function main(): Promise<void> {
  const client = new AdoptProvisioningClient({
    environment: 'staging',
    username: process.env['ADOPT_USER_EMAIL'] ?? 'you@example.com',
    password: process.env['ADOPT_USER_PASSWORD'] ?? 'your-password',
  })

  const fetcher = createFetcher(client)

  // ── 1. Resolve org → disclaimer ───────────────────────────────────────────

  const discPage = await fetcher.organizations({ pathname: ORG_PATHNAME }).disclaimers().fetch()
  const disc = discPage.data[0]
  if (!disc) throw new Error(`No disclaimer found for ${ORG_PATHNAME}`)
  console.log(`✓ Disclaimer: ${disc.id}`)
  console.log(`Mode: ${CREATE_ONLY ? 'CREATE_ONLY (platform defaults)' : 'full configuration'}`)

  const executor = new ResumableProvisioningExecutor({ client, config: {} })

  if (CREATE_ONLY) {
    // ── 2a. Create portal with automatic defaults ─────────────────────────
    // When texts and requests are omitted, the database stores empty arrays, but
    // the hub fills in defaults per language/legislation at read time:
    //   getTexts()    → objectFallback(defaultTexts, customTexts)
    //   getRequests() → customRequests ?? defaultRequests ?? []
    // The portal is already functional. Use full configuration (below) to
    // override texts, types and documents with org-specific values.
    const dsar = new RequestsPageProvisioner('dsar-default', {
      name:      'Requests Portal',
      dpoUserId: DPO_USER_ID,
      languages: { fallback: 'pt', languages: ['pt'] },
    })

    console.log('\nCreating portal with platform defaults…')
    const result = await executor.executeForDisclaimer(disc.id, [dsar])
    if (!result.success) throw new Error(`Failed: ${result.error}`)
    console.log('✓ Portal created with platform defaults')

  } else {
    // ── 2b. Resolve document masters linked to the disclaimer ─────────────
    // Uses documents already linked to the disclaimer (disclaimer_documents),
    // not all org documents — ensures the portal uses the same docs as the banner.
    // Privacy Policy / Cookie Policy / Terms of Service toggles in the platform
    // correspond to these IDs — without them the toggles remain disabled.

    const disclaimerDocs  = await fetcher.disclaimers({ id: disc.id }).getDocuments()
    const privacyMasterId = disclaimerDocs?.document_master_privacy_id
    const cookiesMasterId = disclaimerDocs?.document_master_cookies_id
    const termsMasterId   = disclaimerDocs?.document_master_terms_id

    console.log('\nDocuments linked to disclaimer:')
    console.log(`  Privacy: ${privacyMasterId ?? '(not linked)'}`)
    console.log(`  Cookies: ${cookiesMasterId ?? '(not linked)'}`)
    console.log(`  Terms:   ${termsMasterId   ?? '(not linked)'}`)

    // ── 2c. Full configuration ────────────────────────────────────────────

    const dsar = new RequestsPageProvisioner('dsar-full', {
      name:      'Requests Portal',
      dpoUserId: DPO_USER_ID,

      // ── Languages ────────────────────────────────────────────────────
      languages: {
        fallback:  'pt',
        languages: ['pt'],
      },

      // ── Per-language texts ────────────────────────────────────────────
      // docsTitle: heading of the "Documents" section in the portal
      texts: [
        {
          language:     'pt',
          title:        'Requisição de dados do titular',
          introduction: 'Olá, seja muito bem-vindo!\n\nNós prezamos pela sua privacidade. ' +
            'Assim, a qualquer momento, você pode solicitar a eliminação de seus dados da nossa base de dados.\n\n' +
            'Para isso, basta seguir os passos abaixo, que sua requisição será processada o quanto antes.',
          docsTitle:    'Verifique nossos documentos',
        },
      ],

      // ── Optional form fields ──────────────────────────────────────────
      // Available fields are in DsarExtraField:
      //   Email, Name, Country, Observation, Document (ID number)
      // 'email' is always required and present — no need to declare it here.
      extraFields: [
        DsarExtraField.Name,        // Full name
        DsarExtraField.Country,     // Country of origin
        DsarExtraField.Observation, // Observations
      ],

      // ── Linked documents ─────────────────────────────────────────────
      // Links the disclaimer's document_masters to the DSAR portal.
      // NOTE: documents are not inherited between versions — always pass IDs
      // explicitly to keep them. Omitting or passing {} clears all links.
      documents: { privacyMasterId, cookiesMasterId, termsMasterId },

      // ── Request types by legislation ──────────────────────────────────
      // LGPD (Law 13.709/2018): all 11 data subject rights
      requests: [
        {
          legislation: Legislation.LGPD,
          requests: [
            DsarRequestType.DataExistence,           // Data existence
            DsarRequestType.DataAccess,              // Data access
            DsarRequestType.DataCorrection,          // Data correction
            DsarRequestType.DataSharingInformation,  // Data sharing information
            DsarRequestType.DataAnonymization,       // Data anonymization
            DsarRequestType.DataRemoval,             // Data removal
            DsarRequestType.DataPortability,         // Data portability
            DsarRequestType.ConsentRevocation,       // Consent revocation
            DsarRequestType.ConsentRefusal,          // Consent refusal
            DsarRequestType.AutomatedDecisionReview, // Automated decision review
            DsarRequestType.DoNotSellData,           // Do not sell my data
          ],
        },
      ],

      // ── Visual style ──────────────────────────────────────────────────
      // Use DEFAULT_STYLE for the platform's dark theme,
      // or CUSTOM_STYLE for a light theme.
      style: CUSTOM_STYLE,
    })

    console.log('\nApplying full configuration…')
    const result = await executor.executeForDisclaimer(disc.id, [dsar])
    if (!result.success) throw new Error(`Failed: ${result.error}`)
    console.log('✓ Requests page configured')

    console.log()
    console.log('Configuration applied:')
    console.log('  DPO:         ' + DPO_USER_ID)
    console.log('  Languages:   pt (fallback: pt)')
    console.log('  Fields:      name, country, obs')
    console.log('  Documents:   privacy=' + (privacyMasterId ? '✓' : '—') +
                               '  cookies=' + (cookiesMasterId ? '✓' : '—') +
                               '  terms='   + (termsMasterId   ? '✓' : '—'))
    console.log('  LGPD:        11 request types enabled')
    console.log('  Colors:      light theme (#FFFFFF / #00DD80)')
    console.log('  Fonts:       nunito — Title 22px, Body 16px, Button 12px')
    console.log('  Margins:     20px horizontal / 20px vertical')
    console.log('  Rounded:     Form 16px / Button 50px')
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
