<div align="center">

# 🌸 @neelegirly/baileys 🌸

### *Die WhatsApp-Web-API mit sauberem Neelegirly-Glow-up*
### *QR Branding · Self-Healing WA-Web-Version · Wrapper-Aware Update Notify · LID · Smart Queue*

[![npm](https://img.shields.io/npm/v/%40neelegirly%2Fbaileys?style=for-the-badge&color=ff69b4&logo=npm)](https://www.npmjs.com/package/@neelegirly/baileys)
[![wa-api](https://img.shields.io/badge/wa--api-1.8.10-c77dff?style=for-the-badge)](https://www.npmjs.com/package/@neelegirly/wa-api)
[![libsignal](https://img.shields.io/badge/libsignal-1.0.32-f4a261?style=for-the-badge)](https://www.npmjs.com/package/@neelegirly/libsignal)
[![WA-Web](https://img.shields.io/badge/WhatsApp--Web-2.3000.1035194821-25D366?style=for-the-badge&logo=whatsapp)](https://web.whatsapp.com)
[![Node](https://img.shields.io/badge/Node-16+-4caf50?style=for-the-badge&logo=node.js)](https://nodejs.org)

<p align="center">
  <img src="https://files.catbox.moe/5bqumy.jpeg" width="780" alt="@neelegirly/baileys Hero" />
</p>

<p align="center"><sub>2026 Glow-Up Edition · self-healing QR/Pairing · Companion-Stack auf <strong>2.2.26 / 1.8.10 / 1.0.32</strong></sub></p>

[**Installation**](#-installation) · [**Quickstart**](#-quickstart) · [**Was ist dieser Fork?**](#-was-ist-dieser-fork) · [**Versionsschema**](#-versionsschema) · [**Message-ID**](#-message-id-anpassung-neele) · [**Release Notes**](#-release-notes-2226)

</div>

---

## 🌷 Was ist dieser Fork?

`@neelegirly/baileys` ist ein gepflegter **Fork von [Baileys](https://github.com/WhiskeySockets/Baileys)** (multi-device WhatsApp-Web-API für Node.js). Er bleibt nah am Upstream, ergänzt aber ein paar fokussierte Neelegirly-Eigenheiten:

- 💖 **Eigene Message-ID-Generierung** (iOS-Style mit `NEELE`-Signatur) – siehe [unten](#-message-id-anpassung-neele).
- 🌐 **Self-Healing WA-Web-Version** – die Verbindung zieht sich die aktuelle WhatsApp-Web-Version automatisch, damit der QR-/Pairing-Login nicht durch veraltete Versionsangaben mit `statusCode 405` abbricht.
- 📷 **QR Branding** – Header/Footer + Versionskontext direkt im QR-Flow.
- 🔔 **Wrapper-Aware Update Notify** – Statuszeilen für Baileys **und** den optionalen `@neelegirly/wa-api`-Wrapper.
- 🎀 **Sauberer `@neelegirly/*`-Scope** mit gepinntem Begleit-Ökosystem.

> Hinweis: Dieses Projekt ist nicht offiziell mit WhatsApp, Meta oder dem Baileys-Upstream verbunden.

---

## 🧱 Architektur

```text
@neelegirly/libsignal        ← Signal-Protokoll-Krypto
        ↓
@neelegirly/baileys          ← dieser Fork · Socket, Events, Messaging
        ↓
@neelegirly/wa-api           ← Multi-Session-Wrapper (Lifecycle, QR, Update Notify)
        ↓
App (PM2 managed)
        ↓
@neelegirly/downloader       ← optionale Media-Utility
```

> **PM2-Regel:** `@neelegirly/wa-api` verwaltet Sessions intern. PM2 startet nur **die App**, nicht einen Prozess pro Session.

---

## 🔢 Versionsschema

Wichtig zu verstehen — hier laufen **zwei voneinander unabhängige** Versionsnummern:

| Nummer | Beispiel | Bedeutung |
| --- | --- | --- |
| **Fork-Version** | `2.2.26` | Die npm-Version *dieses Pakets*. Eigenes semver-Schema von Neelegirly – **nicht** identisch mit der Upstream-Baileys-Versionsnummer. |
| **WhatsApp-Web-Baseline** | `2.3000.1035194821` | Die Client-Version, die im Handshake an WhatsApp gemeldet wird. Wird zur Laufzeit aktuell gehalten (self-healing). |

Die Fork-Version `2.2.x` ist also reines Paket-Versioning. Welche WhatsApp-Web-Version tatsächlich verbunden wird, zeigt der Boot-Banner und `fetchLatestBaileysVersion()`.

---

## 💖 Message-ID-Anpassung (NEELE)

Dieser Fork erzeugt Message-IDs in einem **iOS-Style-Format mit eingebetteter `NEELE`-Signatur** (z. B. `3A…NEELE…`, 20 Zeichen). Das ist eine bewusste, dauerhafte Anpassung – `generateMessageID` und `generateMessageIDV2` werden **niemals** durch die Upstream-Variante überschrieben.

```js
const { generateMessageID } = require('@neelegirly/baileys')
generateMessageID() // → z. B. "3AC18D8ANEELE3B14420"
```

> Beim Abgleich mit dem Upstream bleibt diese Logik 1:1 erhalten.

---

## 🚀 Installation

```bash
npm install @neelegirly/baileys@2.2.26 @neelegirly/libsignal@1.0.32 --save-exact
```

```bash
yarn add @neelegirly/baileys@2.2.26 @neelegirly/libsignal@1.0.32 --exact
```

> Für den kompletten Stack passt dazu `@neelegirly/wa-api@1.8.10`.

### Update eines bestehenden Setups

```bash
npm install @neelegirly/baileys@latest @neelegirly/wa-api@latest --save-exact
```

Nach dem Update genügt ein App-Neustart. Der QR-/Pairing-Login zieht sich die aktuelle WhatsApp-Web-Version automatisch.

---

## ⚡ Quickstart

```ts
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} from '@neelegirly/baileys'

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const { version } = await fetchLatestBaileysVersion() // self-healing WA-Web-Version

  const sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: true
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') return console.log('Verbunden 💖')
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      if (statusCode !== DisconnectReason.loggedOut) start().catch(console.error)
    }
  })
}

start().catch(console.error)
```

> `fetchLatestBaileysVersion()` ist die empfohlene Quelle für `version`: Sie liefert die aktuell gültige WhatsApp-Web-Version und fällt bei Netzwerkfehlern auf die gebündelte Baseline zurück.

---

## 🧩 Companion Stack

| Paket | Version | Rolle |
|------|---------|-------|
| `@neelegirly/baileys` | `2.2.26` | Socket, Events, Messaging |
| `@neelegirly/libsignal` | `1.0.32` | Signal-Protokoll-Komponente |
| `@neelegirly/wa-api` | `1.8.10` | Lifecycle-, Session- und Update-Wrapper |

---

## 🩷 QR Branding & Update Status

Beim QR-Scan werden Markenzeilen ober- und unterhalb des QR-Codes ausgegeben. Versionen werden dynamisch aus `package.json` gelesen, Update-Status robust verarbeitet und optionaler Wrapper-Kontext aus `@neelegirly/wa-api` dargestellt. Der Boot-Banner zeigt zusätzlich die aktive **WhatsApp-Web-Baseline**.

---

## 🌐 Namespace-Migration

```diff
- import makeWASocket from '@whiskeysockets/baileys'
+ import makeWASocket from '@neelegirly/baileys'
```

---

## 📝 Release Notes `2.2.26`

- 🛠️ **QR-/Pairing-Login repariert.** Die veraltete, hartcodierte WhatsApp-Web-Version führte zu `statusCode 405` ("Multi-device mismatch") und verhinderte jeden QR-Scan. Baseline auf `2.3000.1035194821` aktualisiert.
- 🌐 **Self-Healing WA-Web-Version.** `fetchLatestBaileysVersion()` bezieht die Versionsangabe jetzt aus einer **gepflegten, immer aktuellen Quelle** statt aus einer toten URL (die zuvor mit `404` ins Leere lief und still eine veraltete Version pinnte). Künftige WhatsApp-Versions-Bumps heilen sich damit selbst.
- 🧷 **Message-ID-Logik unverändert.** Die `NEELE`-Signatur in `generateMessageID` / `generateMessageIDV2` bleibt exakt erhalten.
- 🪧 **Modernisierter Boot-Banner.** Zusätzliche, ehrliche Zeile mit der aktiven WhatsApp-Web-Baseline.
- 🔗 Companion-Stack auf `2.2.26 / 1.8.10 / 1.0.32` aktualisiert.

---

<div align="center">
<sub>Made with 🎀 by Neelegirly · Fork von WhiskeySockets/Baileys</sub>
</div>
