import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const renderer=source.slice(source.indexOf('function lyricLineMarkup('),source.indexOf('// Échelon owns'));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function render(slug,text){
  const context={app:{innerHTML:''},document:{},esc,newEpoch:()=>1,stale:()=>false,WCPlayer:{findTrack:()=>({albumId:'57',album:'57'})},api:async()=>({song:{slug,title:slug},lines:text.split('\n').map(text=>({text}))})};
  await runInNewContext(renderer+'\npageSong('+JSON.stringify(slug)+')',context);
  return context.app.innerHTML;
}

test('the complete lyric corpus keeps every sung line in order and turns standalone markers into headings',async()=>{
  const directory=new URL('../lyrics/',import.meta.url);
  for(const file of readdirSync(directory).filter(file=>file.endsWith('.txt'))){
    const text=readFileSync(new URL(file,directory),'utf8'),html=await render(file.slice(0,-4),text);
    const expected=text.split('\n').filter(line=>line.trim()&&!/^\s*\[[^\]]+\]\s*$/.test(line)).map(esc);
    const actual=[...html.matchAll(/<p>(.*?)<\/p>/g)].map(match=>match[1].replace(/<a [^>]+>(.*?)<\/a>/g,'$1'));
    assert.deepEqual(actual,expected,file);
    const markers=text.split('\n').filter(line=>/^\s*\[[^\]]+\]\s*$/.test(line));
    assert.equal((html.match(/<h2 class="lyrics-section-title"/g)||[]).length,markers.length,file);
    assert.doesNotMatch(html,/<h2[^>]*>\s*\[/,file);
  }
});

test('unlabelled openings, numbered or lowercase markers and inline brackets keep their meaning and remain escaped',async()=>{
  const html=await render('example',"\nAvant les sections.\n\n[couplet 1]\nUne ligne <script>alert(1)</script>\n\nUne autre strophe.\n[Verse 2]\nDes [mots] chantés.\n[pont]\nFin.\n\n");
  assert.deepEqual([...html.matchAll(/<h2[^>]+>(.*?)<\/h2>/g)].map(match=>match[1]),['Couplet 1','Couplet 2','Pont']);
  assert.match(html,/Avant les sections\./);assert.match(html,/Des \[mots\] chantés\./);
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<div class="lyrics-stanza"><\/div>/);
  assert.equal((html.match(/class="lyrics-stanza"/g)||[]).length,5);
  assert.match(await render('empty','\n\n'),/Les paroles de ce morceau seront bientôt disponibles/);
});

test('13h20 retains its sign link and album return in the new section layout, without restoring removed controls',async()=>{
  const html=await render('13h20',readFileSync(new URL('../lyrics/13h20.txt',import.meta.url),'utf8'));
  assert.deepEqual([...html.matchAll(/<h2[^>]+>(.*?)<\/h2>/g)].map(match=>match[1]),['Intro','Couplet','Refrain','Couplet','Pont','Refrain']);
  assert.equal((html.match(/href="\/sans-vin-divin"/g)||[]).length,1);
  assert.match(html,/>sans vin divin<\/a>/);assert.match(html,/href="\/musique#album-57"/);
  assert.doesNotMatch(html,/class="eyebrow"|data-play-track|Écouter le morceau|[→↗]/);
});
