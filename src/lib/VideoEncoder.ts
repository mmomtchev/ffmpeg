import ffmpeg from '@mmomtchev/ffmpeg';
import { VideoStreamDefinition, MediaTransform, MediaEncoder, EncodedVideoReadable } from './MediaStream';
import { TransformCallback } from 'stream';

const { VideoEncoderContext, VideoFrame } = ffmpeg;

export const verbose = (process.env.DEBUG_VIDEO_ENCODER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

/**
 * A VideoEncoder is Transform stream that can read raw video frames
 * and write encoded video data to a Muxer.
 * Its parameters must be explicitly configured.
 */
export class VideoEncoder extends MediaTransform implements MediaEncoder, EncodedVideoReadable {
  protected def: VideoStreamDefinition;
  protected encoder: ffmpeg.VideoEncoderContext;
  protected codec_: ffmpeg.Codec;
  protected busy: boolean;
  stream_: ffmpeg.Stream;
  type = 'Video' as const;
  ready: boolean;

  constructor(def: VideoStreamDefinition) {
    super();
    this.def = { ...def };
    if (this.def.codec instanceof ffmpeg.Codec) {
      this.codec_ = ffmpeg.findDecodingCodec(this.def.codec.id());
    } else {
      this.codec_ = ffmpeg.findEncodingCodec(this.def.codec);
    }
    verbose(`VideoEncoder: using ${this.codec_.name()}, ${this.def.width}x${this.def.height}, ` +
      `bitrate ${this.def.bitRate}, format ${this.def.pixelFormat}`);
    this.encoder = new VideoEncoderContext(this.codec_);
    this.encoder.setWidth(this.def.width);
    this.encoder.setHeight(this.def.height);
    if (this.def.timeBase)
      this.encoder.setTimeBase(this.def.timeBase);
    else
      this.encoder.setTimeBase(new ffmpeg.Rational(1, 1000));
    this.encoder.setBitRate(this.def.bitRate);
    this.encoder.setPixelFormat(this.def.pixelFormat);
    if (def.flags)
      this.encoder.addFlags(def.flags);
    this.busy = false;
    this.ready = false;
    this.stream_ = this.encoder.stream();
  }

  _construct(callback: (error?: Error | null | undefined) => void): void {
    (async () => {
      this.busy = true;
      verbose('VideoEncoder: priming the encoder', this.def.codecOptions);
      await this.encoder.openCodecOptionsAsync(this.def.codecOptions ?? {}, this.codec_);
      verbose(`VideoEncoder: encoder primed, codec ${this.codec_.name()}, ` +
        `bitRate: ${this.encoder.bitRate()}, pixelFormat: ${this.encoder.pixelFormat()}, ` +
        `timeBase: ${this.encoder.timeBase()}, ${this.encoder.width()}x${this.encoder.height()}`
      );
      this.busy = false;
      callback();
      this.ready = true;
      this.emit('ready');
    })()
      .catch(callback);
  }

  _transform(frame: ffmpeg.Packet, encoding: BufferEncoding, callback: TransformCallback): void {
    verbose('VideoEncoder: received frame');
    if (this.busy) return void callback(new Error('VideoEncoder called while busy, use proper writing semantics'));
    (async () => {
      this.busy = true;
      if (!this.encoder) {
        return void callback(new Error('VideoEncoder is not primed'));
      }
      if (!(frame instanceof VideoFrame)) {
        return void callback(new Error('Input is not a raw video'));
      }
      if (!frame.isValid()) {
        return void callback(new Error('Received invalid frame'));
      }
      frame.setPictureType(ffmpeg.AV_PICTURE_TYPE_NONE);
      frame.setTimeBase(await this.encoder.timeBaseAsync());
      const packet = await this.encoder.encodeAsync(frame);
      verbose(`VideoEncoder: encoded frame: pts=${frame.pts()} / ${frame.pts().seconds()} / ` +
        `${frame.timeBase()} / ${frame.width()}x${frame.height()}, size=${frame.size()}, ` +
        `ref=${frame.isReferenced()}:${frame.refCount()} / type: ${frame.pictureType()} }`);
      this.push(packet);
      this.busy = false;
      callback();
    })()
      .catch(callback);
  }

  _flush(callback: TransformCallback): void {
    verbose('VideoEncoder: flushing');
    if (this.busy) return void callback(new Error('VideoEncoder called while busy, use proper writing semantics'));
    let packet: ffmpeg.Packet;
    let packetIsComplete: boolean;
    (async () => {
      do {
        packet = await this.encoder.finalizeAsync();
        verbose(`Flushing packet, size=${packet.size()}, dts=${packet.dts().toString()}`);
        // don't touch packet after pushing for async handling
        packetIsComplete = packet != null && packet.isComplete();
        this.push(packet);
      } while (packetIsComplete);
      verbose('VideoEncoder flushed');
      callback();
    })()
      .catch(callback);
  }

  get stream(): ffmpeg.Stream {
    return this.stream_;
  }

  codec(): ffmpeg.Codec {
    return this.encoder.codec();
  }

  codecParameters(): ffmpeg.CodecParametersView {
    return this.stream_.codecParameters();
  }

  definition(): VideoStreamDefinition {
    return this.def;
  }

  context(): ffmpeg.VideoEncoderContext {
    return this.encoder;
  }

  isAudio(): boolean {
    return false;
  }

  isVideo(): boolean {
    return true;
  }
}
