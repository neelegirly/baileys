'use strict'
// MessageRetryManager (Grenzen, TTL, Zaehler, Telefon-Anfragen, clear) und die
// Cache-Vorgaben (TTL, Ablauf, Signal-Key-Cache). Mit Mock-Zeit, ohne Warten.
const test = require('node:test')
const assert = require('node:assert/strict')
// wie in lib/: __importDefault(require('@cacheable/node-cache')).default
const NodeCache = require('@cacheable/node-cache').default
const { MessageRetryManager, DEFAULT_CACHE_TTLS, makeCacheableSignalKeyStore } = require('../lib')

const silent = { debug() { }, trace() { }, info() { }, warn() { }, error() { } }

test('Cache-Vorgaben bleiben unveraendert (Sekunden)', () => {
	assert.deepEqual(DEFAULT_CACHE_TTLS, { SIGNAL_STORE: 300, MSG_RETRY: 3600, CALL_OFFER: 300, USER_DEVICES: 300 })
})

test('Retry-Manager: letzte Nachrichten begrenzt auf 512, Index waechst nicht mit', () => {
	const manager = new MessageRetryManager(silent, 5)
	for (let i = 0; i < 600; i++) {
		manager.addRecentMessage('49170@s.whatsapp.net', `ID${i}`, { conversation: `n${i}` })
	}
	assert.equal(manager.recentMessagesMap.size, 512)
	assert.equal(manager.messageKeyIndex.size, 512, 'Index wird beim Verdraengen mit aufgeraeumt')
	assert.equal(manager.getRecentMessage('49170@s.whatsapp.net', 'ID0'), undefined, 'aelteste verdraengt')
	assert.deepEqual(manager.getRecentMessage('49170@s.whatsapp.net', 'ID599').message, { conversation: 'n599' })
	assert.equal(manager.getRecentMessage('andere@s.whatsapp.net', 'ID599'), undefined, 'Schluessel = Empfaenger + ID')
	// Ablaufzeiten der internen Caches
	assert.equal(manager.recentMessagesMap.ttl, 5 * 60 * 1000)
	assert.equal(manager.retryCounters.ttl, 15 * 60 * 1000)
	assert.equal(manager.retryCounters.updateAgeOnGet, true)
	assert.equal(manager.sessionRecreateHistory.ttl, 2 * 60 * 60 * 1000)
	manager.clear()
})

test('Retry-Manager: Zaehler, Obergrenze, Erfolg und Misserfolg raeumen auf', () => {
	const manager = new MessageRetryManager(silent, 3)
	manager.addRecentMessage('a@s.whatsapp.net', 'M1', { conversation: 'x' })
	assert.equal(manager.getRetryCount('M1'), 0)
	assert.equal(manager.incrementRetryCount('M1'), 1)
	assert.equal(manager.incrementRetryCount('M1'), 2)
	assert.equal(manager.hasExceededMaxRetries('M1'), false)
	manager.incrementRetryCount('M1')
	assert.equal(manager.hasExceededMaxRetries('M1'), true)
	manager.markRetrySuccess('M1')
	assert.equal(manager.getRetryCount('M1'), 0)
	assert.equal(manager.getRecentMessage('a@s.whatsapp.net', 'M1'), undefined)
	manager.addRecentMessage('a@s.whatsapp.net', 'M2', { conversation: 'y' })
	manager.incrementRetryCount('M2')
	manager.markRetryFailed('M2')
	assert.equal(manager.getRecentMessage('a@s.whatsapp.net', 'M2'), undefined)
	assert.deepEqual(manager.statistics, { totalRetries: 4, successfulRetries: 1, failedRetries: 1, mediaRetries: 0, sessionRecreations: 0, phoneRequests: 0 })
})

test('Retry-Manager: Session-Neuaufbau hoechstens einmal pro Stunde', (t) => {
	let now = 1_000_000
	t.mock.method(Date, 'now', () => now)
	const manager = new MessageRetryManager(silent, 5)
	assert.equal(manager.shouldRecreateSession('x@s.whatsapp.net', 0, false).recreate, true, 'ohne Session immer')
	assert.equal(manager.shouldRecreateSession('y@s.whatsapp.net', 1, true).recreate, false, 'erster Retry nie')
	assert.equal(manager.shouldRecreateSession('y@s.whatsapp.net', 2, true).recreate, true)
	now += 30 * 60 * 1000
	assert.equal(manager.shouldRecreateSession('y@s.whatsapp.net', 3, true).recreate, false, 'innerhalb einer Stunde nicht erneut')
	now += 31 * 60 * 1000
	assert.equal(manager.shouldRecreateSession('y@s.whatsapp.net', 3, true).recreate, true, 'nach ueber einer Stunde wieder')
	assert.equal(manager.statistics.sessionRecreations, 3)
	manager.clear()
})

