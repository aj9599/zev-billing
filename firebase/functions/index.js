// ZEV Billing — online license activation (Phase 2).
//
// HTTP Cloud Function `activate`:
//   POST { key, device_id, hostname }
//   -> verifies the vendor-signed license key (Ed25519),
//      binds the device in Firestore (one key = N devices, default 1),
//      and returns a short-lived, device-bound, signed activation receipt.
//
// The app verifies that receipt OFFLINE with the embedded public key, so brief
// outages don't lock anyone out. Firestore is never exposed to clients (see
// firestore.rules) — only this function (admin SDK) touches it.
//
// Secrets (set with `firebase functions:secrets:set ...`):
//   LICENSE_PUBLIC_KEY   base64 Ed25519 public key  (same as the app)
//   LICENSE_PRIVATE_KEY  base64 Ed25519 private key (from LICENSE_PRIVATE_KEY.key)

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

const LICENSE_PUBLIC_KEY = defineSecret("LICENSE_PUBLIC_KEY");
const LICENSE_PRIVATE_KEY = defineSecret("LICENSE_PRIVATE_KEY");

const RECEIPT_TTL_DAYS = 30;

// --- Ed25519 helpers (raw base64 keys <-> Node KeyObjects via JWK) ---

function publicKeyObject(pubB64) {
  const raw = Buffer.from(pubB64.trim(), "base64"); // 32 bytes
  return crypto.createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") },
    format: "jwk",
  });
}

function privateKeyObject(privB64) {
  const raw = Buffer.from(privB64.trim(), "base64"); // 64 bytes: seed(32) || pub(32)
  const seed = raw.subarray(0, 32);
  const pub = raw.subarray(32, 64);
  return crypto.createPrivateKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      d: seed.toString("base64url"),
      x: pub.toString("base64url"),
    },
    format: "jwk",
  });
}

function verifyToken(token, pubKeyObj) {
  token = String(token).replace(/^ZEV-/, "").trim();
  const [p, s] = token.split(".");
  if (!p || !s) throw new Error("malformed");
  const payload = Buffer.from(p, "base64url");
  const sig = Buffer.from(s, "base64url");
  if (!crypto.verify(null, payload, pubKeyObj, sig)) throw new Error("invalid signature");
  return JSON.parse(payload.toString("utf8"));
}

function signReceipt(obj, privKeyObj) {
  const payload = Buffer.from(JSON.stringify(obj), "utf8");
  const sig = crypto.sign(null, payload, privKeyObj);
  return payload.toString("base64url") + "." + Buffer.from(sig).toString("base64url");
}

exports.activate = onRequest(
  // invoker:"public" allows unauthenticated calls (self-hosted installs activate
  // anonymously; the key signature is the real auth). Without it, gen-2 functions
  // can deploy as private and return 403.
  { secrets: [LICENSE_PUBLIC_KEY, LICENSE_PRIVATE_KEY], cors: true, invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const { key, device_id: deviceId, hostname, mac } = req.body || {};
    if (!key || !deviceId) {
      return res.status(400).json({ error: "bad_request", message: "key and device_id are required" });
    }

    // 1. Verify the vendor-signed license key.
    let lic;
    try {
      lic = verifyToken(key, publicKeyObject(LICENSE_PUBLIC_KEY.value()));
    } catch (e) {
      return res.status(400).json({ error: "invalid_key", message: "This license key is not valid." });
    }

    // 2. Reject expired keys.
    if (lic.expires) {
      const exp = new Date(lic.expires);
      if (!isNaN(exp) && Date.now() > exp.getTime()) {
        return res.status(403).json({ error: "expired", message: "License expired on " + String(lic.expires).slice(0, 10) });
      }
    }

    const keyId = lic.id || crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
    const ref = db.collection("licenses").doc(keyId);

    // 3. Bind this device (transaction enforces maxActivations + revocation).
    let result;
    try {
      result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const now = new Date().toISOString();
        if (!snap.exists) {
          tx.set(ref, {
            licensee: lic.licensee || "",
            tier: lic.tier || "pro",
            maxActivations: 1,
            revoked: false,
            createdAt: now,
            devices: { [deviceId]: { hostname: hostname || "", mac: mac || "", activatedAt: now, lastSeen: now } },
          });
          return { ok: true };
        }
        const data = snap.data();
        if (data.revoked) {
          return { ok: false, code: 403, error: "revoked", message: "This license has been revoked." };
        }
        const devices = data.devices || {};
        const max = data.maxActivations || 1;
        if (devices[deviceId]) {
          devices[deviceId].lastSeen = now;
          if (hostname) devices[deviceId].hostname = hostname;
          if (mac) devices[deviceId].mac = mac;
          tx.update(ref, { devices });
          return { ok: true };
        }
        if (Object.keys(devices).length >= max) {
          return {
            ok: false,
            code: 403,
            error: "activation_limit",
            message: `This license is already active on ${Object.keys(devices).length} device(s) (limit ${max}). Remove a device or contact support.`,
          };
        }
        devices[deviceId] = { hostname: hostname || "", mac: mac || "", activatedAt: now, lastSeen: now };
        tx.update(ref, { devices });
        return { ok: true };
      });
    } catch (e) {
      console.error("activation transaction failed", e);
      return res.status(500).json({ error: "server_error", message: "Activation failed, please retry." });
    }

    if (!result.ok) {
      return res.status(result.code || 403).json({ error: result.error, message: result.message });
    }

    // 4. Issue a short-lived, device-bound receipt (capped at the license expiry).
    const now = new Date();
    let exp = new Date(now.getTime() + RECEIPT_TTL_DAYS * 86400000);
    if (lic.expires) {
      const le = new Date(lic.expires);
      if (!isNaN(le) && le < exp) exp = le;
    }
    const receipt = signReceipt(
      {
        type: "receipt",
        key_id: keyId,
        device_id: deviceId,
        licensee: lic.licensee || "",
        tier: lic.tier || "pro",
        issued: now.toISOString(),
        expires: exp.toISOString(),
      },
      privateKeyObject(LICENSE_PRIVATE_KEY.value())
    );

    return res.status(200).json({ receipt });
  }
);
