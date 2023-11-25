import { EventEmitter, Writable, WritableOptions } from 'node:stream';
import ffmpeg from '..';

const { FormatContext, OutputFormat } = ffmpeg;

export const verbose = process.env.DEBUG_MUXER ? console.debug.bind(console) : () => undefined;

export interface MuxerOptions extends WritableOptions {
  outputFile: string;
  streams: any[];
  objectMode?: never;
}

export class Muxer extends EventEmitter {
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
    super();
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
          this.write(+idx, chunk, callback);
        },
        destroy: (error: Error | null, callback: (error: Error | null) => void): void => {
          this.formatContext.writeTrailerAsync()
            .then(() => void callback(null))
            .catch(callback);
        }
      });
      this.streams[+idx] = writable;
      const def = this.rawStreams[idx].getDefinition();
      this.rawStreams[idx].setOutputPriming(this.prime.bind(this));

      if (def.type === 'Video') {
        this.video.push(writable);
      } else if (def.type === 'Audio') {
        this.audio.push(writable);
      } else {
        throw new Error('Unsupported stream type');
      }
    }
  }

  protected async prime(): Promise<void> {
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
    this.emit('ready');
  }

  protected write(idx: number, packet: any, callback: (error?: Error | null | undefined) => void): void {
    if (this.writing) return void callback(new Error('Try again later'));
    (async () => {
      this.writing = true;
      if (!this.primed) {
        await this.prime();
      }
      packet.setStreamIndex(idx);
      if (!packet.isComplete()) {
        verbose('Muxer: skipping empty packet (codec is still priming)');
        return;
      }
      verbose(`Muxer: packet: pts=${packet.pts()}, dts=${packet.dts()} / ${packet.pts().seconds()} / ${packet.timeBase()} / stream ${packet.streamIndex()}, size: ${packet.size()}`);
      await this.formatContext.writePacketAsync(packet);
    })().then(() => callback()).catch(callback).then(() => {
      this.writing = false;
    });
  }
}

