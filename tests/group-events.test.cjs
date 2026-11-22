'use strict'
// Gruppen-Ereignisse aus Fixtures: Stub-Nachrichten -> group-participants.update /
// groups.update / group.join-request / chats.update, Gruppen-Metadaten (PN und LID)
// und der Binaerweg einer w:gp2-Benachrichtigung. Keine Netzverbindung.
const test = require('node:test')
const assert = require('node:assert/strict')
const { processMessage, WAMessageStubType, encodeBinaryNode, decodeBinaryNode } = require('../lib')
const { extractGroupMetadata } = require('../lib/Socket/groups')

const ME = '491700000001@s.whatsapp.net'
const GROUP = '120363000000000001@g.us'
const ADMIN = '491700000002@s.whatsapp.net'
const USER = '491700000003@s.whatsapp.net'

const run = async (stubType, params, extraKey = {}) => {
	const events = []
	const ev = { emit: (name, data) => events.push([name, data]) }
	await processMessage({
		key: { remoteJid: GROUP, fromMe: false, id: 'STUB1', participant: ADMIN, participantAlt: '123@lid', ...extraKey },
		participant: ADMIN,
		messageStubType: stubType,
		messageStubParameters: params,
		messageTimestamp: 1700000000
	}, { ev, creds: { me: { id: ME } }, logger: undefined, options: {}, getMessage: async () => undefined })
	return events
}

const only = (events, name) => events.filter(([n]) => n === name).map(([, data]) => data)

test('Teilnehmer-Ereignisse: add, remove, promote, demote, leave, modify', async () => {
	const cases = [
		[WAMessageStubType.GROUP_PARTICIPANT_ADD, 'add'],
		[WAMessageStubType.GROUP_PARTICIPANT_INVITE, 'add'],
		[WAMessageStubType.GROUP_PARTICIPANT_ADD_REQUEST_JOIN, 'add'],
		[WAMessageStubType.GROUP_PARTICIPANT_REMOVE, 'remove'],
		[WAMessageStubType.GROUP_PARTICIPANT_PROMOTE, 'promote'],
		[WAMessageStubType.GROUP_PARTICIPANT_DEMOTE, 'demote'],
		[WAMessageStubType.GROUP_PARTICIPANT_LEAVE, 'leave'],
		[WAMessageStubType.GROUP_PARTICIPANT_CHANGE_NUMBER, 'modify']
	]
	for (const [stub, action] of cases) {
		const [update, ...rest] = only(await run(stub, [USER]), 'group-participants.update')
		assert.equal(rest.length, 0, `genau ein Ereignis fuer ${action}`)
		assert.deepEqual(update, { id: GROUP, author: ADMIN, authorPn: '123@lid', authorUsername: undefined, participants: [USER], action }, `Stub ${stub}`)
	}
})

test('eigenes Entfernen/Hinzufuegen setzt readOnly im Chat', async () => {
	const removed = only(await run(WAMessageStubType.GROUP_PARTICIPANT_REMOVE, [ME]), 'chats.update')
	assert.deepEqual(removed, [[{ id: GROUP, readOnly: true }]])
	const left = only(await run(WAMessageStubType.GROUP_PARTICIPANT_LEAVE, [ME]), 'chats.update')
	assert.deepEqual(left, [[{ id: GROUP, readOnly: true }]])
	const added = only(await run(WAMessageStubType.GROUP_PARTICIPANT_ADD, [ME]), 'chats.update')
	assert.deepEqual(added, [[{ id: GROUP, readOnly: false }]])
	// fremde Teilnehmer aendern den eigenen Chat nicht
	assert.deepEqual(only(await run(WAMessageStubType.GROUP_PARTICIPANT_REMOVE, [USER]), 'chats.update'), [])
})

test('Gruppen-Einstellungen: Betreff, Beschreibung, announce, restrict, Link, Beitrittsmodi', async () => {
	const cases = [
		[WAMessageStubType.GROUP_CHANGE_SUBJECT, ['Neuer Name'], { subject: 'Neuer Name' }, { name: 'Neuer Name' }],
		[WAMessageStubType.GROUP_CHANGE_DESCRIPTION, ['Text'], { desc: 'Text' }, { description: 'Text' }],
		[WAMessageStubType.GROUP_CHANGE_ANNOUNCE, ['on'], { announce: true }],
		[WAMessageStubType.GROUP_CHANGE_ANNOUNCE, ['false'], { announce: false }],
		[WAMessageStubType.GROUP_CHANGE_RESTRICT, ['true'], { restrict: true }],
		[WAMessageStubType.GROUP_CHANGE_INVITE_LINK, ['AbCdEf'], { inviteCode: 'AbCdEf' }],
		[WAMessageStubType.GROUP_MEMBER_ADD_MODE, ['all_member_add'], { memberAddMode: true }],
		[WAMessageStubType.GROUP_MEMBER_ADD_MODE, ['admin_add'], { memberAddMode: false }],
		[WAMessageStubType.GROUP_MEMBERSHIP_JOIN_APPROVAL_MODE, ['on'], { joinApprovalMode: true }]
	]
	for (const [stub, params, expected, chatChange] of cases) {
		const events = await run(stub, params)
		assert.deepEqual(only(events, 'groups.update'), [[{ id: GROUP, ...expected, author: ADMIN, authorPn: '123@lid', authorUsername: undefined }]], `Stub ${stub}`)
		assert.deepEqual(only(events, 'chats.update'), chatChange ? [[{ id: GROUP, ...chatChange }]] : [])
		assert.deepEqual(only(events, 'group-participants.update'), [])
	}
})

