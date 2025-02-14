import { Readable, Writable } from 'stream';

declare const ffmpeg: typeof import('./binding/index');
export default ffmpeg;

declare module './binding/index' {
  class WritableCustomIO extends Writable { }
  class ReadableCustomIO extends Readable { }
}
