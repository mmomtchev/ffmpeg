import { TransformCallback } from 'node:stream';
import ffmpeg from '@mmomtchev/ffmpeg';
import { MediaTransform, MediaTransformOptions, VideoReadable, VideoStreamDefinition, VideoWritable } from './MediaStream';

export interface VideoTransformOptions extends MediaTransformOptions {
  input: VideoStreamDefinition;
  output: VideoStreamDefinition;
  interpolation: number;
}

/**
 * A stream Transform that uses VideoRescaler to rescale/resample the raw video.
 * Must receive input from a VideoDecoder and must output to a VideoEncoder
 */
export class VideoTransform extends MediaTransform implements VideoWritable, VideoReadable {
  protected rescaler: ffmpeg.VideoRescaler;

  constructor(options: VideoTransformOptions) {
    super(options);
    this.rescaler = new ffmpeg.VideoRescaler(
      options.output.width, options.output.height, options.output.pixelFormat,
      options.input.width, options.input.height, options.input.pixelFormat,
      options.interpolation
    );
  }

  _transform(chunk: ffmpeg.VideoFrame, encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      this.rescaler.rescaleAsync(chunk)
        .then((frame: ffmpeg.VideoFrame) => {
          this.push(frame);
          callback();
        }).catch(callback);
    } catch (err) {
      callback(err as Error);
    }
  }
}
