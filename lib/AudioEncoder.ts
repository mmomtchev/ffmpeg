import { Transform } from 'node:stream';
import ffmpeg from '..';
import { AudioStreamDefinition } from './Stream';
import { TransformCallback } from 'stream';

const { AudioEncoderContext, AudioSamples } = ffmpeg;

export const verbose = (process.env.DEBUG_AUDIO_ENCODER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

/**
 * An AudioEncoder is Transform stream that can read raw audio samples
 * and write encoded audio data to a Muxer.
 * Its parameters must be explicitly configured.
 */
export class AudioEncoder extends Transform {
  protected def: AudioStreamDefinition;
  protected encoder: any;
  protected codec: any;
  protected busy: boolean;

  constructor(def: AudioStreamDefinition) {
    super({ objectMode: true });
    this.def = def;
    this.codec = ffmpeg.findEncodingCodec(this.def.codec);
    verbose(`AudioEncoder: using ${this.codec.name()}`);
    this.encoder = new AudioEncoderContext(this.codec);
    if (this.def.timeBase)
      this.encoder.setTimeBase(this.def.timeBase);
    else
      this.encoder.setTimeBase(new ffmpeg.Rational(1, 1000));
    this.encoder.setBitRate(this.def.bitRate);
    this.encoder.setChannelLayout(this.def.channelLayout);
    this.encoder.setSampleFormat(this.def.sampleFormat);
    this.encoder.setSampleRate(this.def.sampleRate);
    this.busy = false;
  }

  _construct(callback: (error?: Error | null | undefined) => void): void {
    (async () => {
      this.busy = true;
      verbose('AudioEncoder: priming the encoder');
      await this.encoder.openCodecAsync(this.codec);
      verbose(`AudioEncoder: encoder primed, codec ${this.codec.name()}, ` +
        `bitRate: ${this.encoder.bitRate()}, sampleFormat: ${this.encoder.sampleFormat()}@${this.encoder.sampleRate()}, ` +
        `timeBase: ${this.encoder.timeBase()}`
      );
      this.busy = false;
    })().then(() => void callback()).then(() => this.emit('ready')).catch(callback);
  }

  _transform(samples: any, encoding: BufferEncoding, callback: TransformCallback): void {
    verbose('AudioEncoder: encoding samples');
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
    })().then(() => void callback()).catch(callback);
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
    })().catch(callback);
  }

  coder(): any {
    return this.encoder;
  }

  definition(): AudioStreamDefinition {
    return this.def;
  }
}
