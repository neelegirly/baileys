# Changelog

## v2.2.30

### 🔧 Fix: `fetchLatestWaWebVersion()` hat nie funktioniert

- Die Guard-Zeile prüfte `match?.match[1]` statt `match?.[1]`. `match` ist das Ergebnis von
  `String.prototype.match`, hat also keine Eigenschaft `.match` — der Zugriff warf bei **jedem**
  Aufruf `TypeError: Cannot read properties of undefined (reading '1')`. Der `try/catch` schluckte
  das und gab stumm die eingebaute Baseline mit `isLatest: false` zurück.
- Die Regex selbst war korrekt. Nach dem Fix liefert die Funktion die echte Live-`client_revision`
  von `https://web.whatsapp.com/sw.js`.
- Zusätzlich `String(data)` vor dem `.match()`, damit ein nicht-String-Body (je nach
  axios-`responseType`) nicht erneut in denselben stillen Fallback läuft.

### 📌 WA-Web-Baseline aktualisiert

- `lib/Defaults/baileys-version.json`: `2.3000.1035194821` → **`2.3000.1043857760`**.
- Reiner Offline-Fallback. Der reguläre Weg bleibt `fetchLatestBaileysVersion()`, das die Version
  zur Laufzeit zieht — der Wert greift nur, wenn beim Start die Versionsquelle nicht erreichbar ist.

### ⚖️ LICENSE: Upstream-Copyright wiederhergestellt

- Der MIT-Vermerk von Rajeh Taher/WhiskeySockets fehlte. MIT verlangt ihn bei substanziellen
  Teilen der Software — dieser Fork enthält solche. Steht jetzt wieder in `LICENSE`, zusammen
  mit dem Fork-Copyright und einem Hinweis auf die Herkunft.

### 🏷️ Klarere Fork-Abgrenzung

- README-Kopf mit deutlichem „Das hier ist **NICHT** WhiskeySockets/Baileys"-Block, inkl. Hinweis,
  wohin Bug-Reports gehören und warum Upstream-Issues hier oft nicht zutreffen.
- `description` und neue `contributors` in `package.json`; `author` → `Neele Girl (neelegirly)`.
- README-Versionsangaben waren seit 2.2.26 stehengeblieben (Badges, Installationsbefehle,
  Stack-Tabelle, Release-Notes) — jetzt auf `2.2.30 / 1.8.13 / 1.0.33` und die neue WA-Baseline.
- Bild/Logo und die inhaltliche Beschreibung des Forks bleiben unverändert.

### 🧷 Bewusst NICHT angefasst

- Message-ID-Logik (`generateMessageID`, `generateMessageIDV2`, `NEELE`-Signatur) — 1:1 wie in 2.2.29.
- QR-/Pairing-Flow, Noise-Handler, Auth-State, Signal-Layer.
- Kein Upstream-Merge: Der Fork weicht strukturell zu weit ab (eigener `Store`-Layer,
  `Socket/registration.js`, `Signal/WASignalGroup/`; Upstream 7.x nutzt `whatsapp-rust-bridge`
  und hat `Store` entfernt). Ein Merge würde den Fork zerlegen, ohne ein reales Problem zu lösen.

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
