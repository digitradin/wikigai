# Database backups (offsite copy)

Encrypted PostgreSQL snapshots of the **production** database `wikigai_db` (container `wikigai-prod-db`).
They are kept here so a rollback does not depend on one machine or one VPS.

| File | Meaning |
|---|---|
| `db/prod/wikigai-prod_N.dump.age` | newest snapshot (taken before deploying **v20261114b**, 2026-11-14 12:51 UTC) |
| `db/prod/wikigai-prod_N-1.dump.age` | previous snapshot (2026-11-14 03:17 UTC) |
| `db/prod/MANIFEST.txt` | sizes, sha256, table and user counts of both |

## Encryption

`age` (x25519). Ciphertext only — the private key is **not** in this repository and never will be.
Recipient public key: `/etc/wikigai-backup.pub` on the VPS (also in `deploy/prod/pg-backup-prod.sh`).
Private key: held by the owner (CTO key store, `wikigai-backup-age.key`).

## Restore

```bash
# decrypt
age -d -i <wikigai-backup-age.key> wikigai-prod_N.dump.age > prod.dump        # must start with "PGDMP"
# load into a fresh database
docker exec -i wikigai-prod-db pg_restore -U "$POSTGRES_USER" -d wikigai_db --clean --if-exists < prod.dump
```

Verify the sha256 against `MANIFEST.txt` before restoring. Never restore a dump you cannot decrypt.

## What is not here

Nothing unencrypted, no `.env`, no keys, no email addresses. The dumps contain password hashes and
`email_enc` blobs exactly as the database holds them.
