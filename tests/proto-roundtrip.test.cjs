'use strict'
// Nachrichten kodieren/dekodieren mit dem generierten WAProto (protobufjs):
// Inhalte aus generateWAMessageContent, WebMessageInfo, Handshake und
// ClientPayload (traegt die WhatsApp-Web-Version). Nur Fixtures, kein Netz.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
	proto, generateWAMessageContent, generateWAMessageFromContent, generateLoginNode, generateRegistrationNode,
	initAuthCreds, DEFAULT_CONNECTION_CONFIG, Browsers
} = require('../lib')
const baileysVersion = require('../lib/Defaults/baileys-version.json')

const round = (type, value) => type.decode(type.encode(value).finish())
const opts = { logger: undefined }

test('Text mit Erwaehnung und Zitat-Kontext', async () => {
	const content = await generateWAMessageContent({ text: 'Hallo @12345 – äöü 💖', mentions: ['12345@s.whatsapp.net'], contextInfo: { stanzaId: 'Q', participant: '9@s.whatsapp.net' }, linkPreview: null }, opts)
	const back = round(proto.Message, content)
	assert.equal(back.extendedTextMessage.text, 'Hallo @12345 – äöü 💖')
	assert.deepEqual(back.extendedTextMessage.contextInfo.mentionedJid, ['12345@s.whatsapp.net'])
	assert.equal(back.extendedTextMessage.contextInfo.stanzaId, 'Q')
})

test('Umfrage: Einfach- und Mehrfachauswahl, Fehler bei falscher Anzahl', async () => {
	const single = round(proto.Message, await generateWAMessageContent({ poll: { name: 'Pizza?', values: ['Ja', 'Nein'], selectableCount: 0 } }, opts))
	assert.equal(single.pollCreationMessage.name, 'Pizza?')
	assert.deepEqual(single.pollCreationMessage.options.map(o => o.optionName), ['Ja', 'Nein'])
	const multi = round(proto.Message, await generateWAMessageContent({ poll: { name: 'Belag', values: ['A', 'B', 'C'], selectableCount: 2 } }, opts))
	assert.equal(multi.pollCreationMessageV3.selectableOptionsCount, 2)
	await assert.rejects(generateWAMessageContent({ poll: { name: 'x', values: ['a'], selectableCount: 3 } }, opts), (err) => err.output.statusCode === 400)
})

test('Knoepfe und Liste behalten IDs und Texte', async () => {
	const buttons = round(proto.Message, await generateWAMessageContent({
		text: 'Waehle', footer: 'Fuss', buttons: [{ buttonId: '!a', buttonText: { displayText: 'A' } }, { buttonId: '!b', buttonText: { displayText: 'B' } }]
	}, opts))
	assert.equal(buttons.buttonsMessage.contentText, 'Waehle')
	assert.equal(buttons.buttonsMessage.footerText, 'Fuss')
	assert.deepEqual(buttons.buttonsMessage.buttons.map(b => [b.buttonId, b.buttonText.displayText, b.type]), [['!a', 'A', 1], ['!b', 'B', 1]])
	const list = round(proto.Message, await generateWAMessageContent({
		text: 'Menue', title: 'Titel', buttonText: 'Oeffnen', footer: 'F',
		sections: [{ title: 'S1', rows: [{ title: 'Eins', rowId: '!1', description: 'd' }] }]
	}, opts))
	assert.equal(list.listMessage.buttonText, 'Oeffnen')
	assert.equal(list.listMessage.sections[0].rows[0].rowId, '!1')
})

