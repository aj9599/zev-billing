# ZEV Billing — Online License Activation (Firebase)

Phase 2 adds **online activation with per-device binding** on top of the offline
signed license keys. It's optional: the app only uses it when the server has
`LICENSE_ACTIVATION_URL` set to the deployed `activate` function URL. Until then,
the app keeps working with offline key verification (Phase 1).

## How it works

```
App  ──POST {key, device_id, hostname}──▶  activate (Cloud Function)
                                              │  verify key signature (Ed25519)
                                              │  Firestore txn: bind device,
                                              │     enforce maxActivations / revoked
                                              ▼
App  ◀──{ receipt }── signed, device-bound, 30-day receipt
```

- The app **verifies the receipt offline** with the embedded public key and stores
  it. A background job refreshes it every 12 h, so a brief outage never locks you
  out (the receipt is valid for 30 days).
- Firestore holds one doc per key under `licenses/{keyId}` and is **never** exposed
  to clients (`firestore.rules` denies all access — only the function touches it).

## One-time setup

Requires the **Blaze** plan (Cloud Functions + Secret Manager).

```bash
cd firebase

# 1. Log in and select / create your project
firebase login
firebase use --add            # pick your Firebase project

# 2. Install function deps
cd functions && npm install && cd ..

# 3. Store the signing keys as secrets (NOT in code).
#    Use the SAME keypair embedded in the app (backend/config/config.go /
#    LICENSE_PRIVATE_KEY.key). Paste the base64 values when prompted.
firebase functions:secrets:set LICENSE_PUBLIC_KEY
firebase functions:secrets:set LICENSE_PRIVATE_KEY

# 4. Deploy
firebase deploy --only functions,firestore:rules
```

Deploy prints the function URL, e.g.
`https://activate-xxxxx-uc.a.run.app` (gen-2) or
`https://us-central1-<project>.cloudfunctions.net/activate` (gen-1).

## Point the app at it

On the ZEV Billing server, set the env var and restart:

```
LICENSE_ACTIVATION_URL=https://.../activate
```

Now **Settings → License → Activate** performs online, device-bound activation.

## Issuing keys

Mint a signed key as before (offline, no Firebase step needed):

```bash
cd backend
go run ./cmd/licensegen sign -priv "<private-key>" -licensee "Acme AG" -days 365
```

The matching Firestore doc is **created automatically** on first activation
(`maxActivations` defaults to 1).

## Managing licenses (Firebase console → Firestore → `licenses`)

Each `licenses/{keyId}` doc:

| field            | meaning                                                        |
|------------------|----------------------------------------------------------------|
| `licensee`       | name from the key                                              |
| `tier`           | `pro`                                                          |
| `maxActivations` | how many devices may use this key (default `1`)                |
| `revoked`        | set `true` to kill the license (drops to free within ~12 h)    |
| `devices`        | map of `device_id → { hostname, activatedAt, lastSeen }`       |

- **Allow more devices:** raise `maxActivations`.
- **Move a license to a new machine:** delete the old entry from `devices`.
- **Revoke:** set `revoked: true`. On the next refresh the app clears its receipt
  and falls back to the free tier.

## Notes

- `keyId` is the `id` field inside the signed key payload (e.g. `lic_2026...`).
- The function caps the receipt expiry at the license's own expiry, so an expired
  license can't be extended by re-activation.
- CORS is enabled, but the app calls this server-to-server.
