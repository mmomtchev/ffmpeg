import ffmpeg from '@mmomtchev/ffmpeg';
import { VideoStreamDefinition, MediaTransform, EncodedMediaWritable, MediaDecoder } from './MediaStream';
import { TransformCallback } from 'stream';

const { VideoDecoderContext, Codec } = ffmpeg;

export const verbose = (process.env.DEBUG_VIDEO_DECODER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

/**
 * A VideoDecoder is Transform stream that can read raw encoded video data
 * from a Demuxer and write decoded video frames.
 * Its parameters are inherited from the Demuxer.
 */
export class VideoDecoder extends MediaTransform implements MediaDecoder, EncodedMediaWritable {
  protected decoder: ffmpeg.VideoDecoderContext | null;
  protected busy: boolean;
  protected stream: ffmpeg.Stream;
  ready: boolean;

  constructor(options: { stream: ffmpeg.Stream; }) {
    super();
    this.decoder = null;
    if (!options.stream) {
      throw new Error('Input is not a demuxed stream');
    }
    if (!options.stream.isVideo()) {
      throw new Error('Input is not video');
    }
    this.stream = options.stream;
    this.decoder = new VideoDecoderContext(this.stream);
    this.decoder.setRefCountedFrames(true);
    this.busy = false;
    this.ready = false;
  }

  _construct(callback: (error?: Error | null | undefined) => void): void {
    (async () => {
      this.busy = true;
      verbose('VideoDecoder: priming the decoder');
      await this.decoder!.openCodecAsync(new Codec);
      verbose('VideoDecoder: decoder primed');
      this.busy = false;
      callback();
      this.ready = true;
      this.emit('ready');
    })()
      .catch(callback);
  }

  _transform(packet: ffmpeg.Packet, encoding: BufferEncoding, callback: TransformCallback): void {
    if (this.busy) return void callback(new Error('Decoder called while busy'));
    verbose('VideoDecoder: decoding chunk');
    (async () => {
      this.busy = true;
      const frame = await this.decoder!.decodeAsync(packet, true);
      if (frame.isComplete()) {
        verbose(`VideoDecoder: Decoded frame: pts=${frame.pts()} / ${frame.pts().seconds()} / ${frame.timeBase()} / ${frame.width()}x${frame.height()}, size=${frame.size()}, ref=${frame.isReferenced()}:${frame.refCount()} / type: ${frame.pictureType()} }`);
        this.push(frame);
      } else {
        verbose('VideoDecoder: empty frame');
      }
      this.busy = false;
      callback();
    })()
      .catch(callback);
  }

  codec() {
    return this.decoder!.codec()!;
  }

  definition(): VideoStreamDefinition {
    return {
      type: 'Video',
      bitRate: this.decoder!.bitRate(),
      codec: this.decoder!.codec(),
      width: this.decoder!.width(),
      height: this.decoder!.height(),
      frameRate: this.stream.frameRate(),
      pixelFormat: this.decoder!.pixelFormat(),
      timeBase: this.decoder!.timeBase()
    } as VideoStreamDefinition;
  }
}
