const { assert } = require('chai');

const ffmpeg = require('@mmomtchev/ffmpeg');
const { Demuxer } = require('@mmomtchev/ffmpeg/stream');

it('require as CJS', () => {
  assert.isNumber(ffmpeg.AV_LOG_DEBUG);
  assert.isFunction(Demuxer);
});
