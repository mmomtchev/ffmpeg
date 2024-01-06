import { assert } from 'chai';

import ffmpeg from '@mmomtchev/ffmpeg';
import { Demuxer } from '@mmomtchev/ffmpeg/stream';

it('import as ES6', () => {
  assert.isNumber(ffmpeg.AV_LOG_DEBUG);
  assert.isFunction(Demuxer);
});
