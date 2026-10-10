# Changelog

## v2.2.32 – Single-card Multi-Device Envelope

- Neuer opt-in Helper `prepareInteractiveMessageForMd(message)`, über den
  Paketexport und `lib/Utils/interactive-envelope.js` verfügbar, mit Typen.
- Eine interaktive GIF-/Video-Karte erhält genau einen MD-Umschlag; vorhandene
  View-once-/Ephemeral-Umschläge, Medien, Knöpfe, IDs und Zitate bleiben erhalten.
- Ergänzt fehlende Device-List-Metadaten ohne Netzwerkzugriff, Medienupload,
  Nachrichtenteilung oder automatische Knopf-/Socket-Änderungen.
- Echte Protobuf-Tests für GIF und zehn Knöpfe in einer Karte, Idempotenz,
  Metadatenerhalt und Ephemeral-Nachrichten; im veröffentlichten Paket enthalten.
- Knopfdarstellung bleibt clientabhängig. Dies ist keine Zusage, dass iOS
  Native-Flow-`single_select` dadurch unterstützt.

## v2.2.31 – Message Recovery & Decryption Stability

Behebt die Hauptursachen für dauerhaftes „Warte auf diese Nachricht" / "Waiting for this message".
Gefunden an einem Produktiv-Bot über die Signal-Schlüsseldateien (registrationId je Session).

### 🔐 Entschlüsseln: Gerät des Absenders bleibt erhalten
- `Utils/decode-wa-message.js`: `normalizeDecryptJid` benutzte `jidNormalizedUser` und strich damit die
  Gerätenummer weg. Ein `pkmsg` von WhatsApp Web (z. B. Gerät 5) baute seine Session im Datensatz von
  Gerät 0 (Handy) und wurde dort die offene Session; Nachrichten an das Handy waren danach mit dem
  Schlüssel des anderen Geräts verschlüsselt. Das Gerät kommt jetzt aus `participant`/`from` (auch
  wenn `participant_pn` keins trägt).

### 🔁 Retry / Neuzustellung
- `relayMessage`: bei gezielter Neuzustellung bleiben Server + JID des anfragenden Geräts erhalten.
  Vorher entstand im Gruppenzweig `<lid-nummer>:<gerät>@s.whatsapp.net` — eine Nummer, die es nicht gibt.
  (Gleiche Fix-Klasse wie in WhiskeySockets/Baileys 7.x: `devices.push({ …, jid: participant.jid })`.)
- `sendMessagesAgain`: Session des anfragenden Geräts unter **beiden** Adressen (LID + Telefonnummer)
  frisch, damit auch der normale Sendeweg die neue Session benutzt.
- Schlüssel aus der Retry-Anfrage selbst (`<keys>`) werden für den Neuaufbau benutzt — portiert aus
  WhiskeySockets/Baileys 7.0.0-rc14 (`extractE2ESessionFromRetryReceipt`, MIT). Ohne/fehlerhaft: wie bisher vom Server.
- Hauptgerät → an alle, Zweitgerät → gezielt (wie Upstream). In Gruppen beim „an alle" keine
  Neuabfrage der Gerätelisten aller Mitglieder (vermeidet `rate-overlimit`).
- Gezielte Neuzustellung scheitert nicht mehr an einer gedrosselten Gruppenabfrage.
- Sichtbarkeit: Zeile `[ONIMAI retry] resent|failed|limit|missing` (max. 30/min, aus mit `ONIMAI_LOG_RETRY_RESEND=0`),
  da der Baileys-Logger in Bots meist `silent` steht.

### 🗝️ Signal-Sessions
- `loadSession`: Ersatz nur noch durch DASSELBE Gerät unter der anderen Adresse (PN ↔ LID), nie durch Gerät 0.
- Session-Suche beim Entschlüsseln: dasselbe Gerät unter PN + LID statt Geräte 0–99 beider Adressen
  (vorher ~200 Lesezugriffe je Nachricht); Rückgriff auf Gerät 0 nur für Altbestand (siehe oben).
- Höchstens 40 Sessions je Datensatz auch beim Neuaufbau (`initOutgoing` kappte nicht: im Feld 1207 Sessions / 1 MB für ein Gerät).

### 🧩 Bisher nur per patch-package in Onimai, jetzt im Paket
- `generateWAMessageContent`: `interactiveMessage` / `viewOnceMessage*` werden durchgereicht (Multi-Buttons, Native Flow, Carousel).
- `process-message.js`: Umfrage-Stimmen warfen `ReferenceError` (`pollMsg` vor der Initialisierung benutzt).

### 📦 Fehlende Abhängigkeiten
- `lodash` (Utils/signal.js) und `lru-cache` (Utils/message-retry-manager.js) wurden benutzt, standen aber nicht in
  `dependencies`. Ein frisches `npm i @neelegirly/baileys` brach deshalb schon beim `require` ab (betraf auch 2.2.30) —
  in Bots fiel es nur nicht auf, weil andere Pakete beides mitbrachten. Jetzt deklariert (`lru-cache ^11.1.0` wie Upstream).

### Unverändert erhalten
NEELE-Message-IDs, QR-Branding, Pairing-Code, Store, Multi-/Single-File-Auth, CommonJS, WA-Web-Versionserkennung.
Kein Merge von Baileys 7.x — nur die oben genannten Fix-Klassen.

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
