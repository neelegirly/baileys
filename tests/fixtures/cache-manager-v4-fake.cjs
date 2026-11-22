'use strict'
// Kleine Attrappe der cache-manager-v4-API (caching(config) -> get/set/del/store.keys),
// nur fuer tests/optional-peers.test.cjs. Speichert alles in einer Map.
const shared = new Map()

const caching = (config) => {
	const store = {
		config,
		entries: shared,
		keys: async (pattern) => {
			const prefix = String(pattern || '').replace(/\*$/, '')
			return [...shared.keys()].filter(key => key.startsWith(prefix))
		}
	}
	module.exports.lastStore = store
	return {
		store,
		get: async (key) => shared.get(key)?.value,
		set: async (key, value, ttl) => {
			shared.set(key, { value, ttl })
		},
		del: async (key) => {
			shared.delete(key)
		}
	}
}

module.exports = { caching, lastStore: null }
