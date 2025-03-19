import { EventEmitter, Readable, ReadableOptions, Transform, TransformOptions, Writable } from 'node:stream';
import ffmpeg from '@mmomtchev/ffmpeg';

export const StreamTypes = {
  'Audio': 'Audio',
  'Video': 'Video',
  'Subtitle': 'Subtitle',
  'Data': 'Data'
} as const;

export type StreamType = keyof typeof StreamTypes;

export interface MediaStreamDefinition {
  type: StreamType;
  bitRate: number;
  codec: ffmpeg.AVCodecID | ffmpeg.Codec;
  timeBase?: ffmpeg.Rational;
  codecOptions?: Record<string, string>;
}

export interface VideoStreamDefinition extends MediaStreamDefinition {
  type: 'Video';
  width: number;
  height: number;
  frameRate: ffmpeg.Rational;
  pixelFormat: ffmpeg.PixelFormat;
  flags?: number;
}

export interface AudioStreamDefinition extends MediaStreamDefinition {
  type: 'Audio';
  channelLayout: ffmpeg.ChannelLayout;
  sampleFormat: ffmpeg.SampleFormat;
  sampleRate: number;
  frameSize?: number;
}

export function isVideoDefinition(def: MediaStreamDefinition): def is VideoStreamDefinition {
  return def.type === 'Video';
}

export function isAudioDefinition(def: MediaStreamDefinition): def is AudioStreamDefinition {
  return def.type === 'Audio';
}

export interface MediaTransformOptions extends TransformOptions {
  objectMode?: never;
}

/**
 * A generic user-definable MediaTransform, uses object mode.
 */
export class MediaTransform extends Transform {
  constructor(options?: MediaTransformOptions) {
    super({ ...(options || {}), objectMode: true });
  }
}

/**
 * A generic raw MediaStream, has a definition and it is an EventEmitter.
 */
export interface MediaStream extends EventEmitter {
  ready: boolean;
  definition(): MediaStreamDefinition;
  codec(): ffmpeg.Codec;
}

/**
 * A generic encoding MediaStream
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MediaEncoder extends MediaStream { }

/**
 * A generic decoding MediaStream
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MediaDecoder extends MediaStream { }

export interface EncodedMediaReadableOptions extends ReadableOptions {
  stream: ffmpeg.Stream;
}

/**
 * A generic encoded media stream
 */
export class EncodedMediaReadable extends Readable {
  stream_: ffmpeg.Stream;
  type: 'Audio' | 'Video';

  constructor(options: EncodedMediaReadableOptions) {
    super({ ...options, objectMode: true });
    this.stream_ = options.stream;
    if (this.stream_.isAudio())
      this.type = 'Audio';
    else if (this.stream_.isVideo())
      this.type = 'Video';
    else
      throw new Error(('Only Audio or Video streams supported'));
  }

  get ready(): boolean {
    return true;
  }

  get stream(): ffmpeg.Stream {
    return this.stream_;
  }

  codec(): ffmpeg.Codec {
    return this.stream_.codecParameters().encodingCodec();
  }

  codecParameters(): ffmpeg.CodecParametersView {
    return this.stream_.codecParameters();
  }

  context(): ffmpeg.AudioEncoderContext | ffmpeg.VideoEncoderContext | null {
    return null;
  }

  isAudio(): boolean {
    return this.type == 'Audio';
  }

  isVideo(): boolean {
    return this.type == 'Video';
  }
}

/**
 * Encoded audio stream
 */
export interface EncodedAudioReadable extends EncodedMediaReadable {
  type: 'Audio';
  push(chunk: ffmpeg.Packet, encoding?: BufferEncoding): boolean;
}

/**
 * Encoded video stream
 */
export interface EncodedVideoReadable extends EncodedMediaReadable {
  type: 'Video';
  push(chunk: ffmpeg.Packet, encoding?: BufferEncoding): boolean;
}

/**
 * A generic encoded media stream
 */
export interface EncodedMediaWritable extends Writable {
  _write(chunk: ffmpeg.Packet, encoding: BufferEncoding, callback?: (error: Error | null | undefined) => void): void;
}

/**
 * A raw media stream
 */
export interface MediaWritable extends Writable {
  _write(chunk: ffmpeg.VideoFrame | ffmpeg.AudioSamples, encoding: BufferEncoding, callback?: (error: Error | null | undefined) => void): void;
}


/**
 * A video media stream
 */
export interface VideoWritable extends MediaWritable {
  _write(chunk: ffmpeg.VideoFrame, encoding: BufferEncoding, callback?: (error: Error | null | undefined) => void): void;
}

/**
 * An audio media stream
 */
export interface AudioWritable extends MediaWritable {
  _write(chunk: ffmpeg.AudioSamples, encoding: BufferEncoding, callback?: (error: Error | null | undefined) => void): void;
}

/**
 * A raw media stream
 */
export interface MediaReadable extends Readable {
  push(chunk: ffmpeg.VideoFrame | ffmpeg.AudioSamples, encoding?: BufferEncoding): boolean;
}

/**
 * A video media stream
 */
export interface VideoReadable extends MediaReadable {
  push(chunk: ffmpeg.VideoFrame, encoding?: BufferEncoding): boolean;
}

/**
 * An audio media stream
 */
export interface AudioReadable extends MediaReadable {
  push(chunk: ffmpeg.AudioSamples, encoding?: BufferEncoding): boolean;
}
