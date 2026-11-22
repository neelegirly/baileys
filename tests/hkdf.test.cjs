'use strict'
// HKDF (RFC 5869, SHA-256) ueber WebCrypto in lib/Utils/crypto.js.
// Haelt das Verhalten fest, das frueher futoin-hkdf lieferte: die festen
// Hexwerte unten wurden am 2026-11-21 mit futoin-hkdf@1.5.3, Node
// crypto.hkdfSync und der WebCrypto-Fassung gegengeprueft (alle gleich).
const test = require('node:test')
const assert = require('node:assert/strict')
const { hkdfSync } = require('node:crypto')
const { hkdf, getMediaKeys, hkdfInfoKey, MEDIA_HKDF_KEY_MAPPING } = require('../lib')

const range = (from, to) => Buffer.from(Array.from({ length: to - from + 1 }, (_, i) => from + i))

test('RFC 5869 A.1 bis A.3 (SHA-256)', async () => {
	const vectors = [
		{
			ikm: Buffer.alloc(22, 0x0b), salt: range(0x00, 0x0c), info: range(0xf0, 0xf9), len: 42,
			okm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
		},
		{
			ikm: range(0x00, 0x4f), salt: range(0x60, 0xaf), info: range(0xb0, 0xff), len: 82,
			okm: 'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87'
		},
		{
			ikm: Buffer.alloc(22, 0x0b), salt: undefined, info: undefined, len: 42,
			okm: '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8'
		}
	]
	for (const v of vectors) {
		const out = await hkdf(v.ikm, v.len, { salt: v.salt, info: v.info })
		assert.ok(Buffer.isBuffer(out))
		assert.equal(out.toString('hex'), v.okm)
	}
})

const IKM = Buffer.from(Array.from({ length: 32 }, (_, i) => i))

test('WhatsApp-Infos: feste Werte (Medien, App-State, Medien-Retry, adv_secret, Noise mit Salt)', async () => {
	const pinned = [
		[112, { info: 'WhatsApp Image Keys' }, 'aa6a127218397cbd2383e4ccf7176a79008c9aea9b7c5d81eb56b3f530f87d42dcc92d27b11ad6b5bd66f0560d0d8c4691d09ffec108833c1699574c52657923fb6e3e161d9698bc6b3a05fbc508a5154d4981725e9eb39838fcff2130508f1360cbb319f99cef163d57ab7c050a667e'],
		[160, { info: 'WhatsApp Mutation Keys' }, '61387bcf643616a68bd611a45516b3980418323087d78bf08c615645549434b4900ba2843ba5fb0cee55cf2a4de9503dce68187d3f6b95b420b008bde66f5a20d0879f6b61f0bcba79faad3f47a8a768fd7fc04a6cc8b3ecefedfa087413226f69b2e91be6587307c43c29b027a71fdd55be25f07ca726714115430d23093071693845bdd996652aca9ca0b96d0f081abf29943303c5eb19bdb84f38b24c32ab'],
		[32, { info: 'WhatsApp Media Retry Notification' }, 'c84dfe50a708e0ec382a7ad2ba40135256f41b652cebe2129661d27871111cb2'],
		[32, { info: 'adv_secret' }, 'c2688fa0d4a30386be77f6b8925b2b99014230b2f904a5c6a2e287537592b099'],
		[64, { salt: Buffer.alloc(32, 7), info: '' }, '6f085edfba5644b58cedee103961c9965bc00aa0cc07037566d18a4cb3c56cf7f2eb548f4eb721a212dfb242f22b5d76f14f8b05ba06e6f8d4b1189aeeaf4928']
	]
	for (const [len, info, expected] of pinned) {
		assert.equal((await hkdf(IKM, len, info)).toString('hex'), expected, JSON.stringify(info))
	}
})

test('alle Medientypen stimmen mit Node crypto.hkdfSync ueberein', async () => {
	for (const type of Object.keys(MEDIA_HKDF_KEY_MAPPING)) {
		const info = hkdfInfoKey(type)
		const ours = await hkdf(IKM, 112, { info })
		const ref = Buffer.from(hkdfSync('sha256', IKM, Buffer.alloc(0), Buffer.from(info), 112))
		assert.deepEqual(ours, ref, type)
	}
})

test('getMediaKeys teilt die 112 Bytes wie bisher in iv/cipherKey/macKey', async () => {
	const keys = await getMediaKeys(IKM, 'image')
	assert.equal(keys.iv.toString('hex'), 'aa6a127218397cbd2383e4ccf7176a79')
	assert.equal(keys.cipherKey.toString('hex'), '008c9aea9b7c5d81eb56b3f530f87d42dcc92d27b11ad6b5bd66f0560d0d8c46')
	assert.equal(keys.macKey.toString('hex'), '91d09ffec108833c1699574c52657923fb6e3e161d9698bc6b3a05fbc508a515')
	// Base64-Schluessel (wie in Nachrichten gespeichert) ergeben dasselbe
	assert.deepEqual(await getMediaKeys(IKM.toString('base64'), 'image'), keys)
})

test('Eingaben als Uint8Array und Teil-Views eines groesseren Puffers', async () => {
	const big = Buffer.concat([Buffer.alloc(5, 0xff), IKM, Buffer.alloc(3, 0xee)])
	const view = big.subarray(5, 5 + 32)
	const a = await hkdf(view, 32, { info: 'adv_secret' })
	const b = await hkdf(new Uint8Array(IKM), 32, { info: new TextEncoder().encode('adv_secret') })
	assert.equal(a.toString('hex'), 'c2688fa0d4a30386be77f6b8925b2b99014230b2f904a5c6a2e287537592b099')
	assert.deepEqual(a, b)
})
