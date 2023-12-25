import { EventEmitter, Readable, WritableOptions } from 'node:stream';
import { EncodedMediaWritable, MediaEncoder, isAudioDefinition, isVideoDefinition } from './MediaStream';
import ffmpeg from '@mmomtchev/ffmpeg';

const { FormatContext, OutputFormat } = ffmpeg;

export const verbose = (process.env.DEBUG_MUXER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

export interface MuxerOptions extends WritableOptions {
  /**
   * The name of the output file, null for exposing a ReadStream
   */
  outputFile?: string;
  /**
   * Amount of data to buffer, only when writing to a WriteStream, @default 64Kb
   */
  highWaterMark?: number;
  outputFormat?: string;
  streams: MediaEncoder[];
  objectMode?: never;
}

/**
 * A Muxer is an object that creates a number of Writables
 * that can accept data from encoders.
 * The encoders must be created before creating the Muxer as
 * their parameters must be known beforehand.
 * Can write either to a file using the built-in ffmpeg I/O
 * (which is generally faster as it allows seeking) or in can
 * expose a Readable that can be piped into a WriteStream when
 * `outputFile` is undefined.
 * 
 * Emits 'finish' on close.
 * 
 * @example
 * const muxer = new Muxer({ outputFile: tempFile, streams: [videoOutput, audioOutput] });
 * 
 * @example
 * const muxer = new Muxer({ highWaterMark: 16 * 1024, outputFormat: 'mp4', streams: [videoOutput, audioOutput] });
 * output.output.pipe(writable);
 */
export class Muxer extends EventEmitter {
  protected outputFile: string;
  protected highWaterMark: number;
  protected outputFormatName: string;
  protected outputFormat: any;
  protected formatContext: any;
  protected rawStreams: MediaEncoder[];
  protected writing: boolean;
  protected primed: boolean;
  protected ended: number;
  protected writingQueue: { idx: number, packet: any, callback: (error?: Error | null | undefined) => void; }[];
  protected ready: Promise<void>[];
  streams: EncodedMediaWritable[];
  video: EncodedMediaWritable[];
  audio: EncodedMediaWritable[];
  output?: Readable;
  destroyed: boolean;

  constructor(options: MuxerOptions) {
    super();
    if (options.outputFile) {
      this.outputFile = options.outputFile;
    } else {
      this.output = new ffmpeg.ReadableCustomIO;
      this.outputFile = 'WriteStream';
    }
    this.highWaterMark = options.highWaterMark ?? (64 * 1024);
    this.outputFormatName = options.outputFormat ?? '';
    this.rawStreams = options.streams;
    this.streams = [];
    this.audio = [];
    this.video = [];
    this.writing = false;
    this.primed = false;
    this.ended = 0;
    this.writingQueue = [];
    this.ready = [];
    this.destroyed = false;

    this.outputFormat = new OutputFormat;
    this.outputFormat.setFormat(this.outputFormatName, this.outputFile, '');
    this.formatContext = new FormatContext;
    this.formatContext.setOutputFormat(this.outputFormat);

    for (const idx in this.rawStreams) {
      this.ready[idx] = new Promise((resolve) => {
        this.rawStreams[idx].on('ready', resolve);
      });
      this.rawStreams[idx].on('error', this.destroy.bind(this));
      if (this.outputFormat.isFlags(ffmpeg.AV_FMT_GLOBALHEADER)) {
        this.rawStreams[idx].coder().addFlags(ffmpeg.AV_CODEC_FLAG_GLOBAL_HEADER);
      }

      const writable = new EncodedMediaWritable({
        objectMode: true,
        write: (chunk: any, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void) => {
          this.write(+idx, chunk, callback);
        },
        destroy: (error: Error | null, callback: (error: Error | null) => void): void => {
          if (error) {
            verbose(`Muxer: error on stream #${idx}, destroy all streams`, error);
            this.destroy(error)
              .then(() => callback(error))
              .catch(callback);
          } else {
            verbose(`Muxer: destroy stream #${idx}`);
            callback(null);
          }
        },
        final: (callback: (error: Error | null) => void): void => {
          verbose(`Muxer: end stream #${idx}`);
          this.ended++;
          if (this.ended === this.streams.length) {
            verbose('Muxer: All streams ended, writing trailer');
            this.formatContext.writeTrailerAsync()
              .then(() => this.formatContext.closeAsync())
              .then(() => {
                callback(null);
                if (this.output) {
                  verbose('Muxer: closing ReadableStream');
                  (this.output as any)._final();
                }
                this.emit('finish');
              })
              .catch(callback);
          } else {
            callback(null);
          }
        },
      });
      writable.on('error', this.destroy.bind(this));
      this.streams[+idx] = writable;
      const def = this.rawStreams[idx].definition();

      if (def.type === 'Video') {
        this.video.push(writable);
      } else if (def.type === 'Audio') {
        this.audio.push(writable);
      } else {
        throw new Error('Unsupported stream type');
      }
    }
  }

  protected async destroy(e: Error) {
    if (this.destroyed) return;
    this.destroyed = true;
    verbose(`Muxer: destroy: ${e}`);
    this.emit('error', e);
    if (this.output)
      (this.output as any)._final();
    for (const s in this.streams) {
      this.streams[s].destroy(e);
    }
    await this.formatContext.closeAsync();
  }

  protected async prime(): Promise<void> {
    try {
      verbose(`Muxer: opening ${this.outputFile}, waiting for all inputs to be primed`);
      // If all inputs are not properly primed before opening the muxer, this can lead
      // to some very subtle problems such as the codec flags not being properly carried over
      await Promise.all(this.ready);
      verbose(`Muxer: opening ${this.outputFile}, all inputs are primed`);

      for (const idx in this.rawStreams) {
        const coder = this.rawStreams[idx].coder();
        const def = this.rawStreams[idx].definition();

        let stream;
        if (isVideoDefinition(def)) {
          stream = this.formatContext.addVideoStream(coder);
          stream.setFrameRate(def.frameRate);
        } else if (isAudioDefinition(def)) {
          stream = this.formatContext.addAudioStream(coder);
        } else {
          throw new Error('Unsupported stream type');
        }
        verbose(`Muxer: created stream #${idx}: type ${stream.mediaType()}, ` +
          `${stream.isVideo() ? 'video' : ''}${stream.isAudio() ? 'audio' : ''}`);
      }

      if (!this.output) {
        await this.formatContext.openOutputAsync(this.outputFile);
      } else {
        await this.formatContext.openReadableAsync(this.output, this.highWaterMark);
      }
      await this.formatContext.dumpAsync();
      await this.formatContext.writeHeaderAsync();
      await this.formatContext.flushAsync();
      this.primed = true;
      this.emit('ready');
      verbose('Muxer: ready');
    } catch (e) {
      this.destroy(e as Error);
    }
  }

  protected write(idx: number, packet: any, callback: (error?: Error | null | undefined) => void): void {
    if (!packet.isComplete()) {
      verbose('Muxer: skipping empty packet (codec is still priming)');
      callback();
      return;
    }

    this.writingQueue.push({ idx, packet, callback });
    if (this.writing) {
      verbose(`Muxer: enqueuing for writing on #${idx}, pts=${packet.pts()}, queue length ${this.writingQueue.length}`);
      return;
    }

    (async () => {
      this.writing = true;
      if (!this.primed) {
        await this.prime();
        if (!this.primed) return;
      }
      while (this.writingQueue.length > 0) {
        const job = this.writingQueue.shift()!;
        try {
          job.packet.setStreamIndex(job.idx);
          verbose(`Muxer: packet #${job.idx}: pts=${job.packet.pts()}, dts=${job.packet.dts()} / ${job.packet.pts().seconds()} / ${job.packet.timeBase()} / stream ${job.packet.streamIndex()}, size: ${job.packet.size()}`);
          await this.formatContext.writePacketAsync(job.packet);
          job.callback();
        } catch (err) {
          verbose(`Muxer: ${err}`);
          job.callback(err as Error);
          for (const s of this.streams) s.destroy(err as Error);
          this.destroy(err as Error);
        }
      }
      this.writing = false;
    })();
  }
}

