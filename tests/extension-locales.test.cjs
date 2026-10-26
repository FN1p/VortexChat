const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=path.join(__dirname,'../extension');
test('extension provides self-contained RU/EN metadata',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
 assert.equal(manifest.default_locale,'ru');
 for(const language of ['ru','en']){
  const locale=JSON.parse(fs.readFileSync(path.join(dir,'_locales',language,'messages.json'),'utf8'));
  assert.equal(manifest.name,'__MSG_extensionName__');
  assert.equal(manifest.description,'__MSG_extensionDescription__');
  for(const key of ['extensionName','extensionDescription'])assert.ok(locale[key]?.message?.includes('VortexChat')||locale[key]?.message?.includes('Twitch'));
 }
});
test('independent extension manifest has no external chat relay dependencies',()=>{
 const manifest=fs.readFileSync(path.join(dir,'manifest.json'),'utf8');
 assert.equal(/chat\.eblo\.id/i.test(manifest),false);
});