test('Beitrittsanfrage ohne Admin: group.join-request', async () => {
	const events = await run(WAMessageStubType.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD, [USER, 'created', 'invite_link'])
	assert.deepEqual(only(events, 'group.join-request'), [{ id: GROUP, author: ADMIN, authorPn: '123@lid', authorUsername: undefined, participant: USER, action: 'created', method: 'invite_link' }])
})

const groupNode = (attrs, children) => ({ tag: 'iq', attrs: {}, content: [{ tag: 'group', attrs, content: children }] })

test('extractGroupMetadata: Telefonnummern-Gruppe', () => {
	const meta = extractGroupMetadata(groupNode(
		{ id: '120363000000000001', subject: 'Onimai', s_o: ADMIN, s_t: '1700000000', creation: '1690000000', creator: ADMIN, creator_country_code: 'DE' },
		[
			{ tag: 'description', attrs: { id: 'D1', participant: ADMIN }, content: [{ tag: 'body', attrs: {}, content: Buffer.from('Beschreibung') }] },
			{ tag: 'announcement', attrs: {} },
			{ tag: 'ephemeral', attrs: { expiration: '86400' } },
			{ tag: 'participant', attrs: { jid: ADMIN, type: 'superadmin' } },
			{ tag: 'participant', attrs: { jid: USER } }
		]
	))
	assert.equal(meta.id, GROUP)
	assert.equal(meta.subject, 'Onimai')
	assert.equal(meta.owner, ADMIN)
	assert.equal(meta.desc, 'Beschreibung')
	assert.equal(meta.descId, 'D1')
	assert.equal(meta.announce, true)
	assert.equal(meta.restrict, false)
	assert.equal(meta.ephemeralDuration, 86400)
	assert.equal(meta.size, 2)
	assert.deepEqual(meta.participants.map(p => [p.id, p.admin]), [[ADMIN, 'superadmin'], [USER, null]])
})

test('extractGroupMetadata: LID-Gruppe nutzt Telefonnummern fuer Besitzer und Teilnehmer', () => {
	const meta = extractGroupMetadata(groupNode(
		{ id: GROUP, subject: 'LID', addressing_mode: 'lid', s_o: '111@lid', s_o_pn: ADMIN, s_t: '1', creation: '2', creator: '111@lid', creator_pn: ADMIN, size: '40' },
		[
			{ tag: 'participant', attrs: { jid: '111@lid', phone_number: ADMIN, type: 'admin' } },
			{ tag: 'participant', attrs: { jid: '222@lid', phone_number: USER } }
		]
	))
	assert.equal(meta.addressingMode, 'lid')
	assert.equal(meta.owner, ADMIN)
	assert.equal(meta.subjectOwner, ADMIN)
	assert.equal(meta.size, 40)
	assert.deepEqual(meta.participants.map(p => [p.id, p.lid, p.admin]), [[ADMIN, '111@lid', 'admin'], [USER, '222@lid', null]])
})

test('extractGroupMetadata: Fehlerknoten wird Boom mit Statuscode', () => {
	assert.throws(() => extractGroupMetadata({ tag: 'iq', attrs: {}, content: [{ tag: 'error', attrs: { code: '403', text: 'forbidden' } }] }),
		(err) => err.isBoom && err.output.statusCode === 403 && err.message === 'forbidden')
	assert.throws(() => extractGroupMetadata({ tag: 'iq', attrs: {}, content: [] }), /missing <group> node/)
})

test('w:gp2-Benachrichtigung uebersteht den Binaer-Rundlauf unveraendert', async () => {
	const node = {
		tag: 'notification',
		attrs: { from: GROUP, type: 'w:gp2', id: '123', participant: ADMIN, t: '1700000000' },
		content: [{ tag: 'add', attrs: { reason: 'invite' }, content: [{ tag: 'participant', attrs: { jid: USER } }] }]
	}
	const decoded = await decodeBinaryNode(encodeBinaryNode(node))
	// Decoder legt leere Inhalte als content: undefined an -> ueber JSON vergleichen
	assert.deepEqual(JSON.parse(JSON.stringify(decoded)), node)
})
