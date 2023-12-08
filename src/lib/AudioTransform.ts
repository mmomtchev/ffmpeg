import { Transform, TransformOptions, TransformCallback } from 'node:stream';
import ffmpeg from 'ffmpeg.js';
import { AudioStreamDefinition } from './MediaStream';

export const verbose = (process.env.DEBUG_AUDIO_TRANSFORM || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

export interface AudioTransformOptions extends TransformOptions {
  objectMode?: never;
  input: AudioStreamDefinition;
  output: AudioStreamDefinition;
}

/**
 * A stream Transform that uses AudioResampler to rescale/resample the raw Audio.
 * Must receive input from a AudioDecoder and must output to a AudioEncoder
 */
export class AudioTransform extends Transform {
  protected resampler: any;
  protected frameSize: number | undefined;

  constructor(options: AudioTransformOptions) {
    super({ ...options, objectMode: true });
    this.resampler = new ffmpeg.AudioResampler(
      options.output.channelLayout.layout(), options.output.sampleRate, options.output.sampleFormat,
      options.input.channelLayout.layout(), options.input.sampleRate, options.input.sampleFormat
    );
  }

  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      if (!this.frameSize) {
        this.frameSize = chunk.samplesCount();
        verbose(`AudioTransform: configured frame size to ${this.frameSize}`);
      }
      this.resampler.push(chunk);
      let samples;
      // At each tick we are sending X samples and we are getting X*dstSampleRate/srcSampleRate samples
      // However the frame size must remain constant as it is a property of the codec
      // audioResampler has an internal buffer that does the necessary queuing automatically
      while (!(samples = this.resampler.pop(this.frameSize)).isNull()) {
        this.push(samples);
      }
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  _flush(callback: TransformCallback) {
    let samples;
    try {
      while (!(samples = this.resampler.pop(this.frameSize ?? 0)).isNull()) {
        this.push(samples);
      }
      samples = this.resampler.pop(0);
      if (!samples.isNull()) this.push(samples);
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }
}
