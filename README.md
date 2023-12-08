# ffmpeg (w/avcpp) bindings for Node.js

`node-ffmpeg` is a JavaScript wrapper around [`avcpp`](https://github.com/h4tr3d/avcpp) which is a C++ wrapper around the low-level C API of [`ffmpeg`](https://ffmpeg.org/).

# Current status

The project is still unpublished, but basic video and audio demultiplexing, transcoding and multiplexing are functional.

`ffmpeg` is a low-level C API which is very unsafe to use - try to interpret 720p as 1080p and you will end up with a segfault. `avcpp` adds a semi-safe layer on top of it, but mismatching stream parameters will still lead to a segfault. `node-ffmpeg` should never segfault if all the parameters are correctly checked and set up - but may easily segfault if these are mismatched - or if the asynchronous methods are reentered.

Producing a completely safe wrapper that never segfaults, no matter what the user does, is a gargantuan task that is currently not planned.

The current goal is to simply be able to guarantee that a ***correct*** JavaScript code will never segfault on any input file.

## Performance

All the underlying heavy-lifting is performed by the `ffmpeg` C code - which means that unless you access and process the raw video and audio data, the performance will be nearly identical to that of `ffmpeg` when used from the command-line. This includes rescaling and resampling via the provided tools. Background processing is provided via the `libuv` thread pool of Node.js - which means that, at least in theory - you can be decoding and encoding on two different cores while V8/JavaScript runs on a third core. In practice, you need huge buffers for this to actually be the case.

If you need to access the actual video data, then, depending on the applied processing, performance may be an order of magnitude lower.

# Usage

## Install

Currently the only way to get `node-ffmpeg` is to build it from source using `node-pre-gyp` which will be automatically called by `npm install`.

This will pull and build `ffmpeg` using `conan` which will leave a very large directory `${USER}/.conan` which can be safely deleted.

## Streams API

The easiest way to use `node-ffmpeg` is the high-level streams API.

### Quickstart

A quick example for generalized video transcoding using the streams API.

```ts
import { Muxer, Demuxer, VideoDecoder, VideoEncoder, Discarder, VideoTransform, VideoStreamDefinition } from 'node-ffmpeg/Stream';

// Create a Demuxer - a Demuxer is an object that has multiple ReadableStream,
// it decodes the input container format and emits compressed data
const input = new Demuxer({ inputFile:'launch.mp4' });

// Wait for the Demuxer to read the file headers and to identify the various streams
input.on('ready', () => {
    // Once the input Demuxer is ready, it will contain two arrays of ReadableStream:
    // input.video[]
    // input.audio[]

    // We will be discarding the audio stream
    const audioDiscard = new Discarder();
    // A VideoDecoder is a TransformStream that reads compressed video data
    // and sends raw video frames (this is the decoding codec)
    const videoInput = new VideoDecoder(input.video[0]);
    // A VideoDefinition is an object with all the properties of the stream
    const videoInputDefinition = videoInput.definition();

    // Such as codec, bitrate, framerate, frame size, pixel format
    const videoOutputDefinition = {
      type: 'Video',
      codec: ffmpeg.AV_CODEC_H264,
      bitRate: 2.5e6,
      width: 320,
      height: 200,
      frameRate: new ffmpeg.Rational(25, 1),
      pixelFormat: new ffmpeg.PixelFormat(ffmpeg.AV_PIX_FMT_YUV422P)
    } as VideoStreamDefinition;

    // A video encoder is a TransformStream that reads raw video frames
    // and sends compressed video data (this is the encoding codec)
    const videoOutput = new VideoEncoder(videoOutputDefinition);

    // A VideoTransform is a TransformStream that reads raw video frames
    // and sends raw video frames - with different frame size or pixel format
    const videoRescaler = new VideoTransform({
      input: videoInputDefinition,
      output: videoOutputDefinition,
      interpolation: ffmpeg.SWS_BILINEAR
    });

    // A Muxer is an object that contains multiple WritableStream
    // It multiplexes those streams, handling interleaving by buffering,
    // and writes the to the output format
    const output = new Muxer({ outputFile: 'video.mkv', outputFormat: 'mkv', streams: [videoOutput] });

    // The transcoding operation is completely asynchronous, it is finished
    // when all output streams are finished
    output.on('finish', () => {
      console.log('we are done!');
    });

    // These are the error handlers (w/o them the process will stop on error)
    input.video[0].on('error', (err) => console.error(err));
    input.audio[0].on('error', (err) => console.error(err));
    output.video[0].on('error', (err) => console.error(err));

    // This launches the transcoding
    // Demuxer -> Decoder -> Rescaler -> Encoder -> Muxer
    input.video[0].pipe(videoInput).pipe(videoRescaler).pipe(videoOutput).pipe(output.video[0]);
    input.audio[0].pipe(audioDiscard);
});
```

### More examples

You should start by looking at the unit tests:
  * [`transcode.test.ts`](https://github.com/mmomtchev/node-ffmpeg/blob/main/test/transcode.test.ts) contains simple examples for transcoding audio and video
  * [`extract.test.ts`](https://github.com/mmomtchev/node-ffmpeg/blob/main/test/extract.test.ts) contains a simple example for extracting a still from a video and importing it in ImageMagick
  * [`encode.test.ts`](https://github.com/mmomtchev/node-ffmpeg/blob/main/test/encode.test.ts) contains a simple example for producing a video from stills using ImageMagick
  * [`rescale.test.ts`](https://github.com/mmomtchev/node-ffmpeg/blob/main/test/rescale.test.ts) contains a simple example for rescaling/resampling a video using ffmpeg's built-in `libswscale`
  * [`resample.test.ts`](https://github.com/mmomtchev/node-ffmpeg/blob/main/test/resample.test.ts) contains a simple example for resampling audio using ffmpeg's built-in `libswresample`

## Supported pixel and audio formats

* [Pixel Formats](https://github.com/FFmpeg/FFmpeg/blob/master/libavutil/pixdesc.c) (*scroll down*)

* [Audio Sampling Formats](https://github.com/FFmpeg/FFmpeg/blob/master/libavutil/samplefmt.c)

* [Codecs](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/codec_id.h)

* Container Formats
  * [Full List](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/allformats.c)
  * [Each Invidiual Format](https://github.com/FFmpeg/FFmpeg/tree/master/libavformat)
