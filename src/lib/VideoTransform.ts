import { Transform, TransformOptions, TransformCallback } from 'node:stream';
import ffmpeg from 'ffmpeg.js';
import { VideoStreamDefinition } from './MediaStream';

export interface VideoTransformOptions extends TransformOptions {
  objectMode?: never;
  input: VideoStreamDefinition;
  output: VideoStreamDefinition;
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
      options.output.width, options.output.height, options.output.pixelFormat,
      options.input.width, options.input.height, options.input.pixelFormat,
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
