import * as path from 'node:path';
import * as os from 'node:os';
import { Writable, Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dir } from 'node:console';

const dirname = path.dirname(fileURLToPath(import.meta.url));
console.log(dirname);

const binding_path = path.resolve(dirname, '..', 'lib', 'binding',
  `${os.platform()}-${os.arch()}`, 'node-ffmpeg.node');
const requireBindings = createRequire(dirname);
const ffmpeg = requireBindings(binding_path);

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

const { CodecContext,
  error_code,
  ErrorCode,
  findEncodingCodecFormat,
  findEncodingCodecFormatAsync,
  findEncodingCodec,
  findEncodingCodecAsync,
  findDecodingCodec,
  findDecodingCodecAsync,
  FormatContext,
  VideoDecoderContext,
  VideoEncoderContext,
  AudioDecoderContext,
  AudioEncoderContext,
  OutputFormat,
  InputFormat,
  Codec,
  CodecParametersView,
  PixelFormat,
  SampleFormat,
  ChannelLayout,
  ChannelLayoutView,
  Stream,
  Packet,
  VideoFrame,
  AudioSamples,
  Timestamp,
  Rational,
  VideoRescaler,
  AudioResampler,
  Filter,
  FilterGraph,
  FilterContext,
  BufferSrcFilterContext,
  BufferSinkFilterContext,
  WritableCustomIO,
  ReadableCustomIO,
  setLogLevel } = ffmpeg;

export {
  CodecContext,
  error_code,
  ErrorCode,
  findEncodingCodecFormat,
  findEncodingCodecFormatAsync,
  findEncodingCodec,
  findEncodingCodecAsync,
  findDecodingCodec,
  findDecodingCodecAsync,
  FormatContext,
  VideoDecoderContext,
  VideoEncoderContext,
  AudioDecoderContext,
  AudioEncoderContext,
  OutputFormat,
  InputFormat,
  Codec,
  CodecParametersView,
  PixelFormat,
  SampleFormat,
  ChannelLayout,
  ChannelLayoutView,
  Stream,
  Packet,
  VideoFrame,
  AudioSamples,
  Timestamp,
  Rational,
  VideoRescaler,
  AudioResampler,
  Filter,
  FilterGraph,
  FilterContext,
  BufferSrcFilterContext,
  BufferSinkFilterContext,
  WritableCustomIO,
  ReadableCustomIO,
  setLogLevel
};

