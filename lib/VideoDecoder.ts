import { Transform } from 'node:stream';
import ffmpeg from '..';
import { MuxerChunk } from './Stream';
import { TransformCallback } from 'stream';

const { VideoDecoderContext, Codec } = ffmpeg;

export const verbose = process.env.DEBUG_VIDEO_DECODER ? console.debug.bind(console) : () => undefined;

export class VideoDecoder extends Transform {
  protected decoder: any;

  constructor() {
    super({ objectMode: true });
    this.decoder = null;
  }

  _transform(chunk: MuxerChunk, encoding: BufferEncoding, callback: TransformCallback): void {
    verbose('VideoDecoder: start of _transform');
    (async () => {
      if (!this.decoder) {
        verbose('VideoDecoder: priming the decoder');
        if (!chunk._stream) {
          return void callback(new Error('Input is not a demuxed stream'));
        }
        if (!chunk._stream.isVideo()) {
          return void callback(new Error('Input is not video'));
        }
        this.decoder = new VideoDecoderContext(chunk._stream);
        this.decoder.setRefCountedFrames(true);
        await this.decoder.openCodecAsync(new Codec);
        verbose('VideoDecoder: decoder primed');
      }

      verbose('VideoDecoder: decoding chunk');
      const frame = await this.decoder.decodeAsync(chunk.packet, true);
      if (frame.isComplete()) {
        verbose(`VideoDecoder: Decoded frame: pts=${frame.pts()} / ${frame.pts().seconds()} / ${frame.timeBase()} / ${frame.width()}x${frame.height()}, size=${frame.size()}, ref=${frame.isReferenced()}:${frame.refCount()} / type: ${frame.pictureType()} }`);
        this.push(frame);
      } else {
        verbose('VideoDecoder: empty frame');
      }
      verbose('VideoDecoder: end of _transform');
      callback();
    })().catch(callback);
  }
}
