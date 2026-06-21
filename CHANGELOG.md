# Changelog

## v2.2.29

### 📱 Fix: instant device-change detection (no stale "Waiting for this message")

- On a contact’s `devices` notification, force-refresh that contact’s device list (bypassing the 5-min USER_DEVICES cache) so the next message reaches the new/changed device immediately.
- Fail-safe (try/catch, worst case one extra usync). Pairs with the existing trust-on-change identity handling so device switches recover cleanly.

## v2.2.28

### 🔗 Fix: dependency pin so the WFTM fix installs transitively

- Bumped declared `@neelegirly/libsignal` dependency (and matching override) 1.0.32 → **1.0.33**.
- Code identical to 2.2.27 — corrects metadata so a clean `npm install` resolves the intended versions.

## v2.2.27

### 🔓 Fix: peers stuck on "Waiting for this message" (outbound retry receipts)

- `sendMessagesAgain()` now falls back to the `messageRetryManager` recent-message
  cache when `getMessage` returns nothing. Previously, with the default
  `getMessage: async () => undefined`, every incoming retry receipt died with
  "message not available", leaving the **recipient** stuck on WhatsApp's
  "Waiting for this message" placeholder forever.
- Restores upstream Baileys behaviour. No security/E2E check is touched — only a
  message we just sent is re-encrypted for the **same** recipient via the normal
  `relayMessage` path.

## v2.2.26

### 🛠️ QR-/Pairing-Login-Fix + Self-Healing WA-Web-Version

- Fixed QR/pairing login that died with `statusCode 405` ("Multi-device mismatch") because of a stale WhatsApp-Web version. Baseline updated to `2.3000.1035194821`.
- `fetchLatestBaileysVersion()` now self-heals: it reads the upstream-maintained version pin instead of a dead neelegirly `/src/` URL (which 404'd and silently pinned a stale version).
- Message-ID logic (`NEELE` signature in `generateMessageID` / `generateMessageIDV2`) preserved 1:1.
- Refreshed README: version scheme (fork version vs. WA-Web baseline), message-ID note, install/update.
- Modernized boot banner with an honest WhatsApp-Web-baseline line.
- Companion stack aligned to `2.2.26 / 1.8.10 / 1.0.32`.

## v2.2.24-ecosystem-clean

### 💖 Neelegirly Ecosystem Clean Stability Update

- Removed workspace/core confusion from documentation.
- Clarified the 4-package architecture.
- Clarified that PM2 only runs the app.
- Clarified that WA-API handles sessions internally.
- Improved beginner-facing usage documentation.
