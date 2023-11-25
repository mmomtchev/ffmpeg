import { Transform } from 'node:stream';
import ffmpeg from '..';
import { MuxerChunk, VideoStreamDefinition } from './Stream';
import { TransformCallback } from 'stream';

const { VideoEncoderContext, Codec, VideoFrame } = ffmpeg;

export const verbose = process.env.DEBUG_VIDEO_ENCODER ? console.debug.bind(console) : () => undefined;

export class VideoEncoder extends Transform {
  protected def: VideoStreamDefinition;
  protected encoder: any;
  protected codec: any;
  protected outputPriming: (() => Promise<void>) | null;

  constructor(def: VideoStreamDefinition) {
    super({ objectMode: true });
    this.def = def;
    this.codec = ffmpeg.findEncodingCodec(this.def.codec);
    verbose(`VideoEncoder: using ${this.codec.name()}`);
    this.encoder = new VideoEncoderContext(this.codec);
    this.encoder.setWidth(this.def.width);
    this.encoder.setHeight(this.def.height);
    if (this.def.timeBase)
      this.encoder.setTimeBase(this.def.timeBase);
    else
      this.encoder.setTimeBase(new ffmpeg.Rational(1, 1000));
    this.encoder.setBitRate(this.def.bitRate);
    this.encoder.setPixelFormat(this.def.pixelFormat);
    this.outputPriming = null;
  }

  _construct(callback: (error?: Error | null | undefined) => void): void {
    (async () => {
      verbose('VideoEncoder: priming the encoder');
      await this.encoder.openCodecAsync(this.codec);
      verbose(`VideoEncoder: encoder primed, codec ${this.codec.name()}, ` +
        `bitRate: ${this.encoder.bitRate()}, pixelFormat: ${this.encoder.pixelFormat()}, ` +
        `timeBase: ${this.encoder.timeBase()}, ${this.encoder.width()}x${this.encoder.height()}`
      );
    })().then(() => void callback()).catch(callback);
  }

  _transform(frame: any, encoding: BufferEncoding, callback: TransformCallback): void {
    verbose('VideoEncoder: encoding frame');
    (async () => {
      if (!this.encoder) {
        return void callback(new Error('VideoEncoder is not primed'));
      }
      if (!(frame instanceof VideoFrame)) {
        return void callback(new Error('Input is not a raw video'));
      }
      if (!frame.isComplete()) {
        return void callback(new Error('Received incomplete frame'));
      }
      if (this.outputPriming) {
        if (!frame.isKeyFrame()) {
          verbose('VideoEncoder: discarding initial B-frame');
          return;
        }
        verbose('VideoEncoder: waiting for output to prime');
        await this.outputPriming();
        this.outputPriming = null;
      }
      frame.setPictureType(ffmpeg.AV_PICTURE_TYPE_NONE);
      frame.setTimeBase(this.encoder.timeBase());
      const packet = await this.encoder.encodeAsync(frame);
      verbose(`VideoEncoder: frame: pts=${frame.pts()} / ${frame.pts().seconds()} / ${frame.timeBase()} / ${frame.width()}x${frame.height()}, size=${frame.size()}, ref=${frame.isReferenced()}:${frame.refCount()} / type: ${frame.pictureType()} }`);
      this.push(packet);
    })().then(() => void callback()).catch(callback);
  }

  _flush(callback: TransformCallback): void {
    verbose('VideoEncoder: flushing');
    this.encoder.finalizeAsync()
      .then((pkt: any) => this.push(pkt))
      .then(() => void callback())
      .catch(callback);
  }

  getEncoder(): any {
    return this.encoder;
  }

  getDefinition(): VideoStreamDefinition {
    return this.def;
  }

  setOutputPriming(primer: () => Promise<void>) {
    this.outputPriming = primer;
  }
}
