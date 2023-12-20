const path = require('node:path');
const binary = require('@mapbox/node-pre-gyp');
const { Writable, Readable } = require('node:stream');

const binding_path = binary.find(path.resolve(__dirname, '..', 'package.json'));
const ffmpeg = require(binding_path);

ffmpeg.ReadableCustomIO.init(Readable);
Object.setPrototypeOf(ffmpeg.ReadableCustomIO, Readable);
Object.setPrototypeOf(ffmpeg.ReadableCustomIO.prototype, Readable.prototype);

ffmpeg.WritableCustomIO.init(Writable);
Object.setPrototypeOf(ffmpeg.WritableCustomIO, Writable);
Object.setPrototypeOf(ffmpeg.WritableCustomIO.prototype, Writable.prototype);

module.exports = ffmpeg;
