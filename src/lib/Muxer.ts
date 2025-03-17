import { EventEmitter, Readable, WritableOptions } from 'node:stream';
import { EncodedMediaReadable, EncodedMediaWritable } from './MediaStream';
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
  /**
   * Output format to use, may be deduced from the filename
   */
  outputFormat?: string;
  /**
   * An array of MediaEncoder streams to be multiplexed
   */
  streams: EncodedMediaReadable[];
  /**
   * Output format options
   */
  outputFormatOptions?: Record<string, string>;
  /**
   * Open options
   */
  openOptions?: Record<string, string>;
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
  protected outputFormatOptions: Record<string, string>;
  protected outputFormat: ffmpeg.OutputFormat;
  protected openOptions: Record<string, string>;
  protected formatContext: ffmpeg.FormatContext;
  protected rawStreams: EncodedMediaReadable[];
  protected writing: boolean;
  protected primed: boolean;
  protected ended: number;
  protected writingQueue: { idx: number, packet: any, callback: (error?: Error | null | undefined) => void; }[];
  protected ready: Promise<void>[];
  protected delayedDestroy: Error | null;
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
    this.outputFormatOptions = options.outputFormatOptions ?? {};
    this.openOptions = options.openOptions ?? {};
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
    this.delayedDestroy = null;

    this.outputFormat = new OutputFormat;
    this.outputFormat.setFormat(this.outputFormatName, this.outputFile, '');
    this.formatContext = new FormatContext;
    this.formatContext.setOutputFormat(this.outputFormat);

    for (const idx in this.rawStreams) {
      if (!this.rawStreams[idx].ready) {
        this.ready[idx] = new Promise((resolve) => {
          this.rawStreams[idx].on('ready', resolve);
        });
      } else {
        this.ready[idx] = Promise.resolve();
      }
      this.rawStreams[idx].on('error', this.destroy.bind(this));
      if (this.outputFormat.isFlags(ffmpeg.AV_FMT_GLOBALHEADER)) {
        const codec = this.rawStreams[idx].codec();
        if (!(codec instanceof ffmpeg.CodecParametersView))
          codec.addFlags(ffmpeg.AV_CODEC_FLAG_GLOBAL_HEADER);
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
                if (this.output) {
                  verbose('Muxer: closing ReadableStream');
                  (this.output as any)._final(() => {
                    callback(null);
                    this.emit('finish');
                  });
                  return;
                }
                callback(null);
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
      const stream = this.rawStreams[idx]._stream;

      if (stream!.isVideo()) {
        this.video.push(writable);
      } else if (stream!.isAudio()) {
        this.audio.push(writable);
      } else {
        throw new Error('Unsupported stream type');
      }
    }
  }

  protected async destroy(e: Error) {
    if (this.writing) {
      // Delayed destroy
      verbose('Muxer: delaying destroy');
      this.delayedDestroy = e;
      return;
    }
    if (this.destroyed) return;
    this.destroyed = true;
    verbose(`Muxer: destroy: ${e}`);
    await this.formatContext.closeAsync();
    const finalize = () => {
      for (const s in this.streams) {
        this.streams[s].destroy(e);
      }
      for (const s in this.rawStreams) {
        this.rawStreams[s].destroy(e);
      }
    };
    if (this.output) {
      (this.output as any)._final(finalize);
    } else {
      finalize();
    }
    this.emit('error', e);
  }

  protected async prime(): Promise<void> {
    try {
      verbose(`Muxer: opening ${this.outputFile}, waiting for all inputs to be primed`);
      // If all inputs are not properly primed before opening the muxer, this can lead
      // to some very subtle problems such as the codec flags not being properly carried over
      await Promise.all(this.ready);
      verbose(`Muxer: opening ${this.outputFile}, all inputs are primed`, this.openOptions);

      for (const idx in this.rawStreams) {
        let stream;

        // Two options:
        // - this is an encoding codec and we are working with an actual codec context
        // - this is simply a codec definition and we receiving pre-encoded data
        const codec = this.rawStreams[idx].codec();
        if (codec instanceof ffmpeg.CodecParametersView) {
          stream = this.formatContext.addStream();
          codec.setCodecTag(0);
          stream.setCodecParameters(codec);
        } else {
          if (this.rawStreams[idx]._stream!.isVideo()) {
            stream = await this.formatContext.addVideoStreamAsync(codec as ffmpeg.VideoEncoderContext);
            const fr = await this.rawStreams[idx]._stream.stream().frameRateAsync();
            stream.setFrameRate(fr);
          } else if (this.rawStreams[idx]._stream!.isAudio()) {
            stream = await this.formatContext.addAudioStreamAsync(codec as ffmpeg.AudioEncoderContext);
          } else {
            throw new Error('Unsupported stream type');
          }
        }
        verbose(`Muxer: created stream #${idx}: type ${stream.mediaType()}, ` +
          `${stream.isVideo() ? 'video' : ''}${stream.isAudio() ? 'audio' : ''}`);
      }

      if (!this.output) {
        await this.formatContext.openOutputOptionsAsync(this.outputFile, this.openOptions);
      } else {
        await this.formatContext.openReadableAsync(this.output, this.highWaterMark);
      }
      await this.formatContext.dumpAsync();
      await this.formatContext.writeHeaderOptionsAsync(this.outputFormatOptions);
      await this.formatContext.flushAsync();
      this.primed = true;
      this.emit('ready');
      verbose('Muxer: ready');
    } catch (e) {
      this.destroy(e as Error);
    }
  }

  protected write(idx: number, packet: any, callback: (error?: Error | null | undefined) => void): void {
    if (this.delayedDestroy || this.destroyed) {
      verbose('Muxer: already destroyed');
      return void callback(this.delayedDestroy);
    }
    if (!packet.isComplete()) {
      verbose('Muxer: skipping empty packet');
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
        if (this.delayedDestroy) {
          verbose('Muxer: destroyed while priming, resuming destroy');
          this.writing = false;
          return void callback(this.delayedDestroy);
        }
        if (!this.primed) return;
      }
      while (this.writingQueue.length > 0) {
        const job = this.writingQueue.shift()!;
        try {
          job.packet.setStreamIndex(job.idx);
          verbose(`Muxer: packet #${job.idx}: pts=${job.packet.pts()}, dts=${job.packet.dts()} / ${job.packet.pts().seconds()} / ${job.packet.timeBase()} / stream ${job.packet.streamIndex()}, size: ${job.packet.size()}`);
          await this.formatContext.writePacketAsync(job.packet);
          if (this.delayedDestroy) {
            verbose('Muxer: destroyed while writing, resuming destroy');
            this.writing = false;
            this.writingQueue = [];
            return void job.callback(this.delayedDestroy);
          }
          job.callback();
        } catch (err) {
          verbose(`Muxer: ${err}`);
          job.callback(err as Error);
          this.destroy(err as Error);
        }
      }
      this.writing = false;
      verbose('Muxer: end of writing cycle');
    })();
  }
}

