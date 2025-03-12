import ffmpeg, { AudioDecoderContext, Codec } from '@mmomtchev/ffmpeg';
import { AudioStreamDefinition, MediaStream, MediaTransform } from './MediaStream';
import { TransformCallback } from 'stream';

export const verbose = (process.env.DEBUG_AUDIO_DECODER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

/**
 * An AudioDecoder is Transform stream that can read raw encoded audio data
 * from a Demuxer and write decoded audio samples
 * Its parameters are inherited from the Demuxer.
 */
export class AudioDecoder extends MediaTransform implements MediaStream {
  protected decoder: ffmpeg.AudioDecoderContext | null;
  protected busy: boolean;
  ready: boolean;

  constructor(options: { _stream: ffmpeg.Stream; }) {
    super();
    this.decoder = null;
    if (!options._stream) {
      throw new Error('Input is not a demuxed stream');
    }
    if (!options._stream.isAudio()) {
      throw new Error('Input is not video');
    }
    this.decoder = new AudioDecoderContext(options._stream);
    this.decoder.setRefCountedFrames(true);
    this.busy = false;
    this.ready = false;
  }

  _construct(callback: (error?: Error | null | undefined) => void): void {
    (async () => {
      this.busy = true;
      verbose('AudioDecoder: priming the decoder');
      await this.decoder!.openCodecAsync(new Codec);
      verbose('AudioDecoder: decoder primed');
      this.busy = false;
      callback();
      this.ready = true;
      this.emit('ready');
    })()
      .catch(callback);
  }

  _transform(packet: any, encoding: BufferEncoding, callback: TransformCallback): void {
    if (this.busy) return void callback(new Error('Decoder called while busy'));
    verbose('AudioDecoder: decoding chunk');
    (async () => {
      this.busy = true;
      const samples = await this.decoder!.decodeAsync(packet);
      if (samples.isComplete()) {
        verbose(`AudioDecoder: Decoded samples: pts=${samples.pts()} / ${samples.pts().seconds()} / ${samples.timeBase()} / ${samples.sampleFormat()}@${samples.sampleRate()}, size=${samples.size()}, ref=${samples.isReferenced()}:${samples.refCount()} / layout: ${samples.channelsLayoutString()} }`);
        this.push(samples);
      } else {
        verbose('AudioDecoder: empty frame');
      }
      this.busy = false;
      callback();
    })()
      .catch(callback);
  }

  codec() {
    return this.decoder;
  }

  definition(): AudioStreamDefinition {
    return {
      type: 'Audio',
      bitRate: this.decoder!.bitRate(),
      codec: this.decoder!.codec(),
      sampleFormat: this.decoder!.sampleFormat(),
      sampleRate: this.decoder!.sampleRate(),
      channelLayout: new ffmpeg.ChannelLayout(this.decoder!.channelLayout()),
      frameSize: this.decoder!.frameSize(),
      timeBase: this.decoder!.timeBase()
    } as AudioStreamDefinition;
  }
}
