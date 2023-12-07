import { EventEmitter, Readable, ReadableOptions } from 'node:stream';
import ffmpeg from '.';

const { FormatContext } = ffmpeg;

export const verbose = (process.env.DEBUG_DEMUXER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

export interface DemuxerOptions extends ReadableOptions {
  inputFile: string;
  objectMode?: never;
}

interface DemuxedStreamOptions extends ReadableOptions {
  _stream?: any;
}

class DemuxedStream extends Readable {
  _stream: any;

  constructor(options: DemuxedStreamOptions) {
    super(options);
    this._stream = options._stream;
  }
}

/**
 * A Demuxer is an object that exposes a number of Readables
 * 
 * @example
 * const input = new Demuxer({ inputFile: 'input.mp4') });
 * input.on('ready', () => {
 *  const audioInput = new AudioDecoder(input.audio[0]);
 *  const videoInput = new VideoDecoder(input.video[0]);
 * });
 */
export class Demuxer extends EventEmitter {
  protected inputFile: string;
  protected formatContext: any;
  protected rawStreams: any[];
  streams: DemuxedStream[];
  video: DemuxedStream[];
  audio: DemuxedStream[];
  reading: boolean;

  constructor(options: DemuxerOptions) {
    super();
    this.inputFile = options.inputFile;
    this.rawStreams = [];
    this.streams = [];
    this.video = [];
    this.audio = [];
    this.reading = false;
    this.prime();
  }

  protected async prime(): Promise<void> {
    verbose(`Demuxer: opening ${this.inputFile}`);
    this.formatContext = new FormatContext;
    await this.formatContext.openInputAsync(this.inputFile);
    await this.formatContext.findStreamInfoAsync();

    for (let i = 0; i < this.formatContext.streamsCount(); i++) {
      const stream = this.formatContext.stream(i);
      verbose(`Demuxer: identified stream ${i}: ${stream.mediaType()}, ` +
        `${stream.isVideo() ? 'video' : ''}${stream.isAudio() ? 'audio' : ''} ` +
        `duration ${stream.duration().toString()}`);
      this.streams[i] = new DemuxedStream({
        objectMode: true,
        read: (size: number) => {
          this.read(i, size);
        },
        _stream: stream
      });
      this.rawStreams[i] = stream;
      if (stream.isVideo()) this.video.push(this.streams[i]);
      if (stream.isAudio()) this.audio.push(this.streams[i]);
    }
    this.emit('ready');
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
      do {
        pkt = await this.formatContext.readPacketAsync();
        verbose(`Demuxer: Read packet: pts=${pkt.pts()}, dts=${pkt.dts()} / ${pkt.pts().seconds()} / ${pkt.timeBase()} / stream ${pkt.streamIndex()}`);
        if (pkt.isNull()) {
          verbose('Demuxer: End of stream');
          for (const s of this.streams) s.push(null);
          return;
        }
        if (!this.streams[pkt.streamIndex()]) {
          for (const s of this.streams)
            s.destroy(new Error(`Received packet for unknown stream ${pkt.streamIndex()}`));
          return;
        }
        // Decrement only if this is going to the stream that requested data
        if (idx === pkt.streamIndex()) size--;
        // But always push to whoever the packet was for
        this.streams[pkt.streamIndex()].push(pkt);
      } while (!pkt.isNull() && size > 0);
      verbose('Demuxer: end of _read');
    })()
      .catch((err) => {
        for (const s of this.streams) s.destroy(err);
      })
      .then(() => {
        this.reading = false;
      });
  }
}

