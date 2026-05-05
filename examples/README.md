# Examples

Each example is a complete, runnable TypeScript script. Copy and adapt for your use case.

## Prerequisites

```bash
npm install
npm run build
```

Set credentials either via environment variables or use the `login()` helper:

```bash
export ADOPT_USER_TOKEN=<your-token>
# or let the SDK handle it via login()
```

## Running examples

```bash
npx ts-node --project tsconfig.examples.json examples/<file>.ts
```

## Available examples

| File | Description |
|---|---|
| `login.ts` | 3 authentication patterns: `login()`, credentials auto-refresh, static token |
| `create-functional-disclaimer.ts` | Full disclaimer setup with rollbackOnError + dry-run mode |
| `tcf-setup.ts` | TCF layer on an existing disclaimer via `useExisting()` |
| `scan-and-recategorize.ts` | Trigger a scan and recategorize discovered tags |
| `privacy-portal.ts` | Full DSAR portal with LGPD request types, PT+EN languages |
| `partner-integration.ts` | Complete Partner integration: org → disclaimer → docs → vendors → scan |

## Authentication

```ts
import { login } from '@adopt-tech/provisioning'

const { idToken } = await login('staging', 'email@example.com', 'password')
const client = new AdoptProvisioningClient({ environment: 'staging', token: idToken })
```

## Environments

| Name | Hasura URL | Backend URL |
|---|---|---|
| `staging` | `alpha-graph.goadopt.io` | `alpha-api.goadopt.io` |
| `production` | `graph.goadopt.io` | `api.goadopt.io` |
