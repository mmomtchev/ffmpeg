import { EventEmitter, ReadableOptions, Writable } from 'node:stream';
import ffmpeg, { FormatContext } from '@mmomtchev/ffmpeg';
import { EncodedMediaReadable } from './MediaStream';

export const verbose = (process.env.DEBUG_DEMUXER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

export interface DemuxerOptions extends ReadableOptions {
  /**
   * The name of the input file, null for reading from a ReadStream
   */
  inputFile?: string;
  /**
   * Amount of data to buffer, only when reading from a ReadStream, @default 64Kb
   */
  highWaterMark?: number;
  /**
   * Open options
   */
  openOptions?: Record<string, string>;
}

/**
 * A Demuxer is an object that exposes a number of Readables.
 * It emits 'ready' when its outputs have been created.
 * It can use either ffmpeg's built-in I/O (which is generally faster)
 * when `inputFile` is specified or it can expose a Writable into
 * which a ReadStream can be piped. Not all files can streamed - they
 * must have a special streaming structure with all the necessary
 * data written in the header.
 * 
 * @example
 * // Reading directly from the filesystem
 * const input = new Demuxer({ inputFile: 'input.mp4') });
 * input.on('ready', () => {
 *  const audioInput = new AudioDecoder(input.audio[0]);
 *  const videoInput = new VideoDecoder(input.video[0]);
 * });
 *
 * @example
 * // Reading from a ReadStream
 * const demuxer = new Demuxer();
 * const instream = fs.createReadStream('input.mp4');
 * input.on('ready', () => {
 *  const audioInput = new AudioDecoder(input.audio[0]);
 *  const videoInput = new VideoDecoder(input.video[0]);
 * });
 * instream.pipe(demuxer.input);
 */
export class Demuxer extends EventEmitter {
  protected inputFile: string | undefined;
  protected highWaterMark: number;
  protected formatContext: ffmpeg.FormatContext | undefined;
  protected rawStreams: ffmpeg.Stream[];
  protected openOptions: Record<string, string>;
  streams: EncodedMediaReadable[];
  video: EncodedMediaReadable[];
  audio: EncodedMediaReadable[];
  input?: Writable;
  reading: boolean;

  constructor(options?: DemuxerOptions) {
    super();
    // Built-in ffmpeg I/O (generally faster)
    this.inputFile = options?.inputFile;
    // Reading from a ReadStream
    if (!this.inputFile) {
      this.input = new ffmpeg.WritableCustomIO;
    }
    this.highWaterMark = options?.highWaterMark ?? (64 * 1024);
    this.openOptions = options?.openOptions ?? {};
    this.rawStreams = [];
    this.streams = [];
    this.video = [];
    this.audio = [];
    this.reading = false;
    this.prime();
  }

  protected async prime(): Promise<void> {
    try {
      this.formatContext = new FormatContext;
      if (this.inputFile) {
        verbose(`Demuxer: opening ${this.inputFile}`, this.openOptions);
        await this.formatContext.openInputOptionsAsync(this.inputFile, this.openOptions);
      } else {
        verbose('Demuxer: reading from ReadStream');
        const format = new ffmpeg.InputFormat;
        await this.formatContext.openWritableAsync(this.input, format, this.highWaterMark);
      }
      await this.formatContext.findStreamInfoAsync();

      for (let i = 0; i < this.formatContext.streamsCount(); i++) {
        const stream = this.formatContext.stream(i);
        verbose(`Demuxer: identified stream ${i}: ${stream.mediaType()}, ` +
          `${stream.isVideo() ? 'video' : ''}${stream.isAudio() ? 'audio' : ''} ` +
          `duration ${stream.duration().toString()}`);
        this.streams[i] = new EncodedMediaReadable({
          objectMode: true,
          read: (size: number) => {
            this.read(i, size);
          },
          stream: stream
        });
        this.rawStreams[i] = stream;
        if (stream.isVideo()) this.video.push(this.streams[i]);
        if (stream.isAudio()) this.audio.push(this.streams[i]);
      }
      this.emit('ready');
    } catch (e) {
      this.emit('error', e);
    }
  }

  /**
   * All demuxed streams share the same read function.
   * When it is called for one of those streams, it will read and
   * push data to all of them - until the one that requested data
   * has enough
   */
  protected async read(idx: number, size: number): Promise<void> {
    if (this.reading) return;
    (async () => {
      this.reading = true;
      verbose(`Demuxer: start of _read (called on stream ${idx} for ${size} packets`);
      let pkt;
      let pktIsNull: boolean;
      do {
        pkt = await this.formatContext!.readPacketAsync();
        verbose(`Demuxer: Read packet: pts=${pkt.pts()}, dts=${pkt.dts()} / ${pkt.pts().seconds()} / ${pkt.timeBase()} / stream ${pkt.streamIndex()}`);
        if (pkt.isNull()) {
          verbose('Demuxer: End of stream');
          for (const s of this.streams) s.push(null);
          this.emit('close');
          return;
        }
        if (!this.streams[pkt.streamIndex()]) {
          for (const s of this.streams)
            s.destroy(new Error(`Received packet for unknown stream ${pkt.streamIndex()}`));
          return;
        }
        // Decrement only if this is going to the stream that requested data
        if (idx === pkt.streamIndex()) size--;
        // pkt should not be accessed after being pushed for async handling
        pktIsNull = pkt.isNull();
        // But always push to whoever the packet was for
        this.streams[pkt.streamIndex()].push(pkt);
      } while (!pktIsNull && size > 0);
      verbose('Demuxer: end of _read');
    })()
      .catch((err) => {
        verbose(`Demuxer: ${err}`);
        for (const s of this.streams) s.destroy(err);
        this.emit('error', err);
      })
      .then(() => {
        this.reading = false;
      });
  }
}

