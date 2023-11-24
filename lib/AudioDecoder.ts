import { Transform } from 'node:stream';
import ffmpeg from '..';
import { MuxerChunk } from './Stream';
import { TransformCallback } from 'stream';

const { AudioDecoderContext, Codec } = ffmpeg;

export const verbose = process.env.DEBUG_AUDIO_DECODER ? console.debug.bind(console) : () => undefined;

export class AudioDecoder extends Transform {
  protected decoder: any;

  constructor() {
    super({ objectMode: true });
    this.decoder = null;
  }

  _transform(chunk: MuxerChunk, encoding: BufferEncoding, callback: TransformCallback): void {
    verbose('AudioDecoder: start of _transform');
    (async () => {
      if (!this.decoder) {
        verbose('AudioDecoder: priming the decoder');
        if (!chunk._stream) {
          return void callback(new Error('Input is not a demuxed stream'));
        }
        if (!chunk._stream.isAudio()) {
          return void callback(new Error('Input is not audio'));
        }
        this.decoder = new AudioDecoderContext(chunk._stream);
        await this.decoder.openCodecAsync(new Codec);
        verbose('AudioDecoder: decoder primed');
      }

      const samples = await this.decoder.decodeAsync(chunk.packet);
      if (samples.isComplete()) {
        verbose(`AudioDecoder: Decoded samples: pts=${samples.pts()} / ${samples.pts().seconds()} / ${samples.timeBase()} / ${samples.sampleFormat()}@${samples.sampleRate()}, size=${samples.size()}, ref=${samples.isReferenced()}:${samples.refCount()} / layout: ${samples.channelsLayoutString()} }`);
        this.push(samples);
      }
      verbose('AudioDecoder: end of _transform');
      callback();
    })().catch(callback);
  }
}
