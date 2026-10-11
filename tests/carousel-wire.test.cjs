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
