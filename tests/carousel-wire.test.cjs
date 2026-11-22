'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { patchMessageForMdIfRequired, generateWAMessageFromContent } = require('../lib/Utils/messages.js');
const { proto } = require('../WAProto');

const sample = () => ({ interactiveMessage: { body: { text: 'Carousel' }, carouselMessage: { cards: [
  { header: { title: 'Categories', hasMediaAttachment: true, imageMessage: { mimetype: 'image/jpeg', mediaKey: Buffer.alloc(32) } },
    nativeFlowMessage: { buttons: [1, 2, 3].map(n => ({ name: 'single_select', buttonParamsJson: JSON.stringify({
      title: 'Group ' + n, sections: [{ title: 'Categories', rows: [{ title: 'Option ' + n, id: '!menu ' + n }] }]
    }) })) } },
  { header: { title: 'Links', hasMediaAttachment: true, imageMessage: { mimetype: 'image/jpeg', mediaKey: Buffer.alloc(32) } },
    nativeFlowMessage: { buttons: [1, 2, 3].map(n => ({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Link ' + n, url: 'https://example.com/' + n }) })) } }
] } } });

test('transport patch keeps raw multi-select carousel wire shape and caller metadata', () => {
  const input = sample(); input.messageContextInfo = { messageSecret: Buffer.alloc(32, 9) };
  assert.equal(patchMessageForMdIfRequired(input), input);
  const generated = generateWAMessageFromContent('12345@s.whatsapp.net', input, { userJid: '67890@s.whatsapp.net' });
  const wire = proto.Message.decode(proto.Message.encode(patchMessageForMdIfRequired(generated.message)).finish());
  assert.ok(wire.interactiveMessage.carouselMessage);
  assert.equal(wire.viewOnceMessageV2Extension, null);
  assert.equal(wire.interactiveMessage.carouselMessage.cards.length, 2);
  assert.deepEqual(wire.interactiveMessage.carouselMessage.cards[0].nativeFlowMessage.buttons.map(b => b.name), ['single_select', 'single_select', 'single_select']);
  assert.equal(wire.messageContextInfo.messageSecret.length, 32);
});

test('single-card interactive, buttons, list and template retain their existing MD patch', () => {
  for (const key of ['interactiveMessage', 'buttonsMessage', 'listMessage', 'templateMessage']) {
    const input = { [key]: {} }, result = patchMessageForMdIfRequired(input);
    assert.equal(result.viewOnceMessageV2Extension.message[key], input[key]);
    assert.equal(result.viewOnceMessageV2Extension.message.messageContextInfo.deviceListMetadataVersion, 2);
    assert.equal(input.viewOnceMessageV2Extension, undefined);
  }
});

test('explicit carousel wrappers, ephemeral messages and ordinary messages are not rewritten', () => {
  for (const input of [
    { viewOnceMessage: { message: sample() } },
    { viewOnceMessageV2Extension: { message: sample() } },
    { ephemeralMessage: { message: sample() } },
    { conversation: 'Normal message' }
  ]) assert.equal(patchMessageForMdIfRequired(input), input);
});

test('cards via generateWAMessageContent: image cards, buttons and texts survive generation, MD patch and protobuf', async () => {
  // direkt aus dem Modul: diese Datei laedt lib/Utils/messages.js vor dem Paket-Index
  const { generateWAMessageContent } = require('../lib/Utils/messages.js');
  const uploads = [];
  // fake upload instead of WhatsApp media servers - no network.
  // Images are uploaded in parallel, so the call order varies: derive the
  // path from the uploaded file's own hash instead of the call order.
  const upload = async (_stream, opts) => {
    uploads.push(opts.mediaType);
    return { mediaUrl: 'https://example.invalid/m/' + opts.fileEncSha256B64, directPath: '/m/' + opts.fileEncSha256B64 };
  };
  const sha256 = (buf) => require('node:crypto').createHash('sha256').update(buf).digest();
  const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {}, child() { return logger; } };
  const content = await generateWAMessageContent({
    text: 'Menu', footer: 'Onimai',
    cards: [1, 2, 3].map(n => ({
      image: Buffer.alloc(64, n), title: 'Card ' + n, body: 'Body ' + n, footer: 'Footer ' + n,
      buttons: [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Pick ' + n, id: '!pick ' + n }) },
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Open', url: 'https://example.com/' + n }) }
      ]
    }))
  }, { upload, logger });
  assert.deepEqual([...uploads].sort(), ['image', 'image', 'image']);
  assert.equal(patchMessageForMdIfRequired(content), content, 'raw carousel stays unwrapped');
  const wire = proto.Message.decode(proto.Message.encode(content).finish());
  const cards = wire.interactiveMessage.carouselMessage.cards;
  assert.equal(cards.length, 3);
  assert.equal(wire.interactiveMessage.body.text, 'Menu');
  assert.equal(wire.interactiveMessage.footer.text, 'Onimai');
  cards.forEach((card, i) => {
    assert.equal(card.header.title, 'Card ' + (i + 1));
    assert.equal(card.header.hasMediaAttachment, true);
    const image = card.header.imageMessage;
    // path belongs to this card's own encrypted file ...
    assert.equal(image.directPath, '/m/' + Buffer.from(image.fileEncSha256).toString('base64'));
    // ... and the plaintext hash is this card's own image (no card got another one's)
    assert.deepEqual(Buffer.from(image.fileSha256), sha256(Buffer.alloc(64, i + 1)));
    assert.equal(card.header.imageMessage.mediaKey.length, 32);
    assert.equal(card.body.text, 'Body ' + (i + 1));
    assert.equal(card.footer.text, 'Footer ' + (i + 1));
    assert.deepEqual(card.nativeFlowMessage.buttons.map(b => [b.name, JSON.parse(b.buttonParamsJson).display_text]), [['quick_reply', 'Pick ' + (i + 1)], ['cta_url', 'Open']]);
  });
});
