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
}

/**
 * A generic encoding MediaStream, has a codec.
 */
export interface MediaEncoder extends MediaStream {
  codec(): ffmpeg.Codec;
}

export interface EncodedMediaReadableOptions extends ReadableOptions {
  _stream?: ffmpeg.Stream | ffmpeg.AudioDecoderContext | ffmpeg.AudioEncoderContext | ffmpeg.VideoDecoderContext | ffmpeg.VideoEncoderContext;
}


/**
 * A generic compressed media stream from a Demuxer.
 */
export class EncodedMediaReadable extends Readable {
  _stream: any;

  constructor(options: EncodedMediaReadableOptions) {
    super(options);
    this._stream = options._stream;
  }

  // EncodedMediaReadable is synchronously ready unlike
  // its compatible cousins AudioEncoder and VideoEncoder
  get ready(): boolean {
    return true;
  }

  codec(): ffmpeg.CodecParametersView | ffmpeg.AudioDecoderContext | ffmpeg.AudioEncoderContext | ffmpeg.VideoDecoderContext | ffmpeg.VideoEncoderContext {
    if (this._stream instanceof ffmpeg.Stream) {
      return this._stream!.codecParameters();
    } else {
      return this._stream!;
    }
  }
}

/**
 * A generic compressed media stream to a Muxer.
 */
export class EncodedMediaWritable extends Writable { }
