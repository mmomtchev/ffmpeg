import { Readable, ReadableOptions } from 'node:stream';
import ffmpeg from '..';
import { MuxerChunk, StreamType, StreamTypes } from './Stream';

const { FormatContext, VideoDecoderContext, AudioDecoderContext, Codec } = ffmpeg;

export const verbose = process.env.DEBUG_DEMUXER ? console.debug.bind(console) : () => undefined;

export interface DemuxerOptions extends ReadableOptions {
  inputFile: string;
  objectMode?: never;
}

export class Demuxer extends Readable {
  protected inputFile: string;
  protected formatContext: any;
  protected stream: {
    stream: any;
    decoder: any;
  }[];
  protected reading: boolean;

  constructor(options: DemuxerOptions) {
    super({ ...options, objectMode: true });
    this.inputFile = options.inputFile;
    this.stream = [];
    this.reading = false;
  }

  _construct(callback: (error?: Error | null | undefined) => void): void {
    (async () => {
      verbose(`Demuxer: opening ${this.inputFile}`);
      this.formatContext = new FormatContext;
      await this.formatContext.openInputAsync(this.inputFile);
      await this.formatContext.findStreamInfoAsync();

      for (let i = 0; i < this.formatContext.streamsCount(); i++) {
        const stream = this.formatContext.stream(i);
        verbose(`Demuxer: identified stream ${i}: ${stream.mediaType()}, ` +
          `${stream.isVideo() ? 'video' : ''}${stream.isAudio() ? 'audio' : ''} ` +
          `duration ${stream.duration().toString()}`);
        this.stream[i] = { stream, decoder: null };
        if (stream.isVideo()) {
          const vdec = new VideoDecoderContext(stream);
          vdec.setRefCountedFrames(true);
          await vdec.openCodecAsync(new Codec);
          this.stream[i].decoder = vdec;
        }
        if (stream.isAudio()) {
          const adec = new AudioDecoderContext(stream);
          await adec.openCodecAsync(new Codec);
          this.stream[i].decoder = adec;
        }
      }
    })().then(() => callback()).catch(callback);
  }

  _read(size: number): void {
    if (this.reading) return;
    (async () => {
      this.reading = true;
      verbose('Demuxer: start of _read');
      let pkt, frame;
      do {
        pkt = await this.formatContext.readPacketAsync();
        verbose(`Demuxer: Read packet: pts=${pkt.pts()}, dts=${pkt.dts()} / ${pkt.pts().seconds()} / ${pkt.timeBase()} / stream ${pkt.streamIndex()}`);
        if (pkt.isNull()) {
          this.push(null);
          return;
        }
        if (!this.stream[pkt.streamIndex()]) {
          this.destroy(new Error(`Received packet for unknown stream ${pkt.streamIndex()}`));
          return;
        }
        const { stream, decoder } = this.stream[pkt.streamIndex()];
        let type: StreamType | undefined;
        if (stream.isVideo()) {
          frame = await decoder.decode(pkt, true);
          if (frame.isComplete())
            verbose(`Demuxer: Decoded   frame: pts=${frame.pts()} / ${frame.pts().seconds()} / ${frame.timeBase()} / ${frame.width()}x${frame.height()}, size=${frame.size()}, ref=${frame.isReferenced()}:${frame.refCount()} / type: ${frame.pictureType()} }`);
          type = StreamTypes.Video;
        }
        if (stream.isAudio()) {
          frame = await decoder.decode(pkt);
          if (frame.isComplete())
            verbose(`Demuxer: Decoded   samples: pts=${frame.pts()} / ${frame.pts().seconds()} / ${frame.timeBase()} / ${frame.sampleFormat()}@${frame.sampleRate()}, size=${frame.size()}, ref=${frame.isReferenced()}:${frame.refCount()} / layout: ${frame.channelsLayoutString()} }`);
          type = StreamTypes.Audio;
        }
        if (frame && frame?.isComplete() && type) {
          size--;
          this.push({
            data: frame,
            streamIndex: pkt.streamIndex(),
            _stream: stream,
            type
          } as MuxerChunk);
        }
      // The somewhat unusual test is due to the fact that when reading
      // it takes a few packets before the codec starts sending valid data
      } while ((!pkt.isNull() || frame.isComplete()) && size > 0 && frame);
      verbose('Demuxer: end of _read');
    })()
      .catch((err) => this.destroy(err))
      .then(() => {
        this.reading = false;
      });
  }
}

