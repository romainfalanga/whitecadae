// Bundle the pinned upstream player as a same-origin asset; never use a CDN
// script at runtime. Its license stays next to the generated file.
import {copyFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url),root=dirname(require.resolve('hls.js/package.json'));
const target=new URL('../public/vendor/',import.meta.url);mkdirSync(target,{recursive:true});
copyFileSync(join(root,'dist/hls.light.mjs'),new URL('hls.light.mjs',target));
copyFileSync(join(root,'LICENSE'),new URL('hls-LICENSE.txt',target));
