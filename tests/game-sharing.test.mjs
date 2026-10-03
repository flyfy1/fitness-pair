import test from 'node:test';
import assert from 'node:assert/strict';
import {gameCatalog} from '../apps/arcade/game-catalog.js';
import {gameShareMessage,gameSocialLinks} from '../apps/arcade/src/game-sharing.js';

test('every game invitation preserves the selected language and only exposes a game URL',()=>{
 assert.equal(new URL(gameShareMessage(gameCatalog[0]).url).origin,'https://fitness.integ.life');
 for(const game of gameCatalog)for(const language of ['en','zh']){
  const invitation=gameShareMessage(game,{language,origin:'https://example.test/secret?share=never&manage=never'}),url=new URL(invitation.url);
  assert.equal(url.pathname,'/play/'+game.id);assert.deepEqual([...url.searchParams],[['lang',language]]);
  assert.match(invitation.text,language==='zh'?/来 Hopmodo 试试/ : /Try .* on Hopmodo!/);
  assert.ok(!invitation.text.includes('never'));assert.ok(!invitation.text.includes('/clips/'));
  const links=new Map(gameSocialLinks(invitation));
  assert.equal(new URL(links.get('X (Twitter)')).searchParams.get('text'),invitation.text);
  assert.equal(new URL(links.get('WhatsApp')).searchParams.get('text'),invitation.text);
  assert.equal(links.get('Instagram'),'https://www.instagram.com/');
 }
});
