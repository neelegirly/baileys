'use strict'
// Verbindungsauf- und -abbau mehrerer Sitzungen gegen einen lokalen
// Fixture-WebSocket-Server (127.0.0.1). Keine echte WhatsApp-Sitzung, keine
// Verbindung nach aussen (Waechter unten). Geprueft wird:
// - end() raeumt Timer, Intervalle (Cache-Pruefintervalle) und Listener ab
// - wartende Abfragen haengen nach end() nicht bis zu ihrem Timeout
// - Fehlerform lastDisconnect.error.output.statusCode bleibt
// - eine kaputte Sitzung (Abbruch, Muell, werfender Listener) reisst andere nicht mit
// - Wiederverbindung mit Backoff ohne liegen gebliebene Intervalle
const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const { once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')
const { WebSocketServer } = require('ws')
const { Boom } = require('@hapi/boom')
const { default: makeWASocket, initAuthCreds, DisconnectReason, NOISE_WA_HEADER, makeReconnectBackoff } = require('../lib')

// ---- Waechter: nur Loopback-Verbindungen erlaubt -------------------------
const outbound = []
const originalConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
	let options = args[0]
	if (Array.isArray(options)) options = options[0]
	if (options && typeof options === 'object' && !options.path) {
		const host = options.host || 'localhost'
		if (!['127.0.0.1', 'localhost', '::1'].includes(host)) outbound.push(host)
	}
	return originalConnect.apply(this, args)
}

// ---- Intervall-Buchfuehrung ---------------------------------------------
const liveIntervals = new Map()
const originalSetInterval = global.setInterval
const originalClearInterval = global.clearInterval
global.setInterval = function (...args) {
	const handle = originalSetInterval.apply(this, args)
	liveIntervals.set(handle, new Error('Intervall angelegt').stack)
	return handle
}
global.clearInterval = function (handle) {
	liveIntervals.delete(handle)
	return originalClearInterval.call(this, handle)
}

const activeTimeouts = () => process.getActiveResourcesInfo().filter(type => type === 'Timeout').length

const waitFor = async (check, what, timeoutMs = 3000) => {
	const started = Date.now()
	while (!check()) {
		if (Date.now() - started > timeoutMs) throw new Error(`Zeitueberschreitung: ${what}`)
		await sleep(5)
	}
}

const makeLogger = () => {
	const errors = []
	const logger = {
		level: 'silent',
		child: () => logger,
		trace: () => { }, debug: () => { }, info: () => { }, warn: () => { },
		error: (obj, msg) => errors.push(msg || String(obj))
	}
	return { logger, errors }
}

const memoryKeys = () => {
	const data = new Map()
	return {
		get: async (type, ids) => Object.fromEntries(ids.map(id => [id, data.get(`${type}-${id}`)])),
		set: async (update) => {
			for (const type in update) {
				for (const id in update[type]) {
					const value = update[type][id]
					if (value) data.set(`${type}-${id}`, value)
					else data.delete(`${type}-${id}`)
				}
			}
		}
	}
}

// alles, was ein fehlgeschlagener Test offen liess, wird am Ende geschlossen
const openSessions = new Set()
const openServers = new Set()

const startServer = async (onConnection) => {
	const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
	await once(wss, 'listening')
	const conns = []
	wss.on('connection', (ws, req) => {
		const conn = { ws, path: req.url, frames: [], closed: false }
		ws.on('message', (data) => conn.frames.push(Buffer.from(data)))
		ws.on('close', () => { conn.closed = true })
		conns.push(conn)
		onConnection?.(conn, conns.length - 1)
	})
	const server = {
		conns,
		url: `ws://127.0.0.1:${wss.address().port}/ws/chat`,
		close: () => new Promise(resolve => {
			for (const conn of conns) conn.ws.terminate()
			wss.close(() => resolve())
		})
	}
	openServers.add(server)
	return server
}

/** startet eine Sitzung und merkt sich ihre Intervalle und Updates */
const startSession = (url, logger) => {
	const before = new Set(liveIntervals.keys())
	const sock = makeWASocket({
		auth: { creds: initAuthCreds(), keys: memoryKeys() },
		waWebSocketUrl: url,
		logger,
		printQRInTerminal: false,
		markOnlineOnConnect: false,
		connectTimeoutMs: 20000
	})
	const intervals = [...liveIntervals.keys()].filter(handle => !before.has(handle))
	const updates = []
	sock.ev.on('connection.update', update => updates.push(update))
	const closes = () => updates.filter(update => update.connection === 'close')
	openSessions.add(sock)
	return { sock, intervals, updates, closes }
}

