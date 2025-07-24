const path = require('node:path');
const os = require('node:os');
const { Writable, Readable } = require('node:stream');

const binding_path = path.resolve(__dirname, '..', 'lib', 'binding',
  `${os.platform()}-${os.arch()}`, 'node-ffmpeg.node');
const ffmpeg = require(binding_path);

ffmpeg.ReadableCustomIO.init(Readable);
Object.setPrototypeOf(ffmpeg.ReadableCustomIO, Readable);
Object.setPrototypeOf(ffmpeg.ReadableCustomIO.prototype, Readable.prototype);

ffmpeg.WritableCustomIO.init(Writable);
Object.setPrototypeOf(ffmpeg.WritableCustomIO, Writable);
Object.setPrototypeOf(ffmpeg.WritableCustomIO.prototype, Writable.prototype);

ffmpeg.BufferSinkFilterContext.prototype.getAudioFrameAsync = function () {
  return ffmpeg._getAudioFrameAsync(this, ...arguments);
};
ffmpeg.BufferSinkFilterContext.prototype.getVideoFrameAsync = function () {
  return ffmpeg._getVideoFrameAsync(this, ...arguments);
};

module.exports = ffmpeg;
