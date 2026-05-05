/**
 * Authentication patterns — three ways to authenticate against Adopt
 *
 * The SDK supports three auth modes:
 *   A. Manual login — call login() once, get a token, use it however you like
 *   B. Auto-refresh client — pass username/password; the client re-logs in when the JWT expires
 *   C. Token client — pass a pre-existing JWT (no refresh)
 *
 * Usage:
 *   # .env
 *   #   ADOPT_USER_EMAIL=you@example.com
 *   #   ADOPT_USER_PASSWORD=hunter2
 *   #   ADOPT_USER_TOKEN=<optional-existing-jwt>
 *
 *   npx ts-node examples/login.ts
 */

import { AdoptProvisioningClient, login, createFetcher } from '@adopt-tech/provisioning'

async function patternA_manualLogin(): Promise<string> {
  console.log('\n── Pattern A — manual login(staging, email, password) ──')

  const email = process.env['ADOPT_USER_EMAIL']
  const password = process.env['ADOPT_USER_PASSWORD']
  if (!email || !password) {
    throw new Error('ADOPT_USER_EMAIL and ADOPT_USER_PASSWORD must be set')
  }

  // login() resolves the staging backend URL from the environment shortcut and
  // POSTs to /api/auth/api-login. Returns { accessToken, expiresAt }.
  const { accessToken, expiresAt } = await login('staging', email, password)

  console.log('  accessToken:', `${accessToken.slice(0, 20)}…`)
  console.log('  expiresAt:  ', new Date(expiresAt * 1000).toISOString())
  return accessToken
}

async function patternB_autoRefreshClient(): Promise<void> {
  console.log('\n── Pattern B — AdoptProvisioningClient with username/password ──')

  const username = process.env['ADOPT_USER_EMAIL']
  const password = process.env['ADOPT_USER_PASSWORD']
  if (!username || !password) {
    throw new Error('ADOPT_USER_EMAIL and ADOPT_USER_PASSWORD must be set')
  }

  // The client logs in lazily on the first request and silently re-logs in
  // 30s before the JWT expires. Best for long-running scripts / daemons.
  const client = new AdoptProvisioningClient({
    environment: 'staging',
    username,
    password,
  })

  const fetcher = createFetcher(client)
  const orgs = await fetcher.organizations().fetch({ limit: 1 })
  console.log(`  fetched ${orgs.data.length} org(s) — auto-refresh client works`)
}

async function patternC_tokenClient(token: string): Promise<void> {
  console.log('\n── Pattern C — AdoptProvisioningClient with token ──')

  // Token mode: no auto-refresh. If the JWT expires mid-session the SDK will
  // attempt one reactive refresh on auth errors; if no credentials are set,
  // it surfaces an AuthenticationError. Best for short-lived scripts.
  const client = new AdoptProvisioningClient({
    environment: 'staging',
    token,
  })

  const fetcher = createFetcher(client)
  const orgs = await fetcher.organizations().fetch({ limit: 1 })
  console.log(`  fetched ${orgs.data.length} org(s) — token client works`)
}

async function main(): Promise<void> {
  // Pattern A — call login() and capture the token
  const token = await patternA_manualLogin()

  // Pattern B — credentials mode (auto-refresh)
  await patternB_autoRefreshClient()

  // Pattern C — feed the token from Pattern A back into a token-mode client
  // (or use the value of process.env.ADOPT_USER_TOKEN if you already have one)
  await patternC_tokenClient(process.env['ADOPT_USER_TOKEN'] ?? token)

  console.log('\nAll three auth patterns succeeded.')
}

main().catch((err) => {
  console.error('Auth example failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
