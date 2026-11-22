# Changelog

## v2.3.1 – libsignal 1.0.35 — Event-Loop-Freigabe beim Durchprobieren vieler Sitzungen

- Abhängigkeit `@neelegirly/libsignal` exakt auf `1.0.35` angehoben (in `dependencies` und `overrides`).
- libsignal 1.0.35 lässt beim Durchprobieren der Sitzungen eines Datensatzes nach spätestens 15 ms den
  Event-Loop laufen (`setImmediate`). Reihenfolge und Ergebnis bleiben gleich.
- Gemessen über `makeLibSignalRepository().decryptMessage` (Node 22, frische Produktivinstallation,
  Datensatz mit 2 850 Sitzungen, Nachricht mit falschem MAC, je 3 Läufe):
  - 1.0.34: längste Event-Loop-Blockade 1 802–2 228 ms (ein einziger Block, Gesamtdauer gleich).
  - 1.0.35: längste Blockade 43–54 ms (davon ~20–25 ms das Laden des Datensatzes), Gesamtdauer
    1,8–2,1 s, dazwischen laufen Timer und andere Sitzungen weiter.
- PATCH, weil sich weder API noch Verhalten ändern. Sonst keine Abhängigkeit geändert.

## v2.3.0 – Schlanker, sauberer Verbindungsabbau, echte Tests

- Abhängigkeit `@neelegirly/libsignal` auf `1.0.34` angehoben (veröffentlicht).

MINOR, weil sich die Installation ändert (optionale Peer-Abhängigkeiten).
Öffentliche API und Fehlerform (`lastDisconnect.error.output.statusCode`) bleiben gleich.

### 📦 Abhängigkeiten
- Entfernt (im Code nicht geladen bzw. nativ ersetzt): `futoin-hkdf`, `uuid`, `node-cache`,
  `libphonenumber-js`, `lodash` (`chunk` jetzt nativ in `lib/Utils/chunk.js`, gleiche Randfälle).
- Optionale Peer-Abhängigkeiten statt fester Abhängigkeiten:
  - `audio-decode` (^2.1.3) – nur für die Wellenform bei Sprachnachrichten. Ohne das Paket wird die
    Nachricht wie bisher bei Fehlern ohne Wellenform gebaut.
  - `cache-manager` (^4.0.1) – nur für `makeCacheManagerAuthState`; wird erst beim Aufruf geladen.
    Ohne das Paket: Fehler mit Installationshinweis. Der Typ hängt nicht mehr an `cache-manager`.
- Unverändert: axios, @hapi/boom, async-mutex, pino, protobufjs, ws, @cacheable/node-cache,
  lru-cache, music-metadata, @adiwajshing/keyed-db, @neelegirly/libsignal (1.0.33).
- Gemessen (frisches `npm ci --omit=dev --ignore-scripts`, Node 22): direkte Abhängigkeiten 18 → 11,
  Pakete 128 → 101, `node_modules` 72 240 → 25 320 KiB (`du -sk`). `require()`-Kaltstart unverändert
  (Median 469 → 466 ms, n = 21, im Rauschen). Paket: 1 131 690 → 1 136 537 Byte (4 neue kleine Dateien).

### 🔌 Verbindungsabbau und mehrere Sitzungen
- `end()` beendet wartende Abfragen (`query`, Handshake, `waitForSocketOpen`) sofort mit
  `Connection Closed` (428). Vorher hingen sie nach dem Schließen bis zu ihrem Timeout (20–60 s).
- Beim Schließen werden die vom Socket **selbst erzeugten** Caches geschlossen (stoppt ihre
  Prüf-Intervalle, die bisher je Wiederverbindung liegen blieben). Vom Aufrufer übergebene Caches
  (`msgRetryCounterCache`, `userDevicesCache`, …) bleiben unberührt.
- Ebenfalls abgebrochen: geplante Retry-Telefonanfragen (`MessageRetryManager.clear()`, neu),
  der 20-s-Timer des Initial-Syncs und die 15-s-Timer der Platzhalter-Neuanforderung.
- Wirft ein `connection.update`-Listener beim Schließen, wird der Fehler geloggt und das Aufräumen
  läuft weiter. Vorher wurde daraus ein ungefangener Fehler im WebSocket-Handler, der den ganzen
  Prozess samt allen anderen Sitzungen beenden konnte.
