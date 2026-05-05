# adopt-provisioning-examples

Runnable examples for the [`@adopt-tech/provisioning`](https://www.npmjs.com/package/@adopt-tech/provisioning) SDK.

> **Note:** These examples require `@adopt-tech/provisioning` v1.1.0 (pending release).

## Setup

```bash
git clone https://github.com/goadopt/adopt-provisioning-examples.git
cd adopt-provisioning-examples
npm install
```

## Authentication

All examples read credentials from environment variables:

```bash
export ADOPT_USER_EMAIL=you@example.com
export ADOPT_USER_PASSWORD=your-password
export ORG_PATHNAME=my-org-path
```

## Examples

### Partner onboarding

```bash
# Full flow: org, member, disclaimer, style, docs, scan
npx ts-node examples/partner-integration.ts --dry-run   # preview
npx ts-node examples/partner-integration.ts             # run
```

### Banner style

```bash
npx ts-node examples/api-estilo.ts            # apply style
MODE=read npx ts-node examples/api-estilo.ts  # read current
```

### Banner texts

```bash
npx ts-node examples/api-textos.ts
```

### Banner options (GCM, consent TTL)

```bash
npx ts-node examples/api-options.ts
MODE=read npx ts-node examples/api-options.ts
```

### Documents (privacy, cookies, terms)

```bash
npx ts-node examples/api-documentos.ts                         # create/link
MODE=read   npx ts-node examples/api-documentos.ts             # read + links
MODE=update DOC_MASTER_ID=uuid npx ts-node examples/api-documentos.ts
MODE=nodoc  npx ts-node examples/api-documentos.ts             # disable
MODE=delete DOC_MASTER_ID=uuid npx ts-node examples/api-documentos.ts
```

### DSAR portal (LGPD)

```bash
npx ts-node examples/api-dsar.ts                            # create/update
MODE=read     npx ts-node examples/api-dsar.ts              # read config + link
MODE=unlink   npx ts-node examples/api-dsar.ts              # disable portal
MODE=delete   npx ts-node examples/api-dsar.ts              # delete portal
MODE=defaults LANGUAGE=en npx ts-node examples/api-dsar.ts  # platform defaults

# Full LGPD configuration (all 11 rights, style, documents)
npx ts-node examples/api-requisicoes.ts
CREATE_ONLY=true npx ts-node examples/api-requisicoes.ts    # minimal
```

### Consent metrics

```bash
npx ts-node examples/api-metricas.ts
MONTH=3 YEAR=2025 npx ts-node examples/api-metricas.ts
```

### Scanning

```bash
npx ts-node examples/scan-and-recategorize.ts
npx ts-node examples/tcf-setup.ts
```

## License

MIT
