import ffmpeg from '@mmomtchev/ffmpeg';
import { AudioStreamDefinition, MediaStream, MediaTransform } from './MediaStream';
import { TransformCallback } from 'stream';

const { AudioEncoderContext, AudioSamples } = ffmpeg;

export const verbose = (process.env.DEBUG_AUDIO_ENCODER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

/**
 * An AudioEncoder is Transform stream that can read raw audio samples
 * and write encoded audio data to a Muxer.
 * Its parameters must be explicitly configured.
 */
export class AudioEncoder extends MediaTransform implements MediaStream {
  protected def: AudioStreamDefinition;
  protected encoder: any;
  protected codec_: any;
  protected busy: boolean;
  ready: boolean;

  constructor(def: AudioStreamDefinition) {
    super();
    this.def = { ...def };
    this.codec_ = ffmpeg.findEncodingCodec(this.def.codec);
    verbose(`AudioEncoder: using ${this.codec_.name()}`);
    this.encoder = new AudioEncoderContext(this.codec_);
    if (this.def.timeBase)
      this.encoder.setTimeBase(this.def.timeBase);
    else
      this.encoder.setTimeBase(new ffmpeg.Rational(1, 1000));
    this.encoder.setBitRate(this.def.bitRate);
    this.encoder.setChannelLayout(this.def.channelLayout);
    this.encoder.setSampleFormat(this.def.sampleFormat);
    this.encoder.setSampleRate(this.def.sampleRate);
    this.busy = false;
    this.ready = false;
  }

  _construct(callback: (error?: Error | null | undefined) => void): void {
    (async () => {
      this.busy = true;
      verbose('AudioEncoder: priming the encoder', this.def.codecOptions);
      await this.encoder.openCodecOptionsAsync(this.def.codecOptions ?? {}, this.codec_);
      verbose(`AudioEncoder: encoder primed, codec ${this.codec_.name()}, ` +
        `bitRate: ${this.encoder.bitRate()}, sampleFormat: ${this.encoder.sampleFormat()}@${this.encoder.sampleRate()}, ` +
        `timeBase: ${this.encoder.timeBase()}, frameSize: ${this.encoder.frameSize()}`
      );
      this.def.frameSize = this.encoder.frameSize();
      this.busy = false;
      callback();
      this.ready = true;
      this.emit('ready');
    })()
      .catch(callback);
  }

  _transform(samples: any, encoding: BufferEncoding, callback: TransformCallback): void {
    verbose('AudioEncoder: received samples');
    if (this.busy) return void callback(new Error('AudioEncoder called while busy, use proper writing semantics'));
    (async () => {
      this.busy = true;
      if (!this.encoder) {
        return void callback(new Error('AudioEncoder is not primed'));
      }
      if (!(samples instanceof AudioSamples)) {
        return void callback(new Error('Input is not a raw audio'));
      }
      if (!samples.isComplete()) {
        return void callback(new Error('Received incomplete frame'));
      }
      samples.setTimeBase(this.encoder.timeBase());
      const packet = await this.encoder.encodeAsync(samples);
      verbose(`AudioEncoder: Encoded samples: pts=${samples.pts()} / ${samples.pts().seconds()} / ${samples.timeBase()} / ${samples.sampleFormat()}@${samples.sampleRate()}, size=${samples.size()}, ref=${samples.isReferenced()}:${samples.refCount()} / layout: ${samples.channelsLayoutString()} }`);
      this.push(packet);
      this.busy = false;
      callback();
    })()
      .catch(callback);
  }

  _flush(callback: TransformCallback): void {
    verbose('AudioEncoder: flushing');
    if (this.busy) return void callback(new Error('AudioEncoder called while busy, use proper writing semantics'));
    let packet: any;
    (async () => {
      do {
        packet = await this.encoder.finalizeAsync();
        this.push(packet);
      } while (packet && packet.isComplete());
      callback();
    })()
      .catch(callback);
  }

  codec(): any {
    return this.encoder;
  }

  definition(): AudioStreamDefinition {
    return this.def;
  }

  get _stream() {
    return this.encoder;
  }
}
