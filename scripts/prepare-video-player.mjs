// Bundle the pinned upstream player as a same-origin asset; never use a CDN
// script at runtime. Its license stays next to the generated file.
import {copyFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url),root=dirname(require.resolve('hls.js/package.json'));
const target=new URL('../public/vendor/',import.meta.url);mkdirSync(target,{recursive:true});
// Stream exposes audio through EXT-X-MEDIA as a separate rendition. The light
// build omits alternate-audio support and would play these videos silently.
copyFileSync(join(root,'dist/hls.min.mjs'),new URL('hls.mjs',target));
// Preserve the previous module URL for clients with an older cached controller.
copyFileSync(join(root,'dist/hls.min.mjs'),new URL('hls.light.mjs',target));
copyFileSync(join(root,'LICENSE'),new URL('hls-LICENSE.txt',target));
