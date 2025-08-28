import { Readable, Writable } from 'stream';

export * from './binding/index';

declare module './binding/index' {
  class CustomIO { }
  class WritableCustomIO extends Writable implements CustomIO { }
  class ReadableCustomIO extends Readable implements CustomIO { }
}
