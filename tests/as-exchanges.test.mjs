import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pages=readFileSync(new URL('../public/private-pages.js',import.meta.url),'utf8');
const comments=readFileSync(new URL('../public/as-comments.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/private-pages.css',import.meta.url),'utf8');

test('AS exchanges open right under the video, beside it on wide screens, with a clear label',()=>{
  const toggle=pages.slice(pages.indexOf('async function toggleInlineComments('),pages.indexOf('async function loadDrafts('));
  assert.match(toggle,/footer\.after\(root\)/);assert.doesNotMatch(toggle,/closest\('\.video-card'\)\.append\(root\)/);
  assert.match(toggle,/classList\.add\('has-comments'\)/);assert.match(toggle,/classList\.remove\('has-comments'\)/);
  assert.match(toggle,/title:own\?'Expansions harmonieuses de tes AS':'Expansions harmonieuses'/);
  const viewer=pages.slice(pages.indexOf('function openVideoViewer('),pages.indexOf('function clearInlineComments('));
  assert.match(viewer,/button\(expansionIcon\(\)\+'AS','','quiet',`aria-label="Expansions harmonieuses des AS" data-video-comments=/);assert.match(viewer,/matchMedia\?\.\('\(min-width: 900px\)'\)\.matches\)void run\(asButton/);
  assert.match(css,/\.has-comments \.video-viewer\{display:grid;grid-template-columns:minmax\(0,1fr\) 360px/);
});

test('each message reads as a conversation: avatar, bubble, relative date and its actions',()=>{
  assert.match(comments,/class="as-message ace-message topic-reply/);assert.match(comments,/<span class="as-avatar"/);assert.match(comments,/class="as-bubble"/);
  for(const hook of ['data-reply','data-delete','data-report','data-close','data-cancel','data-parent','data-new','data-status','name="message"'])assert.ok(comments.includes(hook),hook);
  assert.match(comments,/own\?'Toi':m\.author\.username/);assert.match(comments,/class="as-send" aria-label="Envoyer"/);
  const when=new Function(comments.slice(comments.indexOf('function when('),comments.indexOf('export async function mountComments'))+';return when;')();
  const ago=ms=>new Date(Date.now()-ms).toISOString().replace('T',' ').slice(0,19);
  assert.equal(when(ago(10e3)),'à l’instant');assert.equal(when(ago(5*60e3)),'il y a 5 min');assert.equal(when(ago(3*3600e3)),'il y a 3 h');assert.equal(when(ago(26*3600e3)),'hier');assert.equal(when(ago(3*86400e3)),'il y a 3 j');
});

test('comments are « expansions harmonieuses » with one shared icon in the Loges and between AS',()=>{
  const loge=readFileSync(new URL('../public/loge.js',import.meta.url),'utf8'),model=readFileSync(new URL('../public/video-model.js',import.meta.url),'utf8');
  for(const source of [loge,comments,pages.slice(pages.indexOf('function openVideoViewer('),pages.indexOf('async function loadDrafts('))])assert.doesNotMatch(source,/[Cc]ommentaires?\b(?![A-Za-z])(?=[^'"`]*['"`<])/);
  assert.match(comments,/Aucune expansion harmonieuse pour le moment\./);assert.match(loge,/Aucune expansion harmonieuse pour le moment\./);
  assert.match(loge,/comment:EXPANSION_ICON_PATHS/);assert.match(pages,/button\(expansionIcon\(\)\+'AS'/);assert.match(model,/export const EXPANSION_ICON_PATHS=/);
});


test('the videography offers « Mes sériographies », plays a sériographie in order and never shows fullscreen',()=>{
  assert.match(pages,/heading\('Vidéographie','',`<button type="button" class="series-open" id="series-open">/);assert.match(pages,/bind\('series-open',\(\)=>seriesList\(\)\)/);
  assert.match(pages,/function openVideoViewer\(index,list=null\)/);assert.match(pages,/if\(list\)\{if\(live\(s\)&&list\.events\[next\]\)openVideoViewer\(next,list\);return;\}/);
  assert.match(pages,/api\('\/api\/life-tree\/series\/'\+encodeURIComponent\(id\),\{method:'PUT',body:\{title:form\.elements\.title\.value,items:picked,revision:item\?\.revision\|\|0\}\}\)/);
  assert.match(pages,/createStreamPlayer\(\{container,post:\{id:container\.dataset\.streamEvent,title:container\.dataset\.streamTitle\},fullscreen:false,/);
  const series=pages.slice(pages.indexOf('async function seriesList('),pages.indexOf('function clearInlineComments('));
  assert.doesNotMatch(series,/private-note|<p>(?!\$)/,'no explanation text in the sériographies screens');
});
