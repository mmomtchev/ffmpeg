import { EventEmitter, Writable, Readable } from 'node:stream';
import ffmpeg from '@mmomtchev/ffmpeg';
import { MediaStreamDefinition, isAudioDefinition, isVideoDefinition } from './MediaStream';

export const verbose = (process.env.DEBUG_FILTER || process.env.DEBUG_ALL) ? console.debug.bind(console) : () => undefined;

export interface FilterOptions {
  // Filter sources definitions
  inputs: Record<string, MediaStreamDefinition>;
  // Filter sinks definitions
  outputs: Record<string, MediaStreamDefinition>;
  // Graph string
  graph: string;
  // A filter must have a single time base
  timeBase: any;
}

/**
 * A Transform stream that uses avfilter to transform a number of MediaStream.
 * Must receive raw decoded input and sends raw decoded output.
 */
export class Filter extends EventEmitter {
  protected filterGraph: any;
  protected bufferSrc: Record<string, {
    buffer: any;
    busy: boolean;
  }>;
  protected bufferSink: Record<string, {
    buffer: any;
    waitingToRead: number;
  }>;
  protected timeBase: any;
  protected stillStreamingSources: number;
  protected destroyed: boolean;
  src: Record<string, any>;
  sink: Record<string, any>;

  constructor(options: FilterOptions) {
    super();
    this.filterGraph = new ffmpeg.FilterGraph;
    this.timeBase = options.timeBase;

    // construct inputs
    let filterDescriptor = '';
    for (const inp of Object.keys(options.inputs)) {
      const def = options.inputs[inp];
      if (isVideoDefinition(def)) {
        filterDescriptor += `buffer@${inp}=video_size=${def.width}x${def.height}:` +
          `pix_fmt=${def.pixelFormat.toString()}:time_base=${def.timeBase.toString()} [${inp}];  `;
      }
      if (isAudioDefinition(def)) {
        throw new Error('later');
      }
    }
    filterDescriptor += options.graph;
    for (const outp of Object.keys(options.outputs)) {
      const def = options.outputs[outp];
      if (isVideoDefinition(def)) {
        filterDescriptor += `[${outp}] buffersink@${outp}`;
      }
    }
    verbose(`Filter: constructed graph ${filterDescriptor}`);
    this.filterGraph.parse(filterDescriptor);
    this.filterGraph.config();

    this.stillStreamingSources = 0;
    this.destroyed = false;
    this.src = {};
    this.bufferSrc = {};
    for (const inp of Object.keys(options.inputs)) {
      this.bufferSrc[inp] = {
        buffer: new ffmpeg.BufferSrcFilterContext(this.filterGraph.filter(`buffer@${inp}`)),
        busy: false
      };
      this.src[inp] = new Writable({
        objectMode: true,
        write: (chunk: any, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void) => {
          this.write(inp, chunk, callback);
        },
        destroy: (error: Error | null, callback: (error: Error | null) => void): void => {
          if (error) {
            this.stillStreamingSources--;
            verbose(`Filter: error on source [${inp}], destroy all streams`, error);
            this.destroy(error);
          } else {
            verbose(`Filter: destroy source [${inp}]`);
            callback(null);
          }
        },
        final: (callback: (error?: Error | null | undefined) => void): void => {
          verbose(`Filter: end source [${inp}]`);
          // VideoFrame.null() is a special EOF frame
          this.write(inp, ffmpeg.VideoFrame.null(), callback);
          callback(null);
          this.stillStreamingSources--;
          if (this.stillStreamingSources === 0)
            this.emit('finish');
        }
      });
      this.stillStreamingSources++;
      Promise.resolve().then(() => {
        this.emit('ready');
      });
    }

    this.sink = {};
    this.bufferSink = {};
    for (const outp of Object.keys(options.outputs)) {
      this.bufferSink[outp] = {
        buffer: new ffmpeg.BufferSinkFilterContext(this.filterGraph.filter(`buffersink@${outp}`)),
        waitingToRead: 0
      };
      this.sink[outp] = new Readable({
        objectMode: true,
        read: (size: number) => {
          this.read(outp, size);
        }
      });
    }
  }

  destroy(error: Error) {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const s of Object.keys(this.bufferSrc)) {
      this.sink[s].destroy(error);
    }
    for (const s of Object.keys(this.bufferSink)) {
      this.src[s].destroy(error);
    }
    this.emit('error');
  }

  write(id: string, frame: any, callback: (error?: Error | null | undefined) => void) {
    const src = this.bufferSrc[id];
    if (!src) {
      return void callback(new Error(`Invalid buffer src [${id}]`));
    }
    if (src.busy) {
      // This is obviously a major malfunction and should never happen as long
      // as the writer respects the stream semantics
      return void callback(new Error(`Writing is not reentrant on [${id}]!`));
    }
    src.busy = true;

    frame.setPictureType(ffmpeg.AV_PICTURE_TYPE_NONE);
    frame.setTimeBase(this.timeBase);
    frame.setStreamIndex(0);

    verbose(`Filter: received data for source [${id}]`);
    src.buffer.writeVideoFrameAsync(frame)
      .then(() => {
        src.busy = false;
        verbose(`Filter: consumed data for source [${id}], pts=${frame.pts().toString()}`);
        callback(null);
        // Now that we pushed more data, try reading again, refer to 1* below
        for (const sink of Object.keys(this.bufferSink)) {
          // This is fully synchronous on purpose - otherwise we might run
          // into complex synchronization issues where someone else manages
          // to call read between the two operations
          const size = this.bufferSink[sink].waitingToRead;
          if (size) {
            verbose(`Filter: wake up sink [${sink}]`);
            this.bufferSink[sink].waitingToRead = 0;
            this.read(sink, size);
          }
        }
      })
      .catch(callback);
  }

  read(id: string, size: number) {
    const sink = this.bufferSink[id];
    if (!sink) {
      throw new Error(`Invalid buffer sink [${id}]`);
    }
    verbose(`Filter: received a request for data from sink [${id}]`);

    // read must always return immediately
    // this means that we depend on ffmpeg not doing any filtering work on this call.
    // This is the meaning of the special flag.
    const videoFrame = new ffmpeg.VideoFrame;
    let frames = 0;
    while (sink.buffer.getVideoFrame(videoFrame) && frames < size) {
      verbose(`Filter: sent data from sink [${id}], pts=${videoFrame.pts().toString()}`);
      videoFrame.setPictureType(ffmpeg.AV_PICTURE_TYPE_NONE);
      videoFrame.setTimeBase(this.timeBase);
      videoFrame.setStreamIndex(0);
      this.sink[id].push(videoFrame);
      frames++;
    }
    if (this.stillStreamingSources === 0) {
      verbose(`Filter: sending null for EOF on sink [${id}]`);
      this.sink[id].push(null);
      return;
    }
    if (frames === 0) {
      verbose(`Filter: no data for sink [${id}] will call back later`);
      // If nothing was readily available, now it will be up to us
      // to call back when something is, see 1* above
      sink.waitingToRead = size;
    }
  }
}