- `WebSocketClient`: `isClosing`/`isConnecting` lieferten mangels `return` immer `undefined`;
  ohne Socket (nach `close()`) gilt die Verbindung jetzt als geschlossen (wie Upstream).
- Neu: `makeReconnectBackoff()` – exponentielle Wartezeit für Wiederverbindungen (opt-in,
  Baileys verbindet weiterhin nicht selbst neu).

### 🔧 Weitere Korrekturen
- `hkdf()` nutzt `crypto.webcrypto` statt des globalen `crypto` (fehlt ohne Flag vor Node 19) und
  akzeptiert `info` auch als Bytes. Ergebnisse unverändert (RFC-5869-Vektoren + frühere Werte).
- `generateWAMessageFromContent(jid, { conversation })` stürzte ab (`contextInfo` auf einem String).

### 🧪 Tests (`npm test`, Node-Testrunner, 48 Tests, nur Fixtures)
- HKDF: RFC 5869 A.1–A.3, alle Medientypen gegen `crypto.hkdfSync`, feste Werte (mit futoin-hkdf
  gegengeprüft) für Medien, App-State, Medien-Retry, `adv_secret`, Noise.
- `chunk` (Rest-Stück, Randfälle wie lodash) und Einspielen von 205 Signal-Sessions in 100er-Runden.
- Optionale Pakete: Laden ohne sie, klare Meldung, Store-Rundlauf mit v4-kompatibler Attrappe.
- Protobuf-Rundläufe (Text, Umfrage, Knöpfe, Liste, Standort, Kontakt, Reaktion, Löschen,
  Bearbeiten, WebMessageInfo, Handshake, ClientPayload mit WA-Version).
- Interaktiv/Karussell erweitert: Erzeugung über die API (Bildkarten mit Upload-Attrappe,
  `interactiveButtons` byte-genau).
- Gruppen-Ereignisse (Teilnehmer, Einstellungen, Beitrittsanfragen, Metadaten PN/LID, w:gp2-Binärweg).
- Retry-Manager und Caches (Grenze 512, TTLs, Zähler, Telefonanfragen, Ablauf mit Mock-Zeit).
- Sitzungs-Lebenszyklus gegen lokalen Fixture-WebSocket-Server (127.0.0.1): keine hängenden
  Timer/Intervalle/Listener, Fehlerform 428, kaputte Sitzungen (Abbruch, Müll, werfender
  Listener) reißen andere nicht mit, Wiederverbindung mit Backoff ohne Intervall-Lecks.

### 📡 WAProto / WhatsApp-Version
- **Bleibt bei der bewährten Version:** WhatsApp-Web `2.3000.1043857760`, Schema-Kopf
  `2.3000.1025995023`.
- Geprüft am 2026-11-22 (nur lesend): Upstream-Hauptzweig (Commit bb0a87e, 14.11.2026) und die
  npm-Releases `baileys@7.0.0-rc14`/`6.7.24` nutzen ebenfalls `2.3000.1043857760`; Upstream-Schema
  `2.3000.1029496320`. Für die Kandidaten `2.3000.1055724655` und `2.3000.1055737332` gibt es dort
  keinen Beleg; der offizielle Generierungsweg (Extraktion aus WhatsApp Web) war in der
  Prüfumgebung nicht erreichbar. Daher keine Änderung an generierten Dateien oder der Version.
- Optional: `.github/workflows/waproto-monitor.yml` vergleicht wöchentlich mit dem Upstream und
  schreibt nur einen Hinweis (nur Leserechte, veröffentlicht nichts).

## v2.2.33 – Preserve Raw Carousel Transport

- Der automatische MD-Patch erhält rohe `interactiveMessage.carouselMessage`
  statt den Legacy-View-once-Patch für Einzelkarten darauf anzuwenden.
- Ausdrücklich umhüllte Karussells bleiben erhalten; Einzelkarten, Listen,
  Templates und normale Nachrichten behalten das bisherige Verhalten.
- Transporttests mit zwei Bildkarten, drei `single_select` und drei
  `cta_url`, echten Protobuf-Rundläufen und Metadatenerhalt.
- Die Darstellung auf iOS, Android und Web ist am jeweiligen Client zu
  prüfen. Ein erfolgreicher Transporttest ist keine Gerätebestätigung.

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
