import { Transform, TransformOptions, TransformCallback } from 'node:stream';
import ffmpeg from '..';

export interface VideoTransformOptions extends TransformOptions {
  objectMode?: never;
  dstWidth: number;
  dstHeight: number;
  dstPixelFormat: any;
  srcWidth: number;
  srcHeight: number;
  srcPixelFormat: any;
  interpolation: number;
}

/**
 * A stream Transform that uses VideoRescaler to rescale/resample the raw video.
 * Must receive input from a VideoDecoder and must output to a VideoEncoder
 */
export class VideoTransform extends Transform {
  protected rescaler: any;

  constructor(options: VideoTransformOptions) {
    super({ ...options, objectMode: true });
    this.rescaler = new ffmpeg.VideoRescaler(
      options.dstWidth, options.dstHeight, options.dstPixelFormat,
      options.srcWidth, options.srcHeight, options.srcPixelFormat,
      options.interpolation
    );
  }

  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      const frame = this.rescaler.rescale(chunk);
      this.push(frame);
      callback();
    } catch (err) {
      callback(err as Error);
    }      
  }
}
