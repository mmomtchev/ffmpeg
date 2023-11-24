import { Readable, ReadableOptions } from 'node:stream';
import ffmpeg from '..';
import { MuxerChunk } from './Stream';

const { FormatContext } = ffmpeg;

export const verbose = process.env.DEBUG_DEMUXER ? console.debug.bind(console) : () => undefined;

export interface DemuxerOptions extends ReadableOptions {
  inputFile: string;
  objectMode?: never;
}

class DemuxReadable extends Readable {
}

export class Demuxer {
  protected inputFile: string;
  protected formatContext: any;
  protected rawStreams: any[];
  streams: Readable[];
  video: Readable[];
  audio: Readable[];
  reading: boolean;

  constructor(options: DemuxerOptions) {
    this.inputFile = options.inputFile;
    this.rawStreams = [];
    this.streams = [];
    this.video = [];
    this.audio = [];
    this.reading = false;
  }

  async prime(): Promise<void> {
    verbose(`Demuxer: opening ${this.inputFile}`);
    this.formatContext = new FormatContext;
    await this.formatContext.openInputAsync(this.inputFile);
    await this.formatContext.findStreamInfoAsync();

    for (let i = 0; i < this.formatContext.streamsCount(); i++) {
      const stream = this.formatContext.stream(i);
      verbose(`Demuxer: identified stream ${i}: ${stream.mediaType()}, ` +
        `${stream.isVideo() ? 'video' : ''}${stream.isAudio() ? 'audio' : ''} ` +
        `duration ${stream.duration().toString()}`);
      this.streams[i] = new Readable({
        objectMode: true,
        read: (size: number) => {
          this._read(i, size);
        }
      });
      this.rawStreams[i] = stream;
      if (stream.isVideo()) this.video.push(this.streams[i]);
      if (stream.isAudio()) this.audio.push(this.streams[i]);
    }
  }

  /**
   * All demuxed streams share the same read function.
   * When it is called for one of those streams, it will read and
   * push data to all of them - until the one that requested data
   * has enough
   */
  async _read(idx: number, size: number): Promise<void> {
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
        this.streams[pkt.streamIndex()].push({
          packet: pkt,
          _stream: this.rawStreams[pkt.streamIndex()]
        } as MuxerChunk);
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

