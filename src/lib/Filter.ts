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
  // The currently running filterGraph op, prevents reentering
  protected filterGraphOp: Promise<void> | false;
  protected bufferSrc: Record<string, {
    type: 'Audio' | 'Video';
    buffer: any;
    busy: boolean;
    nullFrame: any;
    id: string;
  }>;
  protected bufferSink: Record<string, {
    type: 'Audio' | 'Video';
    buffer: any;
    waitingToRead: number;
    busy: boolean;
    id: string;
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
        if (!def.pixelFormat || !def.timeBase)
          throw new Error('timeBase and pixelFormat are mandatory for filter sources');
        filterDescriptor += `buffer@${inp}=video_size=${def.width}x${def.height}:` +
          `pix_fmt=${def.pixelFormat.toString()}:time_base=${def.timeBase.toString()} [${inp}];  `;
      }
      if (isAudioDefinition(def)) {
        filterDescriptor += `abuffer@${inp}=sample_rate=${def.sampleRate}:` +
          `channel_layout=${def.channelLayout.toString()}:` +
          `sample_fmt=${def.sampleFormat.toString()}:time_base=${def.timeBase.toString()} [${inp}];  `;
      }
    }
    filterDescriptor += options.graph;
    for (const outp of Object.keys(options.outputs)) {
      const def = options.outputs[outp];
      if (isVideoDefinition(def)) {
        filterDescriptor += `[${outp}] buffersink@${outp};  `;
      } else if (isAudioDefinition(def)) {
        filterDescriptor += `[${outp}] abuffersink@${outp};  `;
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
      const def = options.inputs[inp];
      let nullFrame: any;
      let id: string;
      let type: 'Audio' | 'Video';
      if (isVideoDefinition(def)) {
        nullFrame = ffmpeg.VideoFrame.null();
        id = `buffer@${inp}`;
        type = 'Video';
      } else if (isAudioDefinition(def)) {
        nullFrame = ffmpeg.AudioSamples.null();
        id = `abuffer@${inp}`;
        type = 'Audio';
      } else {
        throw new Error('Only Video and Audio filtering is supported');
      }
      this.bufferSrc[inp] = {
        type,
        id,
        buffer: new ffmpeg.BufferSrcFilterContext(this.filterGraph.filter(id)),
        busy: false,
        nullFrame
      };
      this.src[inp] = new Writable({
        objectMode: true,
        write: (chunk: any, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void) => {
          this.write(inp, chunk, callback);
        },
        destroy: (error: Error | null, callback: (error: Error | null) => void): void => {
          verbose(`Filter: destroy src [${inp}]`, error);
          if (error) {
            this.stillStreamingSources--;
            verbose(`Filter: error on source [${inp}]: destroy all streams`, error);
            this.destroy(error);
          } else {
            verbose(`Filter: destroy source [${inp}]`);
            callback(null);
          }
        },
        final: (callback: (error?: Error | null | undefined) => void): void => {
          verbose(`Filter: end source [${inp}]`);
          this.write(inp, nullFrame, callback);
          callback(null);
          this.stillStreamingSources--;
          if (this.stillStreamingSources === 0)
            this.emit('finish');
        }
      });
      this.src[inp].on('error', this.destroy.bind(this));
      this.stillStreamingSources++;
      Promise.resolve().then(() => {
        this.emit('ready');
      });
    }

    this.sink = {};
    this.bufferSink = {};
    for (const outp of Object.keys(options.outputs)) {
      const def = options.outputs[outp];
      let id: string;
      let type: 'Audio' | 'Video';
      if (isVideoDefinition(def)) {
        id = `buffersink@${outp}`;
        type = 'Video';
      } else if (isAudioDefinition(def)) {
        id = `abuffersink@${outp}`;
        type = 'Audio';
      } else {
        throw new Error('Only Video and Audio filtering is supported');
      }
      this.bufferSink[outp] = {
        type,
        id,
        buffer: new ffmpeg.BufferSinkFilterContext(this.filterGraph.filter(id)),
        busy: false,
        waitingToRead: 0
      };
      this.sink[outp] = new Readable({
        objectMode: true,
        read: (size: number) => {
          this.read(outp, size);
        }
      });
      this.sink[outp].on('error', this.destroy.bind(this));
    }

    this.filterGraphOp = false;
  }

  protected destroy(error: Error) {
    verbose('Filter: destroy', error);
    if (this.destroyed) return;
    this.destroyed = true;
    for (const s of Object.keys(this.bufferSrc)) {
      this.src[s].destroy(error);
    }
    for (const s of Object.keys(this.bufferSink)) {
      this.sink[s].destroy(error);
    }
    this.emit('error', error);
  }

  protected async write(id: string, frame: any, callback: (error?: Error | null | undefined) => void) {
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

    verbose(`Filter: write source [${id}]: received data`);

    try {
      if (src.type === 'Video') {
        if (!(frame instanceof ffmpeg.VideoFrame))
          return void callback(new Error('Filter source video input must be a stream of VideoFrames'));
        frame.setPictureType(ffmpeg.AV_PICTURE_TYPE_NONE);
        frame.setTimeBase(this.timeBase);
        frame.setStreamIndex(0);
        while (this.filterGraphOp) await this.filterGraphOp;
        this.filterGraphOp = src.buffer.writeVideoFrameAsync(frame);
      } else if (src.type === 'Audio') {
        if (!(frame instanceof ffmpeg.AudioSamples))
          return void callback(new Error('Filter source video input must be a stream of AudioSamples'));
        frame.setTimeBase(this.timeBase);
        frame.setStreamIndex(0);
        while (this.filterGraphOp) await this.filterGraphOp;
        this.filterGraphOp = src.buffer.writeAudioSamplesAsync(frame);
      } else {
        return void callback(new Error('Only Video and Audio filtering is supported'));
      }

      (this.filterGraphOp as Promise<void>).then(() => {
        this.filterGraphOp = false;
        src.busy = false;
        verbose(`Filter: write source [${id}]: wrote, pts=${frame.pts().toString()}`);
        callback(null);
        // Now that we pushed more data, try reading again if there were waiting reads
        for (const sink of Object.keys(this.bufferSink)) {
          if (this.bufferSink[sink].waitingToRead && !this.bufferSink[sink].busy) {
            verbose(`Filter: write source [${id}]: wake up sink [${sink}]`);
            this.read(sink, 0);
          }
        }
      })
        .catch(callback);
    } catch (err) {
      callback(err as Error);
    }
  }

  protected async read(id: string, size: number) {
    const sink = this.bufferSink[id];
    if (!sink) {
      throw new Error(`Invalid buffer sink [${id}]`);
    }
    verbose(`Filter: read sink [${id}] begin: received a request for data, busy: ${sink.busy}`);
    sink.waitingToRead += size;
    if (sink.busy) {
      return;
    }
    sink.busy = true;

    let getFrame: () => Promise<any>;
    if (sink.type === 'Video') {
      getFrame = sink.buffer.getVideoFrameAsync.bind(sink.buffer);
    } else if (sink.type === 'Audio') {
      getFrame = sink.buffer.getAudioFrameAsync.bind(sink.buffer);
    } else {
      throw new Error('Only Video and Audio filtering is supported');
    }
    let frame: any;
    let more = true;
    do {
      while (this.filterGraphOp) await this.filterGraphOp;
      this.filterGraphOp = getFrame();
      frame = await this.filterGraphOp;
      this.filterGraphOp = false;
      if (frame) {
        verbose(`Filter: read sink [${id}] received: data, pts=${frame.pts().toString()}`);
        if (sink.type === 'Video') {
          frame.setPictureType(ffmpeg.AV_PICTURE_TYPE_NONE);
        }
        frame.setTimeBase(this.timeBase);
        frame.setStreamIndex(0);
        more = this.sink[id].push(frame);
        sink.waitingToRead++;
      }
    } while (frame && sink.waitingToRead > 0 && more);

    if (this.stillStreamingSources === 0 && frame === null) {
      verbose(`Filter: read sink [${id}]: sending null for EOF`);
      this.sink[id].push(null);
      return;
    }
    verbose(`Filter: read sink [${id}]: cycle for [${id}] end, more: ${more}, last: ${frame && frame.pts().toString()}, waiting: ${sink.waitingToRead}`);
    sink.busy = false;
  }
}
