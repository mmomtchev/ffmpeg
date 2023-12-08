import { Readable, ReadableOptions, Writable } from 'node:stream';

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
  codec: number;
  timeBase?: any;
}

export interface VideoStreamDefinition extends MediaStreamDefinition {
  type: 'Video';
  width: number;
  height: number;
  frameRate: number;
  pixelFormat: any;
}

export interface AudioStreamDefinition extends MediaStreamDefinition {
  type: 'Audio';
  channelLayout: any;
  sampleFormat: any;
  sampleRate: any;
}

export function isVideoDefinition(def: MediaStreamDefinition): def is VideoStreamDefinition {
  return def.type === 'Video';
}

export function isAudioDefinition(def: MediaStreamDefinition): def is AudioStreamDefinition {
  return def.type === 'Audio';
}


/**
 * A generic raw MediaStream, has a definition.
 */
export interface MediaStream {
  definition(): MediaStreamDefinition;
}

/**
 * A generic encoding MediaStream, has a codec.
 */
export interface MediaEncoder extends MediaStream {
  coder(): any;
}

export interface EncodedMediaReadableOptions extends ReadableOptions {
  _stream?: any;
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
}

/**
 * A generic compressed media stream to a Muxer.
 */
export class EncodedMediaWritable extends Writable { }
