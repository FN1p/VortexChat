const test=require('node:test');const assert=require('node:assert/strict');
const {newer}=require('../desktop-app/updater');
test('release comparison handles beta tags and multiple digits',()=>{
 assert.equal(newer('v1.3.7-beta.1','1.3.6'),true);
 assert.equal(newer('v1.3.6-beta.3','1.3.6'),false);
 assert.equal(newer('v1.10.0','1.9.9'),true);
 assert.equal(newer('invalid','1.3.6'),false);
});
