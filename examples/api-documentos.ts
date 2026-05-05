/**
 * API: Banner documents (Cookie Policy, Privacy Policy, Terms of Service)
 *
 * Links external documents to the disclaimer via URL — equivalent to filling
 * the "Documents" tab in the platform settings.
 *
 * No upload required: just pass the public URL of each document.
 *
 * Operation modes (MODE):
 *   create → creates new document masters and links them via URL (default)
 *   read   → displays documents linked to the disclaimer with their URLs
 *   update → updates the URL of an existing document master (requires DOC_MASTER_ID)
 *   nodoc  → saves a "no document" version — disables the toggle without deleting the master
 *   delete → permanently deletes a document master by ID
 *
 * To edit an existing document, pass masterDocumentId — the backend creates
 * a new version of the same master instead of creating a new one.
 *
 * Usage:
 *   export ADOPT_USER_EMAIL=you@example.com
 *   export ADOPT_USER_PASSWORD=your-password
 *   export ORG_PATHNAME=my-org-path
 *
 *   npx ts-node examples/api-documentos.ts
 *   MODE=read   npx ts-node examples/api-documentos.ts
 *   MODE=update DOC_MASTER_ID=uuid npx ts-node examples/api-documentos.ts
 *   MODE=nodoc  npx ts-node examples/api-documentos.ts
 *   MODE=delete DOC_MASTER_ID=uuid npx ts-node examples/api-documentos.ts
 */

import { AdoptProvisioningClient, ResumableProvisioningExecutor, createFetcher } from '@adopt-tech/provisioning'
import {
  CookieDocumentProvisioner,
  PrivacyDocumentProvisioner,
  TermsDocumentProvisioner,
} from '@adopt-tech/provisioning/provisioners'

const ORG_PATHNAME  = process.env['ORG_PATHNAME']  ?? 'adopt-provisioning-docs-demo'
const DISCLAIMER_ID = process.env['DISCLAIMER_ID']            // optional
const MODE          = process.env['MODE']          ?? 'create'
// DOC_MASTER_ID: document_master id to update or delete (MODE=update or MODE=delete)
// Use fetcher.documents({ organizationId }) to list available IDs.
const DOC_MASTER_ID = process.env['DOC_MASTER_ID']

