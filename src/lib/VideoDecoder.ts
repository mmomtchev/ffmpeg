import ffmpeg from '@mmomtchev/ffmpeg';
import { VideoStreamDefinition, MediaStream, MediaTransform, EncodedMediaWritable } from './MediaStream';
import { TransformCallback } from 'stream';

const { VideoDecoderContext, Codec } = ffmpeg;

export const verbose = (process.env.DEBUG_VIDEO_DECODER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

/**
 * A VideoDecoder is Transform stream that can read raw encoded video data
 * from a Demuxer and write decoded video frames.
 * Its parameters are inherited from the Demuxer.
 */
export class VideoDecoder extends MediaTransform implements MediaStream, EncodedMediaWritable {
  protected decoder: ffmpeg.VideoDecoderContext | null;
  protected stream: any;
  ready: boolean;

  constructor(options: { _stream: any; }) {
    super();
    this.decoder = null;
    if (!options._stream) {
      throw new Error('Input is not a demuxed stream');
    }
    if (!options._stream.isVideo()) {
      throw new Error('Input is not video');
    }
    this.stream = options._stream;
    this.decoder = new VideoDecoderContext(this.stream);
    this.decoder.setRefCountedFrames(true);
    this.ready = false;
  }

  _construct(callback: (error?: Error | null | undefined) => void): void {
    (async () => {
      verbose('VideoDecoder: priming the decoder');
      await this.decoder!.openCodecAsync(new Codec);
      verbose('VideoDecoder: decoder primed');
      callback();
      this.ready = true;
      this.emit('ready');
    })()
      .catch(callback);
  }

  _transform(packet: ffmpeg.Packet, encoding: BufferEncoding, callback: TransformCallback): void {
    verbose('VideoDecoder: decoding chunk');
    (async () => {
      const frame = await this.decoder!.decodeAsync(packet, true);
      if (frame.isComplete()) {
        verbose(`VideoDecoder: Decoded frame: pts=${frame.pts()} / ${frame.pts().seconds()} / ${frame.timeBase()} / ${frame.width()}x${frame.height()}, size=${frame.size()}, ref=${frame.isReferenced()}:${frame.refCount()} / type: ${frame.pictureType()} }`);
        this.push(frame);
      } else {
        verbose('VideoDecoder: empty frame');
      }
      callback();
    })()
      .catch(callback);
  }

  codec() {
    return this.decoder;
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
