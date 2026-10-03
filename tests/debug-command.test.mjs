import test from 'node:test';
import assert from 'node:assert/strict';
import {isDebugCommand} from '../apps/arcade/src/gameplay/debug-command.js';
test('explicit English and Chinese debug commands accept case and punctuation',()=>{
 for(const phrase of ['debug please','DEBUG, PLEASE!','Please debug.','upload debug','我要上传 debug','我要上传调试','开始调试'])assert.equal(isDebugCommand(phrase),true,phrase);
 for(const phrase of ['debug','please','do not debug please','this game needs debug please help','',null])assert.equal(isDebugCommand(phrase),false,String(phrase));
});
