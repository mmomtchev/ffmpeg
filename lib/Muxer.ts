import { Writable, WritableOptions } from 'node:stream';
import ffmpeg from '..';
import { MuxerChunk, StreamDefinition, StreamType, isAudioDefinition, isVideoDefinition } from './Stream';

const {
  FormatContext,
  OutputFormat,
  VideoEncoderContext,
  AudioEncoderContext,
  Codec,
  findEncodingCodec,
  findEncodingCodecFormat,
  Rational
} = ffmpeg;

export const verbose = process.env.DEBUG_MUXER ? console.debug.bind(console) : () => undefined;

export interface MuxerOptions extends WritableOptions {
  outputFile: string;
  streams: any[];
  objectMode?: never;
}

export class Muxer {
  protected outputFile: string;
  protected outputFormat: any;
  protected formatContext: any;
  protected rawStreams: any;
  protected writing: boolean;
  protected primed: boolean;
  streams: Writable[];
  video: Writable[];
  audio: Writable[];

  constructor(options: MuxerOptions) {
    this.outputFile = options.outputFile;
    this.rawStreams = options.streams;
    this.streams = [];
    this.audio = [];
    this.video = [];
    this.writing = false;
    this.primed = false;

    for (const idx in this.rawStreams) {
      const writable = new Writable({
        objectMode: true,
        write: (chunk: any, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void) => {
          this._write(+idx, chunk, callback);
        },
        destroy: (error: Error | null, callback: (error: Error | null) => void): void => {
          this.formatContext.writeTrailerAsync()
            .then(() => void callback(null))
            .catch(callback);
        }
      });
      this.streams[+idx] = writable;
      const def = this.rawStreams[idx].getDefinition();

      if (def.type === 'Video') {
        this.video.push(writable);
      } else if (def.type === 'Audio') {
        this.audio.push(writable);
      } else {
        throw new Error('Unsupported stream type');
      }
    }
  }

  async prime(): Promise<void> {
    verbose(`Muxer: opening ${this.outputFile}`);
    this.outputFormat = new OutputFormat;
    this.outputFormat.setFormat('', this.outputFile, '');
    this.formatContext = new FormatContext;
    this.formatContext.setOutputFormat(this.outputFormat);

    for (const idx in this.rawStreams) {
      const encoder = this.rawStreams[idx].getEncoder();
      const def = this.rawStreams[idx].getDefinition();

      let stream;
      if (def.type === 'Video') {
        stream = this.formatContext.addVideoStream(encoder);
        stream.setFrameRate(def.frameRate);
      } else if (def.type === 'Audio') {
        stream = this.formatContext.addAudioStream(encoder);
      } else {
        throw new Error('Unsupported stream type');
      }
      verbose(`Muxer: created stream ${idx}: ${stream.mediaType()}, ` +
        `${stream.isVideo() ? 'video' : ''}${stream.isAudio() ? 'audio' : ''}`);
    }

    await this.formatContext.openOutputAsync(this.outputFile);
    await this.formatContext.dumpAsync();
    await this.formatContext.writeHeaderAsync();
    await this.formatContext.flushAsync();
    this.primed = true;
  }

  _write(idx: number, packet: any, callback: (error?: Error | null | undefined) => void): void {
    if (this.writing) return void callback(new Error('Try again later'));
    (async () => {
      this.writing = true;
      if (!this.primed) {
        await this.prime();
      }
      packet.setStreamIndex(idx);
      verbose(`Muxing packet: pts=${packet.pts()}, dts=${packet.dts()} / ${packet.pts().seconds()} / ${packet.timeBase()} / stream ${packet.streamIndex()}`);
      await this.formatContext.writePacketAsync(packet);
    })().then(() => callback()).catch(callback).then(() => {
      this.writing = false;
    });
  }
}