const assertCleanedUp = (session, label) => {
	const { sock, intervals } = session
	assert.ok(intervals.length >= 3, `${label}: Cache-Intervalle wurden angelegt (${intervals.length})`)
	for (const handle of intervals) {
		assert.equal(liveIntervals.has(handle), false, `${label}: Intervall nicht gestoppt\n${liveIntervals.get(handle)}`)
	}
	for (const event of ['message', 'open', 'close']) {
		assert.equal(sock.ws.listenerCount(event), 0, `${label}: ws-Listener '${event}' uebrig`)
	}
	// connection.update-Listener sind entfernt: ein spaeteres Update erreicht niemanden mehr
	const seen = session.updates.length
	sock.ev.emit('connection.update', { probe: true })
	assert.equal(session.updates.length, seen, `${label}: connection.update-Listener uebrig`)
	assert.equal(sock.ws.isOpen, false)
	assert.equal(sock.ws.isClosed, true)
}

test('end(): Sitzung schliesst sauber, ohne haengende Timer, Intervalle oder Listener', async () => {
	const server = await startServer()
	const baselineTimeouts = activeTimeouts()
	const { logger } = makeLogger()
	const session = startSession(server.url, logger)
	await waitFor(() => server.conns[0]?.frames.length >= 1, 'Client-Hello am Server')
	assert.deepEqual(server.conns[0].frames[0].subarray(0, 4), NOISE_WA_HEADER, 'Noise-Kopf WA 6 3')
	assert.equal(session.sock.ws.isOpen, true)

	// eine Abfrage wartet gerade (Handshake-Antwort bleibt aus)
	session.sock.end(undefined)
	assert.equal(session.closes().length, 1)
	assert.equal(session.closes()[0].lastDisconnect.error, undefined)
	session.sock.end(new Boom('zweites Ende'))
	assert.equal(session.closes().length, 1, 'zweites end() ist wirkungslos')

	await waitFor(() => server.conns[0].closed, 'Server sieht das Schliessen')
	assertCleanedUp(session, 'Sitzung')
	await waitFor(() => activeTimeouts() <= baselineTimeouts, 'keine zusaetzlichen Timer (Handshake-Timeout 20 s darf nicht haengen)')
	await assert.rejects(session.sock.waitForSocketOpen(), (err) => err.output.statusCode === DisconnectReason.connectionClosed)
	await server.close()
	assert.deepEqual(outbound, [])
})

test('Fehlerform: Abbruch durch den Server liefert Boom mit output.statusCode 428', async () => {
	const server = await startServer()
	const { logger } = makeLogger()
	const session = startSession(server.url, logger)
	await waitFor(() => server.conns[0]?.frames.length >= 1, 'Client-Hello am Server')
	server.conns[0].ws.terminate()
	await waitFor(() => session.closes().length === 1, 'close-Update')
	const { error } = session.closes()[0].lastDisconnect
	assert.equal(error.isBoom, true)
	assert.equal(error.output.statusCode, DisconnectReason.connectionClosed)
	assert.equal(error.message, 'Connection Terminated')
	assertCleanedUp(session, 'abgebrochene Sitzung')
	await server.close()
	assert.deepEqual(outbound, [])
})

test('mehrere Sitzungen: Abbruch, Muell-Handshake und werfender Listener reissen andere nicht mit', async () => {
	const server = await startServer()
	const baselineTimeouts = activeTimeouts()
	const logs = ['a', 'b', 'c', 'd'].map(() => makeLogger())
	const [a, b, c, d] = logs.map(({ logger }) => startSession(server.url, logger))
	await waitFor(() => server.conns.length === 4 && server.conns.every(conn => conn.frames.length >= 1), 'vier Client-Hellos')
	// Zuordnung Server-Verbindung -> Sitzung ueber die Reihenfolge der Hellos ist nicht sicher;
	// daher die Sitzung ueber ihren Socket-Port bestimmen
	const connOf = (session) => server.conns.find(conn => conn.ws._socket.remotePort === session.sock.ws.socket._socket.localPort)

	// B: ein Listener wirft beim Schliessen
	b.sock.ev.on('connection.update', (update) => {
		if (update.connection === 'close') throw new Error('kaputter Listener in Sitzung B')
	})
	connOf(b).ws.terminate()
	// D: Server antwortet auf das Hello mit Muell statt Handshake
	connOf(d).ws.send(Buffer.from([0, 0, 5, 1, 2, 3, 4, 5]))

	await waitFor(() => b.closes().length === 1 && d.closes().length === 1, 'B und D geschlossen')
	assert.ok(logs[1].errors.some(line => /connection\.update listener while closing/.test(line)), 'Fehler des Listeners wird geloggt')
	assert.ok(d.closes()[0].lastDisconnect.error instanceof Error)
	assertCleanedUp(b, 'B')
	assertCleanedUp(d, 'D')

	// A und C laufen weiter und koennen senden
	assert.equal(a.closes().length, 0)
	assert.equal(c.closes().length, 0)
	assert.equal(a.sock.ws.isOpen, true)
	assert.equal(c.sock.ws.isOpen, true)
	const framesBefore = connOf(a).frames.length
	await a.sock.sendRawMessage(Buffer.from('noch da'))
	await waitFor(() => connOf(a).frames.length === framesBefore + 1, 'A sendet weiter')

	a.sock.end(undefined)
	c.sock.end(undefined)
	await waitFor(() => server.conns.every(conn => conn.closed), 'alle Verbindungen zu')
	assertCleanedUp(a, 'A')
	assertCleanedUp(c, 'C')
	await waitFor(() => activeTimeouts() <= baselineTimeouts, 'keine zusaetzlichen Timer')
	await server.close()
	assert.deepEqual(outbound, [])
})

