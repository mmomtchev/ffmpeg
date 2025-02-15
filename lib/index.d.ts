import { Readable, Writable } from 'stream';

export * from './binding/index';

declare module './binding/index' {
  class WritableCustomIO extends Writable { }
  class ReadableCustomIO extends Readable { }
}