test('Retry-Manager: Telefon-Anfragen verzoegert, neu geplant, abgebrochen; clear() stoppt alle Timer', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const manager = new MessageRetryManager(silent, 5)
	const calls = []
	manager.schedulePhoneRequest('P1', () => calls.push('P1-alt'))
	manager.schedulePhoneRequest('P1', () => calls.push('P1'))
	manager.schedulePhoneRequest('P2', () => calls.push('P2'), 1000)
	t.mock.timers.tick(999)
	assert.deepEqual(calls, [])
	t.mock.timers.tick(1)
	assert.deepEqual(calls, ['P2'])
	t.mock.timers.tick(2000)
	assert.deepEqual(calls, ['P2', 'P1'], 'Standard 3000 ms, alte Planung ersetzt')
	manager.schedulePhoneRequest('P3', () => calls.push('P3'))
	manager.markRetrySuccess('P3')
	manager.schedulePhoneRequest('P4', () => calls.push('P4'))
	manager.schedulePhoneRequest('P5', () => calls.push('P5'))
	manager.addRecentMessage('a@s.whatsapp.net', 'P4', { conversation: 'z' })
	manager.incrementRetryCount('P4')
	manager.clear()
	assert.deepEqual(manager.pendingPhoneRequests, {})
	assert.equal(manager.recentMessagesMap.size, 0)
	assert.equal(manager.messageKeyIndex.size, 0)
	assert.equal(manager.getRetryCount('P4'), 0)
	t.mock.timers.tick(10_000)
	assert.deepEqual(calls, ['P2', 'P1'], 'nach clear() feuert nichts mehr')
	assert.equal(manager.statistics.phoneRequests, 2)
})

test('@cacheable/node-cache: Eintraege laufen nach stdTTL ab, close() stoppt das Pruef-Intervall', (t) => {
	t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 })
	const cache = new NodeCache({ stdTTL: DEFAULT_CACHE_TTLS.USER_DEVICES, useClones: false })
	const value = { devices: [1] }
	cache.set('u', value)
	assert.equal(cache.get('u'), value, 'useClones: false liefert dasselbe Objekt')
	t.mock.timers.tick(299_000)
	assert.equal(cache.get('u'), value)
	t.mock.timers.tick(2_000)
	assert.equal(cache.get('u'), undefined, 'nach 300 s abgelaufen')
	assert.notEqual(cache.getIntervalId(), 0)
	cache.close()
	assert.equal(cache.getIntervalId(), 0)
})

test('makeCacheableSignalKeyStore: liest einmal, schreibt durch, laedt nach Ablauf neu', async (t) => {
	t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 })
	const reads = []
	const backing = new Map([['session.a', { s: 1 }]])
	const store = {
		get: async (type, ids) => {
			reads.push(...ids)
			return Object.fromEntries(ids.map(id => [id, backing.get(`${type}.${id}`)]))
		},
		set: async (data) => {
			for (const type in data) for (const id in data[type]) backing.set(`${type}.${id}`, data[type][id])
		}
	}
	const cache = new NodeCache({ stdTTL: DEFAULT_CACHE_TTLS.SIGNAL_STORE, useClones: false, deleteOnExpire: true })
	const keys = makeCacheableSignalKeyStore(store, undefined, cache)
	assert.deepEqual(await keys.get('session', ['a', 'b']), { a: { s: 1 } })
	assert.deepEqual(await keys.get('session', ['a']), { a: { s: 1 } })
	assert.deepEqual(reads, ['a', 'b'], 'a kam beim zweiten Mal aus dem Cache, b (fehlend) wird nicht gecacht')
	await keys.set({ session: { b: { s: 2 } } })
	assert.deepEqual(backing.get('session.b'), { s: 2 }, 'durchgeschrieben')
	assert.deepEqual(await keys.get('session', ['b']), { b: { s: 2 } })
	assert.deepEqual(reads, ['a', 'b'])
	t.mock.timers.tick(301_000)
	await keys.get('session', ['a'])
	assert.deepEqual(reads, ['a', 'b', 'a'], 'nach 300 s erneut aus dem Speicher')
	cache.close()
})
