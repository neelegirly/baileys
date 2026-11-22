const {test}=require('node:test');
const assert=require('node:assert/strict');
const {proto,generateWAMessageFromContent,prepareInteractiveMessageForMd}=require('../lib');

const card={interactiveMessage:{
 header:{title:'Onimai',hasMediaAttachment:true,videoMessage:{gifPlayback:true,mimetype:'video/mp4',url:'https://example.invalid/menu.mp4'}},
 body:{text:'Profil und Kategorien'},footer:{text:'Onimai'},
 contextInfo:{stanzaId:'quoted',participant:'12345@s.whatsapp.net'},
 nativeFlowMessage:{messageVersion:1,buttons:Array.from({length:10},(_,i)=>({name:'quick_reply',buttonParamsJson:JSON.stringify({display_text:'Kategorie '+i,id:'!menu kategorie '+i})}))}
}};

test('Eine MD-Hülle erhält GIF, alle Knöpfe, Text, IDs und Zitat im echten Protobuf',()=>{
 const original=JSON.stringify(card),wrapped=prepareInteractiveMessageForMd(card);
 assert.deepEqual(wrapped.viewOnceMessageV2Extension.message.interactiveMessage,card.interactiveMessage);
 assert.equal(prepareInteractiveMessageForMd(wrapped),wrapped);
 const generated=generateWAMessageFromContent('12345@s.whatsapp.net',wrapped,{userJid:'67890@s.whatsapp.net',messageId:'one-card'});
 const decoded=proto.Message.decode(proto.Message.encode(generated.message).finish());
 const inner=decoded.viewOnceMessageV2Extension.message;
 assert.equal(inner.messageContextInfo.deviceListMetadataVersion,2);
 assert.equal(inner.interactiveMessage.header.videoMessage.gifPlayback,true);
 assert.equal(inner.interactiveMessage.nativeFlowMessage.buttons.length,10);
 assert.equal(inner.interactiveMessage.contextInfo.stanzaId,'quoted');
 assert.equal(generated.key.id,'one-card');assert.equal(JSON.stringify(card),original);
});

test('Vorhandene Hüllen werden ergänzt, nicht verdoppelt; Metadaten bleiben erhalten',()=>{
 for(const name of ['viewOnceMessage','viewOnceMessageV2','viewOnceMessageV2Extension']){
  const input={[name]:{message:{...card,messageContextInfo:{messageSecret:Buffer.from([1,2,3])}}}};
  const output=prepareInteractiveMessageForMd(input),inner=output[name].message;
  assert.deepEqual(inner.messageContextInfo.messageSecret,Buffer.from([1,2,3]));
  assert.equal(inner.messageContextInfo.deviceListMetadataVersion,2);
  for(const other of ['viewOnceMessage','viewOnceMessageV2','viewOnceMessageV2Extension'])assert.equal(inner[other],undefined);
  assert.equal(input[name].message.messageContextInfo.deviceListMetadataVersion,undefined);
 }
});

test('Ephemeral-Verpackung und Nicht-Karten bleiben erhalten',()=>{
 const text={conversation:'Hallo'};assert.equal(prepareInteractiveMessageForMd(text),text);
 assert.equal(prepareInteractiveMessageForMd(null),null);
 const input={ephemeralMessage:{message:card}},output=prepareInteractiveMessageForMd(input);
 assert.deepEqual(output.ephemeralMessage.message.viewOnceMessageV2Extension.message.interactiveMessage,card.interactiveMessage);
 assert.equal(prepareInteractiveMessageForMd(output),output);
});

test('interactiveButtons über generateWAMessageContent: Knöpfe byte-genau, Zitat/Erwähnungen, eine MD-Hülle',async()=>{
 const {generateWAMessageContent}=require('../lib');
 const buttons=[
  {name:'quick_reply',buttonParamsJson:JSON.stringify({display_text:'Ja ✅',id:'!ja'})},
  {name:'cta_url',buttonParamsJson:JSON.stringify({display_text:'Öffnen',url:'https://example.com/ä?x=1&y=2'})},
  {name:'cta_copy',buttonParamsJson:JSON.stringify({display_text:'Code',copy_code:'ONIMAI-123'})},
  {name:'single_select',buttonParamsJson:JSON.stringify({title:'Liste',sections:[{title:'A',rows:[{title:'Eins',id:'!1'},{title:'Zwei',id:'!2'}]}]})}
 ];
 const content=await generateWAMessageContent({text:'Wähle',title:'Titel',subtitle:'Unter',footer:'Fuß',interactiveButtons:buttons,mentions:['12345@s.whatsapp.net'],contextInfo:{stanzaId:'Q1'}},{logger:undefined});
 const wrapped=prepareInteractiveMessageForMd(content);
 const decoded=proto.Message.decode(proto.Message.encode(wrapped).finish());
 const msg=decoded.viewOnceMessageV2Extension.message.interactiveMessage;
 assert.equal(msg.body.text,'Wähle');
 assert.equal(msg.header.title,'Titel');
 assert.equal(msg.header.subtitle,'Unter');
 assert.equal(msg.footer.text,'Fuß');
 assert.deepEqual(msg.nativeFlowMessage.buttons.map(b=>({name:b.name,buttonParamsJson:b.buttonParamsJson})),buttons);
 assert.deepEqual(msg.contextInfo.mentionedJid,['12345@s.whatsapp.net']);
 assert.equal(msg.contextInfo.stanzaId,'Q1');
 assert.equal(decoded.viewOnceMessageV2Extension.message.messageContextInfo.deviceListMetadataVersion,2);
});
