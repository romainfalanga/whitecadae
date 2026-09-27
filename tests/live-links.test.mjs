import {test} from 'node:test';
import assert from 'node:assert/strict';
import {liveLink} from '../src/live-links.js';
test('public live links normalize YouTube shares, Twitch channels and Discord invites without tracking',()=>{
  for(const url of ['https://youtu.be/abcdefghijk?si=tracking','https://www.youtube.com/watch?v=abcdefghijk&secret=removed','https://youtube.com/live/abcdefghijk?feature=share','https://m.youtube.com/watch?v=abcdefghijk'])assert.deepEqual(liveLink(url),{provider:'youtube',label:'YouTube',id:'abcdefghijk',url:'https://www.youtube.com/watch?v=abcdefghijk'});
  assert.equal(liveLink('https://twitch.tv/Example_Channel/').url,'https://www.twitch.tv/example_channel');
  assert.equal(liveLink('https://discord.com/invite/Abcd123').url,'https://discord.gg/Abcd123');assert.equal(liveLink('https://discord.com/channels/123456789012345678/123456789012345679').provider,'discord');assert.equal(liveLink(''),null);
});
test('live links reject lookalike domains, credentials, arbitrary iframes and unsupported channel URLs',()=>{
  for(const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=abcdefghijk','https://twitch.tv@evil.test/example','https://user:pass@twitch.tv/example','https://twitch.tv:8443/example','http://youtube.com/watch?v=abcdefghijk','https://example.org/video','https://www.youtube.com/@example/live','https://twitch.tv/directory','https://discord.gg/abc/extra','https://youtu.be/abc','https://youtu.be/<script>'])assert.throws(()=>liveLink(url),undefined,url);
});
