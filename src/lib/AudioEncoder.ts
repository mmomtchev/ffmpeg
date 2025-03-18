import ffmpeg, { AudioEncoderContext, AudioSamples } from '@mmomtchev/ffmpeg';
import { AudioStreamDefinition, EncodedMediaReadable, MediaStream, MediaTransform } from './MediaStream';
import { TransformCallback } from 'stream';

export const verbose = (process.env.DEBUG_AUDIO_ENCODER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

/**
 * An AudioEncoder is Transform stream that can read raw audio samples
 * and write encoded audio data to a Muxer.
 * Its parameters must be explicitly configured.
 */
export class AudioEncoder extends MediaTransform implements MediaStream, EncodedMediaReadable {
  protected def: AudioStreamDefinition;
  protected encoder: ffmpeg.AudioEncoderContext;
  protected codec_: ffmpeg.Codec;
  protected busy: boolean;
  type = 'Audio' as const;
  ready: boolean;

  constructor(def: AudioStreamDefinition) {
    super();
    this.def = { ...def };
    if (this.def.codec instanceof ffmpeg.Codec) {
      this.codec_ = ffmpeg.findDecodingCodec(this.def.codec.id());
    } else {
      this.codec_ = ffmpeg.findEncodingCodec(this.def.codec);
    }
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

  _transform(samples: ffmpeg.AudioSamples, encoding: BufferEncoding, callback: TransformCallback): void {
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
    let packet: ffmpeg.Packet;
    let packetIsComplete: boolean = false;
    (async () => {
      do {
        packet = await this.encoder.finalizeAsync();
        // Don't touch packet after pushing for async handling
        packetIsComplete = !!packet && packet.isComplete();
        this.push(packet);
      } while (packetIsComplete);
      callback();
    })()
      .catch(callback);
  }

  codec(): ffmpeg.AudioEncoderContext {
    return this.encoder;
  }

  definition(): AudioStreamDefinition {
    return this.def;
  }

  get _stream(): any {
    return this.encoder;
  }

  isAudio(): boolean {
    return true;
  }

  isVideo(): boolean {
    return false;
  }
}
