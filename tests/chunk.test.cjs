'use strict'
// Ersatz fuer lodash.chunk: gleiche Ergebnisse wie lodash@4 (Werte am
// 2026-11-21 mit lodash@4.18.1 aufgenommen) und gleiches Stueckeln beim
// Einspielen vieler Signal-Sessions (100 je Runde).
const test = require('node:test')
const assert = require('node:assert/strict')
const { chunk } = require('../lib/Utils/chunk')
const { parseAndInjectE2ESessions } = require('../lib')

test('chunk: Rest-Stueck und Randfaelle wie lodash.chunk', () => {
	const a = [1, 2, 3, 4, 5]
	const cases = [
		[a, 2, [[1, 2], [3, 4], [5]]],
		[a, 5, [[1, 2, 3, 4, 5]]],
		[a, 100, [[1, 2, 3, 4, 5]]],
		[a, 1, [[1], [2], [3], [4], [5]]],
		[a, undefined, [[1], [2], [3], [4], [5]]],
		[[], 3, []],
		[a, 0, []],
		[a, -1, []],
		[a, 2.7, [[1, 2], [3, 4], [5]]],
		[a, '2', [[1, 2], [3, 4], [5]]],
		[a, NaN, []],
		[null, 2, []],
		[undefined, 2, []],
		[a, Infinity, [[1, 2, 3, 4, 5]]]
	]
	for (const [input, size, expected] of cases) {
		assert.deepEqual(chunk(input, size), expected, `chunk(${JSON.stringify(input)}, ${size})`)
	}
	// Eingabe bleibt unveraendert, Stuecke sind neue Arrays
	const copy = [...a]
	const out = chunk(a, 2)
	assert.deepEqual(a, copy)
	assert.notEqual(out[0], a)
})

const uint = (n, len) => {
	const b = Buffer.alloc(len)
	b.writeUIntBE(n, 0, len)
	return b
}

const userNode = (i) => ({
	tag: 'user',
	attrs: { jid: `49170${String(i).padStart(7, '0')}@s.whatsapp.net` },
	content: [
		{ tag: 'registration', attrs: {}, content: uint(1000 + i, 4) },
		{ tag: 'identity', attrs: {}, content: Buffer.alloc(32, i % 256) },
		{ tag: 'skey', attrs: {}, content: [
			{ tag: 'id', attrs: {}, content: uint(i, 3) },
			{ tag: 'value', attrs: {}, content: Buffer.alloc(32, 1) },
			{ tag: 'signature', attrs: {}, content: Buffer.alloc(64, 2) }
		] },
		{ tag: 'key', attrs: {}, content: [
			{ tag: 'id', attrs: {}, content: uint(i + 1, 3) },
			{ tag: 'value', attrs: {}, content: Buffer.alloc(32, 3) }
		] }
	]
})

test('parseAndInjectE2ESessions: 205 Geraete in Runden zu 100, alle Felder korrekt', async () => {
	const total = 205
	const node = { tag: 'iq', attrs: {}, content: [{ tag: 'list', attrs: {}, content: Array.from({ length: total }, (_, i) => userNode(i)) }] }
	const injected = []
	let running = 0
	let maxRunning = 0
	const repository = {
		injectE2ESession: async (data) => {
			running++
			maxRunning = Math.max(maxRunning, running)
			await new Promise(resolve => setImmediate(resolve))
			injected.push(data)
			running--
		}
	}
	await parseAndInjectE2ESessions(node, repository)
	assert.equal(injected.length, total)
	assert.equal(maxRunning, 100, 'hoechstens 100 gleichzeitig (eine Runde)')
	const first = injected.find(d => d.jid.endsWith('0000000@s.whatsapp.net'))
	assert.equal(first.session.registrationId, 1000)
	assert.equal(first.session.identityKey.length, 33, 'Signal-Typbyte vorangestellt')
	assert.equal(first.session.signedPreKey.keyId, 0)
	assert.equal(first.session.preKey.keyId, 1)
	assert.equal(first.session.signedPreKey.signature.length, 64)
	const last = injected.find(d => d.jid.endsWith('0000204@s.whatsapp.net'))
	assert.equal(last.session.registrationId, 1204)
})

test('parseAndInjectE2ESessions: Fehlerknoten bricht vor jedem Einspielen ab', async () => {
	const bad = userNode(1)
	bad.content.push({ tag: 'error', attrs: { code: '404', text: 'not found' } })
	const node = { tag: 'iq', attrs: {}, content: [{ tag: 'list', attrs: {}, content: [userNode(0), bad] }] }
	let calls = 0
	await assert.rejects(parseAndInjectE2ESessions(node, { injectE2ESession: async () => { calls++ } }), /not found/)
	assert.equal(calls, 0)
})
