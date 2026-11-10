import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Hls from '../public/vendor/hls.mjs';

test('shipped HLS player supports Stream separate audio renditions, including the cached legacy module URL',()=>{
  assert.equal(typeof Hls.DefaultConfig.audioStreamController,'function');
  assert.equal(typeof Hls.DefaultConfig.audioTrackController,'function');
  assert.deepEqual(readFileSync(new URL('../public/vendor/hls.light.mjs',import.meta.url)),readFileSync(new URL('../public/vendor/hls.mjs',import.meta.url)));
});