test('Standort, Kontakt, Reaktion, Loeschen und Bearbeiten', async () => {
	const loc = round(proto.Message, await generateWAMessageContent({ location: { degreesLatitude: 52.52, degreesLongitude: 13.405, name: 'Berlin' } }, opts))
	assert.equal(loc.locationMessage.degreesLatitude, 52.52)
	assert.equal(loc.locationMessage.name, 'Berlin')
	const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Neele\nTEL;type=CELL;waid=491700000001:+49 170 0000001\nEND:VCARD'
	const contact = round(proto.Message, await generateWAMessageContent({ contacts: { displayName: 'Neele', contacts: [{ vcard }] } }, opts))
	assert.equal(contact.contactMessage.vcard, vcard)
	const key = { remoteJid: '1@s.whatsapp.net', fromMe: true, id: 'ABC' }
	const react = round(proto.Message, await generateWAMessageContent({ react: { text: '💖', key } }, opts))
	assert.equal(react.reactionMessage.text, '💖')
	assert.equal(react.reactionMessage.key.id, 'ABC')
	const del = round(proto.Message, await generateWAMessageContent({ delete: key }, opts))
	assert.equal(del.protocolMessage.type, proto.Message.ProtocolMessage.Type.REVOKE)
	assert.equal(del.protocolMessage.key.id, 'ABC')
	const edit = round(proto.Message, await generateWAMessageContent({ text: 'neu', edit: key, linkPreview: null }, opts))
	assert.equal(edit.protocolMessage.type, proto.Message.ProtocolMessage.Type.MESSAGE_EDIT)
	assert.equal(edit.protocolMessage.editedMessage.extendedTextMessage.text, 'neu')
})

test('WebMessageInfo: Schluessel, Zeitstempel und Inhalt rund', () => {
	const msg = generateWAMessageFromContent('491700000002@s.whatsapp.net', { conversation: 'Hi' }, { userJid: '491700000001@s.whatsapp.net', messageId: 'MSG1', timestamp: new Date(1700000000000) })
	const back = round(proto.WebMessageInfo, msg)
	assert.equal(back.key.id, 'MSG1')
	assert.equal(back.key.fromMe, true)
	assert.equal(back.key.remoteJid, '491700000002@s.whatsapp.net')
	assert.equal(Number(back.messageTimestamp), 1700000000)
	assert.equal(back.message.conversation, 'Hi')
	// unbekannte Felder in alten Daten stoeren das Dekodieren nicht
	const withUnknown = Buffer.concat([proto.Message.encode({ conversation: 'x' }).finish(), Buffer.from([0xf8, 0xff, 0x7f, 0x01])])
	assert.equal(proto.Message.decode(withUnknown).conversation, 'x')
})

test('Handshake: clientHello rund, Muell wirft beim Dekodieren nicht still durch', () => {
	const ephemeral = Buffer.alloc(32, 5)
	const back = round(proto.HandshakeMessage, { clientHello: { ephemeral } })
	assert.deepEqual(Buffer.from(back.clientHello.ephemeral), ephemeral)
	assert.throws(() => proto.HandshakeMessage.decode(Buffer.from([0x0a, 0xff, 0xff, 0xff, 0xff, 0x0f])))
})

test('ClientPayload traegt die eingestellte WhatsApp-Web-Version (Login und Registrierung)', () => {
	assert.deepEqual(DEFAULT_CONNECTION_CONFIG.version, baileysVersion.version)
	assert.deepEqual(baileysVersion.version, [2, 3000, 1043857760], 'bewaehrte Version bleibt, bis eine neue belegt ist')
	const config = { ...DEFAULT_CONNECTION_CONFIG, browser: Browsers.ubuntu('Chrome'), countryCode: 'DE' }
	const login = proto.ClientPayload.decode(proto.ClientPayload.encode(generateLoginNode('491700000001:3@s.whatsapp.net', config)).finish())
	assert.deepEqual([login.userAgent.appVersion.primary, login.userAgent.appVersion.secondary, login.userAgent.appVersion.tertiary], baileysVersion.version)
	assert.equal(Number(login.username), 491700000001)
	assert.equal(login.device, 3)
	assert.equal(login.passive, true)
	assert.equal(login.userAgent.localeCountryIso31661Alpha2, 'DE')
	const reg = proto.ClientPayload.decode(proto.ClientPayload.encode(generateRegistrationNode(initAuthCreds(), config)).finish())
	assert.equal(reg.passive, false)
	assert.equal(reg.devicePairingData.buildHash.length, 16, 'MD5 der Version')
	assert.deepEqual(Buffer.from(reg.devicePairingData.buildHash), require('node:crypto').createHash('md5').update(baileysVersion.version.join('.')).digest())
	const props = proto.DeviceProps.decode(reg.devicePairingData.deviceProps)
	assert.equal(props.os, 'Ubuntu')
})
