import { Writable, WritableOptions } from 'node:stream';
import ffmpeg from '@mmomtchev/ffmpeg';


/**
 * A stream used for discarding data.
 */
export class Discarder extends Writable {
  constructor(options?: WritableOptions & { objectMode?: never; }) {
    super({ ...options, objectMode: true });
  }

  _write(chunk: ffmpeg.Packet | ffmpeg.AudioSamples, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void): void {
    callback();
  }
}
