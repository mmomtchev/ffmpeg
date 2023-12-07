import { Writable, WritableOptions } from 'node:stream';

/**
 * A stream used for discarding data.
 */
export class Discarder extends Writable {
  constructor(options?: WritableOptions & { objectMode?: never; }) {
    super({ ...options, objectMode: true });
  }

  _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void): void {
    callback();
  }
}