async function main(): Promise<void> {
  const client = new AdoptProvisioningClient({
    environment: 'staging',
    username: process.env['ADOPT_USER_EMAIL'] ?? 'you@example.com',
    password: process.env['ADOPT_USER_PASSWORD'] ?? 'your-password',
  })

  const fetcher = createFetcher(client)

  if (MODE === 'read') {
    // ── Fetch documents linked to the disclaimer ──────────────────────────
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

    const docs = await fetcher.disclaimers({ id: disc.id }).getDocuments()
    if (!docs) {
      console.log('No documents linked.')
      return
    }

    console.log()
    console.log('Linked documents:')
    const entries: Array<{
      label: string
      masterId?: string | null
      type: 'privacy' | 'cookies' | 'terms'
    }> = [
      { label: 'Privacy', masterId: docs.document_master_privacy_id, type: 'privacy' },
      { label: 'Cookies', masterId: docs.document_master_cookies_id, type: 'cookies' },
      { label: 'Terms',   masterId: docs.document_master_terms_id,   type: 'terms'   },
    ]

    for (const { label, masterId } of entries) {
      if (!masterId) { console.log(`  ${label}: (not linked)`); continue }
      const contentUrl = await fetcher.documentContentUrl(masterId)
      console.log(`  ${label}:`)
      console.log(`    Configured URL: ${contentUrl ?? '(no URL — HTML/noDoc content)'}`)
      console.log(`    Hub link:       ${fetcher.documentUrl(masterId)}`)
    }
    return
  }

  if (MODE === 'update') {
    // ── Update the URL of an existing document master ─────────────────────
    // Pass masterDocumentId to create a new version of the same master.
    // Without masterDocumentId, the backend creates a new master on every call.
    // Use fetcher.documents({ organizationId }) to list available IDs.
    if (!DOC_MASTER_ID) throw new Error('DOC_MASTER_ID is required for MODE=update')

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

    const executor = new ResumableProvisioningExecutor({ client, config: {} })

    // Example: updates only the Privacy Policy.
    // To update cookies or terms, use CookieDocumentProvisioner / TermsDocumentProvisioner
    // with the same masterDocumentId field.
    const privacyDoc = new PrivacyDocumentProvisioner('privacy-update', {
      language:         'pt',
      url:              'https://example.com/privacy-policy-v2',
      masterDocumentId: DOC_MASTER_ID,
    })

    console.log(`\nUpdating document ${DOC_MASTER_ID}…`)
    const result = await executor.executeForDisclaimer(disc.id, [privacyDoc])
    if (!result.success) throw new Error(`Failed: ${result.error}`)
    console.log('✓ New document version saved')
    return
  }

  if (MODE === 'nodoc') {
    // ── Save "no document" version for each document type ─────────────────
    // noDoc: true creates a new version marked as "no document".
    // Platform effect: toggle disabled (≠ "never configured").
    // The document_master still exists — use MODE=delete to remove it.

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

    const executor = new ResumableProvisioningExecutor({ client, config: {} })

    const cookieNoDoc  = new CookieDocumentProvisioner('cookie-nodoc',  { language: 'pt', noDoc: true })
    const privacyNoDoc = new PrivacyDocumentProvisioner('privacy-nodoc', { language: 'pt', noDoc: true })
    const termsNoDoc   = new TermsDocumentProvisioner('terms-nodoc',    { language: 'pt', noDoc: true })

    console.log('\nSaving "no document" version…')
    const result = await executor.executeForDisclaimer(disc.id, [cookieNoDoc, privacyNoDoc, termsNoDoc])
    if (!result.success) throw new Error(`Failed: ${result.error}`)
    console.log('✓ "No document" version saved — toggles disabled in platform')
    return
  }

  if (MODE === 'delete') {
    // ── Permanently delete a document master ──────────────────────────────
    // Deletes the document_master and all its versions; unlinks from disclaimers and DSAR portals.
    // Use fetcher.documents({ organizationId }) to list available IDs.
    if (!DOC_MASTER_ID) throw new Error('DOC_MASTER_ID is required for MODE=delete')
    console.log(`Deleting document master ${DOC_MASTER_ID}…`)
    await client.deleteDocument(DOC_MASTER_ID)
    console.log('✓ Document permanently deleted')
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

  // ── 2. Link documents via URL ─────────────────────────────────────────────
  // Only the URL is required — no upload needed.
  // For multiple languages, repeat the provisioners with a different language.

  const executor = new ResumableProvisioningExecutor({ client, config: {} })

  const cookieDoc  = new CookieDocumentProvisioner('cookie-doc', {
    language: 'pt',
    url: 'https://example.com/cookie-policy',
  })
  const privacyDoc = new PrivacyDocumentProvisioner('privacy-doc', {
    language: 'pt',
    url: 'https://example.com/privacy-policy',
  })
  const termsDoc   = new TermsDocumentProvisioner('terms-doc', {
    language: 'pt',
    url: 'https://example.com/terms-of-service',
  })

  console.log('\nLinking documents…')
  const result = await executor.executeForDisclaimer(disc.id, [cookieDoc, privacyDoc, termsDoc])

  if (!result.success) throw new Error(`Failed: ${result.error}`)
  console.log('✓ Documents linked')

  const disclaimerDocs = await fetcher.disclaimers({ id: disc.id }).getDocuments()
  console.log()
  console.log('Document links:')
  if (disclaimerDocs?.document_master_cookies_id)
    console.log('  Cookies: ', fetcher.documentUrl(disclaimerDocs.document_master_cookies_id))
  if (disclaimerDocs?.document_master_privacy_id)
    console.log('  Privacy: ', fetcher.documentUrl(disclaimerDocs.document_master_privacy_id))
  if (disclaimerDocs?.document_master_terms_id)
    console.log('  Terms:   ', fetcher.documentUrl(disclaimerDocs.document_master_terms_id))
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