test('Wiederverbindung mit Backoff: kaputte Sitzung wartet wachsend, gesunde bleibt offen, keine Intervall-Lecks', async () => {
	// Pfad /bad wird sofort nach dem Hello geschlossen, /ok bleibt offen
	const server = await startServer((conn) => {
		if (conn.path === '/bad') {
			conn.ws.once('message', () => conn.ws.close())
		}
	})
	const { logger } = makeLogger()
	const healthy = startSession(server.url.replace('/ws/chat', '/ok'), logger)
	const backoff = makeReconnectBackoff({ initialDelayMs: 20, maxDelayMs: 80, factor: 2, jitter: 0 })
	const broken = []
	const attemptsAt = []
	const runBroken = async (rounds) => {
		for (let round = 0; round < rounds; round++) {
			attemptsAt.push(Date.now())
			const session = startSession(server.url.replace('/ws/chat', '/bad'), logger)
			broken.push(session)
			await waitFor(() => session.closes().length === 1, `kaputte Sitzung ${round} geschlossen`)
			assert.equal(session.closes()[0].lastDisconnect.error.output.statusCode, DisconnectReason.connectionClosed)
			await sleep(backoff.next())
		}
	}
	await runBroken(5)
	assert.equal(backoff.attempt, 5)
	const gaps = attemptsAt.slice(1).map((time, i) => time - attemptsAt[i])
	// Wartezeiten 20, 40, 80, 80 ms (+ Zeit fuer Auf-/Abbau)
	assert.ok(gaps[0] >= 20 && gaps[1] >= 40 && gaps[2] >= 80 && gaps[3] >= 80, `Abstaende wachsen: ${gaps.join(', ')}`)
	broken.forEach((session, i) => assertCleanedUp(session, `Versuch ${i}`))

	assert.equal(healthy.closes().length, 0)
	assert.equal(healthy.sock.ws.isOpen, true)
	healthy.sock.end(undefined)
	assertCleanedUp(healthy, 'gesunde Sitzung')
	await server.close()
	assert.deepEqual(outbound, [])
})

test('makeReconnectBackoff: Verlauf, Obergrenze, Streuung, reset und Pruefung der Optionen', () => {
	const fixed = makeReconnectBackoff({ random: () => 0.5 })
	assert.deepEqual(Array.from({ length: 9 }, () => fixed.next()), [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000])
	fixed.reset()
	assert.equal(fixed.attempt, 0)
	assert.equal(fixed.next(), 1000)

	const low = makeReconnectBackoff({ jitter: 0.2, random: () => 0 })
	const high = makeReconnectBackoff({ jitter: 0.2, random: () => 0.999999 })
	assert.equal(low.next(), 800)
	assert.equal(high.next(), 1200)
	for (let i = 0; i < 10; i++) {
		assert.ok(high.next() <= 60000, 'nie ueber maxDelayMs')
	}

	for (const bad of [{ factor: 0.5 }, { jitter: 2 }, { initialDelayMs: -1 }, { maxDelayMs: NaN }]) {
		assert.throws(() => makeReconnectBackoff(bad), RangeError)
	}
})

test.after(async () => {
	for (const sock of openSessions) sock.end(undefined)
	for (const server of openServers) await server.close()
	net.Socket.prototype.connect = originalConnect
	global.setInterval = originalSetInterval
	global.clearInterval = originalClearInterval
})
