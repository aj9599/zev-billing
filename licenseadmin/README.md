# ZEV Billing — License Control (operator console)

A small, password-gated web app for **you, the operator** — your "4th app" on the
Pi. From it you can:

- **create** license keys (mints a signed key *and* registers it in Firestore),
- **see devices** bound to each key and when they were last online,
- **revoke / un-revoke**, **delete**, change the **device limit**, and **free a
  device slot** (move a license to a new machine).

It's a **separate Go module** (its own `go.mod`) so its Firestore dependencies
stay out of the main app. It holds the signing private key and full Firestore
access, so keep it on your machine, behind the password, not on the public net.

```
┌───────────────┐    creates/manages     ┌─────────────┐
│ License Control│ ─────────────────────▶ │  Firestore  │ ◀── activate function
│ (this app)     │   mints signed keys    │  licenses/  │     (binds devices)
└───────────────┘                         └─────────────┘
```

---

## 1. Firebase setup (one time)

In the Firebase console for your project (**ZEV-Billing**):

1. **Firestore** → *Build → Firestore Database → Create database* → **Production
   mode** → pick a region. (The deny-all rules from `firebase/firestore.rules`
   keep it private — only the function and this console reach it.)
2. **Service account** → *Project settings (gear) → Service accounts →
   Generate new private key* → downloads a JSON file. Copy it to the Pi, e.g.
   `/home/pi/zev-billing/serviceAccountKey.json`. **Do not commit it** (it's
   gitignored). This is what lets this console read/write Firestore.
3. Note your **Project ID** (Project settings → General).
4. Deploy the **activate** Cloud Function and set its secrets — see
   [`../firebase/README.md`](../firebase/README.md). Then set
   `LICENSE_ACTIVATION_URL` on the main billing app so customers' installs do
   online activation.

> The activate function and this console use the **same** Ed25519 keypair
> (`LICENSE_PRIVATE_KEY` from `../LICENSE_PRIVATE_KEY.key`, public key embedded in
> the main app). Keep them in sync.

---

## 2. Build & run on the Pi

```bash
cd licenseadmin
go build -o licenseadmin .
```

Create `/etc/zev-licenseadmin.env` (root-owned, `chmod 600`):

```
LICENSEADMIN_PORT=8090
LICENSEADMIN_PASSWORD=choose-a-strong-operator-password
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CREDENTIALS=/home/pi/zev-billing/serviceAccountKey.json
LICENSE_PRIVATE_KEY=<base64 private key from ../LICENSE_PRIVATE_KEY.key>
```

Install the service:

```bash
sudo cp licenseadmin.service /etc/systemd/system/
# edit User/paths inside it if needed
sudo systemctl daemon-reload
sudo systemctl enable --now licenseadmin
journalctl -u licenseadmin -f
```

It now serves on `http://PI_IP:8090`.

---

## 3. Add it to your dashboard (nginx)

If your three apps are reverse-proxied by nginx, add a 4th route. Two options:

**Sub-path** (e.g. `https://your-pi/licenses/`):

```nginx
location /licenses/ {
    proxy_pass http://127.0.0.1:8090/;
    proxy_set_header Host $host;
    # optional: protect with HTTP basic auth in addition to the app password
    # auth_basic "Operators"; auth_basic_user_file /etc/nginx/.htpasswd;
}
```

**Dedicated port** (e.g. `https://your-pi:8443/`): give it its own `server {}`
block proxying to `127.0.0.1:8090`.

For best safety, change the app to listen only on localhost (run behind nginx)
or restrict the port with your firewall — this console can mint licenses.

---

## 4. Daily use

- **Create key:** fill licensee + validity + device limit → *Create key* → copy
  the `ZEV-…` key and send it to the customer. They paste it into their app's
  **Settings → License**.
- **Online dot:** green = the device checked in within ~26 h (installs refresh
  every 12 h). It's "last seen", not a live ping.
- **Revoke:** flips the license off; the customer's install drops to free at its
  next check (≤12 h). **Delete** removes it entirely.
- **Free a device slot:** removes one device binding so the key can activate on a
  replacement machine.

> Keys you mint with the older `backend/cmd/licensegen` CLI also work — their
> Firestore doc is auto-created on first activation (limit 1).
