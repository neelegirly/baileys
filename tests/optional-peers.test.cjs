'use strict'
// cache-manager und audio-decode sind optionale Peer-Abhaengigkeiten:
// das Paket muss ohne sie laden; wer sie nutzt, bekommt das alte Verhalten
// (wenn installiert) oder eine klare Meldung bzw. keinen Absturz.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const baileys = require('../lib')
const { makeCacheManagerAuthState, getAudioWaveform, initAuthCreds } = baileys

const loaded = (name) => Object.keys(require.cache).some(file => file.includes(`${path.sep}node_modules${path.sep}${name}${path.sep}`))
const hasModule = (name) => {
	try {
		require.resolve(name)
		return true
	}
	catch {
		return false
	}
}

/** leitet require('cache-manager') fuer die Dauer von fn um */
const withCacheManager = async (replacement, fn) => {
	const original = Module._resolveFilename
	Module._resolveFilename = function (request, ...rest) {
		if (request === 'cache-manager') {
			if (replacement === null) {
				const err = new Error(`Cannot find module 'cache-manager'\nRequire stack:\n- ${__filename}`)
				err.code = 'MODULE_NOT_FOUND'
				throw err
			}
			return replacement
		}
		return original.call(this, request, ...rest)
	}
	try {
		return await fn()
	}
	finally {
		Module._resolveFilename = original
	}
}

test('require des Pakets laedt weder cache-manager noch audio-decode', () => {
	assert.equal(typeof makeCacheManagerAuthState, 'function')
	assert.equal(loaded('cache-manager'), false)
	assert.equal(loaded('audio-decode'), false)
})

test('makeCacheManagerAuthState ohne cache-manager: klarer Fehler mit Installationshinweis', async () => {
	await withCacheManager(null, async () => {
		await assert.rejects(makeCacheManagerAuthState({ store: 'memory' }, 'sess'), (err) => {
			assert.equal(err.code, 'MODULE_NOT_FOUND')
			assert.match(err.message, /optional peer dependency "cache-manager"/)
			assert.match(err.message, /npm install cache-manager@4/)
			return true
		})
	})
})

test('makeCacheManagerAuthState mit cache-manager-v4-kompatiblem Store: Daten rund, TTL fuer creds', async () => {
	const fixture = path.join(__dirname, 'fixtures', 'cache-manager-v4-fake.cjs')
	delete require.cache[fixture]
	await withCacheManager(fixture, async () => {
		const fake = require(fixture)
		const { state, saveCreds, clearState } = await makeCacheManagerAuthState({ store: 'memory' }, 'sess-a')
		assert.equal(typeof state.creds.noiseKey.public.length, 'number', 'neue Zugangsdaten erzeugt')
		await saveCreds()
		const credsEntry = fake.lastStore.entries.get('sess-a:creds')
		assert.equal(credsEntry.ttl, 63115200, 'creds behalten 2 Jahre TTL')
		await state.keys.set({ 'pre-key': { 1: { public: Buffer.from([1, 2]), private: Buffer.from([3]) }, 2: null } })
		const got = await state.keys.get('pre-key', ['1', '2'])
		assert.deepEqual(got['1'].public, Buffer.from([1, 2]))
		assert.equal(got['2'], null)
		await state.keys.set({ 'app-state-sync-key': { k1: { keyData: Buffer.from([9]), timestamp: 5 } } })
		const sync = await state.keys.get('app-state-sync-key', ['k1'])
		assert.equal(sync.k1.constructor.name, 'AppStateSyncKeyData')
		// zweite Sitzung im selben Store ist getrennt
		const other = await makeCacheManagerAuthState({ store: 'memory' }, 'sess-b')
		assert.notDeepEqual(other.state.creds.noiseKey.public, state.creds.noiseKey.public)
		await clearState()
		assert.equal([...fake.lastStore.entries.keys()].filter(k => k.startsWith('sess-a')).length, 0)
	})
})

test('makeCacheManagerAuthState mit echtem cache-manager (falls installiert)', async (t) => {
	if (!hasModule('cache-manager')) {
		t.diagnostic('cache-manager nicht installiert (optionale Peer-Abhaengigkeit) - echter Rundlauf entfaellt, Attrappe oben deckt den Code ab')
		return
	}
	const { state, saveCreds } = await makeCacheManagerAuthState({ store: 'memory', max: 100, ttl: 0 }, 'echt')
	await saveCreds()
	const again = await makeCacheManagerAuthState({ store: 'memory', max: 100, ttl: 0 }, 'echt')
	assert.ok(again.state.creds.registrationId > 0)
	await state.keys.set({ session: { a: { x: 1 } } })
	assert.deepEqual((await state.keys.get('session', ['a'])).a, { x: 1 })
	assert.equal(typeof initAuthCreds, 'function')
})

const wavSine = (seconds = 1, rate = 8000) => {
	const samples = seconds * rate
	const data = Buffer.alloc(samples * 2)
	for (let i = 0; i < samples; i++) {
		// Lautstaerke steigt linear an, damit die Wellenform nicht flach ist
		const amp = (i / samples) * 0.9
		data.writeInt16LE(Math.round(Math.sin(i / 8) * amp * 32767), i * 2)
	}
	const header = Buffer.alloc(44)
	header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8)
	header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
	header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
	header.write('data', 36); header.writeUInt32LE(data.length, 40)
	return Buffer.concat([header, data])
}

test('getAudioWaveform: mit audio-decode 64 Werte, ohne audio-decode undefined statt Absturz', async (t) => {
	const debug = []
	const logger = { debug: (msg) => debug.push(String(msg)) }
	const available = await import('audio-decode').then(() => true, () => false)
	const waveform = await getAudioWaveform(wavSine(), logger)
	if (available) {
		t.diagnostic('audio-decode installiert: Wellenform wird berechnet')
		assert.ok(waveform instanceof Uint8Array)
		assert.equal(waveform.length, 64)
		// normiert auf 0..100 (Gleitkomma kann beim Maximum 99 statt 100 ergeben)
		assert.ok(Math.max(...waveform) >= 99 && Math.max(...waveform) <= 100)
		assert.ok(waveform[0] < waveform[63], 'ansteigende Lautstaerke sichtbar')
	}
	else {
		t.diagnostic('audio-decode nicht installiert: keine Wellenform, Nachricht wird trotzdem gebaut')
		assert.equal(waveform, undefined)
		assert.ok(debug.some(line => line.startsWith('Failed to generate waveform')))
	}
})
