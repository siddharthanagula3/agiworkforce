# API gateway hosting

Status: Current

The API gateway is deployed to separate Fly applications for staging and
production. Application names and public URLs belong to protected GitHub
environments; the TOML files contain only portable runtime configuration.

## Required protected environments

`staging-gateway`:

- secret `FLY_API_TOKEN`
- variable `FLY_GATEWAY_STAGING_APP`
- variable `GATEWAY_STAGING_URL`

`production-gateway`:

- secret `FLY_API_TOKEN`
- secret `AGI_DATABASE_URL` for the read-only migration-ledger verification
- variable `FLY_GATEWAY_PRODUCTION_APP`
- variable `GATEWAY_PRODUCTION_URL`

Configure the gateway's runtime secrets directly on each Fly application:

- `NEON_DATABASE_URL`
- `JWT_SECRET`
- `CLERK_SECRET_KEY`
- `SIGNALING_INTERNAL_SECRET`
- `ALLOWED_ORIGINS`
- applicable managed-provider credentials
- `RATE_LIMIT_REDIS_URL` before scaling beyond one instance

Do not put secret values in these files or workflow variables.

## Promotion contract

After the exact main commit passes CI:

1. CI builds one `linux/amd64` image tagged with the verified commit SHA.
2. The image is pushed to the staging app's private Fly registry repository.
3. Staging deploys that image and must pass `/health`, `/ready`, and a WebSocket
   upgrade.
4. Production verifies the schema migration ledger without mutating it.
5. Production deploys the exact same image digest and repeats all probes.

Staging and production apps must be in the same Fly organization so production
can pull the staging registry image.

## Current replica boundary

The workflow holds each app at one machine. WebSocket pending commands and
connection routing remain process-local, so multiple replicas would lose
delivery correctness. Ticket 2C/Step 19 must externalize this state and add the
two-replica proof before increasing the machine count. `RATE_LIMIT_REDIS_URL`
solves only shared rate limiting; it does not make pending WebSocket commands
durable.
