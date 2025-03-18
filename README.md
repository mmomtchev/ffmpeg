# ffmpeg (w/avcpp) bindings for Node.js

![GitHub License](https://img.shields.io/github/license/mmomtchev/ffmpeg)
[![Node.js CI](https://github.com/mmomtchev/ffmpeg/actions/workflows/test-dev.yml/badge.svg)](https://github.com/mmomtchev/ffmpeg/actions/workflows/test-dev.yml)
[![codecov](https://codecov.io/github/mmomtchev/ffmpeg/graph/badge.svg?token=GYQQLAZ8MC)](https://codecov.io/github/mmomtchev/ffmpeg)
![npm (scoped)](https://img.shields.io/npm/v/%40mmomtchev/ffmpeg)
[![Test npm package](https://github.com/mmomtchev/ffmpeg/actions/workflows/test-npm.yml/badge.svg)](https://github.com/mmomtchev/ffmpeg/actions/workflows/test-npm.yml)

`node-ffmpeg` is a JavaScript wrapper around [`avcpp`](https://github.com/h4tr3d/avcpp) which is a C++ wrapper around the low-level C API of [`ffmpeg`](https://ffmpeg.org/).

# Overview

Unlike the myriad of other `npm` packages, this project does not launch the `ffmpeg` binary in a separate process - it loads it as a shared library and it uses its C/C++ API. It allows to do (mostly) everything that can be accomplished through the C API such as processing individual video frames and audio samples and interacting with multiple streams at the same time. The project relies on [`nobind17`](https://github.com/mmomtchev/nobind) for interfacing with the C/C++ API. It supports asynchronous operations that can run independently in different threads on multiple cores. Additionally, it takes advantage of the built-in multithreading of most included codecs.

Currently the project has a first beta release on `npm`.

## Low-level C++ API

`node-ffmpeg` exports directly most of the C++ interface of [`avcpp`](https://github.com/h4tr3d/avcpp) which is a C++ wrapper for the low-level C API of `ffmpeg`. You should be aware that `ffmpeg` has a notoriously poorly documented and difficult to use C API. `avcpp` is a layer on top of it, which renders is somewhat more intuitive, but you should still have a very good understanding of its API in order to take full advantage of it. Unless you have previous experience with the C API, it is recommended to use the higher-level streams API which is much safer and easier to use and adds a minimal overhead.

## Streams API

`node-ffmpeg` includes a Node.js `Readable`/`Writable`-compatible API that allows to work very naturally with video and audio data for everyone who has used Node.js streams. In this mode, a `Demuxer` is an object that provides a number of `Readables` that send compressed packet data. Each one of them can be fed into Node.js `Transform`s such as `AudioDecoder` or `VideoDecoder` to obtain a stream of uncompressed video frames or audio samples. These can be processed by other `Transform`s such as `Filter`, `VideoTransform` or `AudioTransform` that expect uncompressed data - or their underlying `Buffer`s can be accessed. New streams can be created by creating video frames from scratch. There are various examples that show how the raw pixel data can be imported and exported from and to `ImageMagick`. Finally, raw uncompressed video and audio frames can be sent to a `VideoEncoder` or `AudioEncoder` for compression and then to a `Muxer` for multiplexing and time-based interleaving.

## Memory safety

You should be aware that `ffmpeg` is a low-level C API and it is very unsafe to use. There are many cases in which a video frame will simply be identified by a raw C pointer - in this case trying to interpret 720p as 1080p will always end up with a segfault. `avcpp` adds a semi-safe layer on top of it, but mismatching stream parameters will still lead to a segfault. Producing a completely safe wrapper that never segfaults, no matter what the user does, is a gargantuan task that is currently not planned.

These bindings should never segfault if all the parameters are correctly checked and set up - but may easily segfault if these are mismatched - or if the asynchronous methods are reentered.

The current goal of `node-ffmpeg` is to simply be able to guarantee that a ***correct*** JavaScript code will never segfault on any input file.

The goal of the streams API is to make writing such correct code trivially simple and intuitive.

## Asynchronous locking

`node-ffmpeg@2.0` features asynchronous locking which means that all methods are safe to use from async contexts. This however has some caveats - if you mix synchronous and asynchronous calls on the same objects, synchronous calls risk to block the event loop if they have to access an object for which an asynchronous operation is running in the background. `node-ffmpeg` will print a warning to the console in this case.

When mixing synchronous and asynchronous low-level calls on the same objects with the Streams API, this can potentially lead to a deadlock - if an asynchronous operation that involves the Streams API is running in the background, then referencing synchronously an object that is locked can lead to a deadlock, since the blocked event loop will prevent the Streams API from running. Alas, this is difficult to avoid without losing the flow control which ensures that complex filters will use multiple CPU cores.

Look carefully at the console messages if you intend to mix synchronous and asynchronous calls on the same objects. Going fully asynchronous not only is *the Node.js way*, it will also completely solve this problem and it is the recommended way to use this API.

Note: A notable exception are the `BufferSinkFilterContext` and `BufferSrcFilterContext` `avcpp` classes. These are not completely reentrant on the `avcpp`/`ffmpeg` side, as they rely on shared internal buffers. Currently, it is not possible to read concurrently the audio and the video streams in multiple threads. The Streams API implementation has a reentrancy guard around these.

## Performance

All the underlying heavy-lifting is performed by the `ffmpeg` C code - which means that unless you access and process the raw video and audio data, the performance will be nearly identical to that of `ffmpeg` when used from the command-line. This includes rescaling and resampling via the provided tools and using built-in filters. Background processing is provided via the `libuv` thread pool of Node.js - which means that when processing a stream, it is possible to automatically run each stage of the pipeline - demuxing, video decoding, audio decoding, filtering, video encoding, audio encoding and muxing on a separate physical processor core independently of V8/JavaScript.

If you need to access the actual pixel data or audio samples, then, depending on the processing, performance may be an order of magnitude lower.

# Usage

## Install

`ffmpeg` comes with prebuilt binaries for Windows, Linux and macOS on x64 platforms.

```shell
npm i @mmomtchev/ffmpeg
```

You can rebuild it from source using `node-pre-gyp` which will be automatically called by `npm install`. This will pull and build `ffmpeg` using `conan` which will leave a very large directory `${HOME}/.conan` which can be safely deleted.

The package is a CommonJS package that should have identical interface across CJS, ES6 and TS environments:

```js
const ffmpeg = require('@mmomtchev/ffmpeg');
const { Demuxer } = require('@mmomtchev/ffmpeg/stream');
```

```ts
import ffmpeg from '@mmomtchev/ffmpeg';
import { Demuxer } from '@mmomtchev/ffmpeg/stream';
```

## Quickstart

A quick example for generalized video transcoding using the streams API.

```ts
import {
  Muxer,
  Demuxer,
  VideoDecoder, 
  VideoEncoder,
  Discarder,
  VideoTransform,
  VideoStreamDefinition
} from '@mmomtchev/ffmpeg/stream';

// Create a Demuxer - a Demuxer is an object that exports
// multiple Readable,
// it decodes the input container format and emits compressed data
const input = new Demuxer({ inputFile:'launch.mp4' });

// Wait for the Demuxer to read the file headers and to
// identify the various streams
input.on('ready', () => {
    // Once the input Demuxer is ready,
    // it will contain two arrays of Readable:
    // input.video[]
    // input.audio[]

    // We will be discarding the audio stream
    // (unless you discard these will keep piling in memory
    // until you destroy the demuxer object)
    const audioDiscard = new Discarder();
    // A VideoDecoder is a Transform that reads compressed video data
    // and sends raw video frames (this is the decoding codec)
    const videoInput = new VideoDecoder(input.video[0]);
    // A VideoDefinition is an object with all the properties of the stream
    const videoInputDefinition = videoInput.definition();

    // such as codec, bitrate, framerate, frame size, pixel format
    const videoOutputDefinition = {
      type: 'Video',
      codec: ffmpeg.AV_CODEC_H264,
      bitRate: 2.5e6,
      width: 320,
      height: 200,
      frameRate: new ffmpeg.Rational(25, 1),
      pixelFormat: new ffmpeg.PixelFormat(ffmpeg.AV_PIX_FMT_YUV422P)
    } as VideoStreamDefinition;

    // A video encoder is a Transform that reads raw video frames
    // and sends compressed video data (this is the encoding codec)
    const videoOutput = new VideoEncoder(videoOutputDefinition);

    // A VideoTransform is a Transform that reads raw video frames
    // and sends raw video frames - with different frame size or pixel format
    const videoRescaler = new VideoTransform({
      input: videoInputDefinition,
      output: videoOutputDefinition,
      interpolation: ffmpeg.SWS_BILINEAR
    });

    // A Muxer is an object that contains multiple Writable
    // It multiplexes those streams, handling interleaving by buffering,
    // and writes the to the output format
    const output = new Muxer({
      outputFile: 'video.mkv',
      outputFormat: 'mkv',
      streams: [videoOutput]
    });

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
    input.video[0].pipe(videoInput).pipe(videoRescaler)
        .pipe(videoOutput).pipe(output.video[0]);
    input.audio[0].pipe(audioDiscard);
});
```

## More examples

You should start by looking at the unit tests which are also meant to be used as examples:
  * [`transcode.test.ts`](https://github.com/mmomtchev/ffmpeg/blob/main/test/transcode.test.ts) contains simple examples for transcoding audio and video
  * [`extract.test.ts`](https://github.com/mmomtchev/ffmpeg/blob/main/test/extract.test.ts) contains a simple example for extracting a still from a video and importing it in ImageMagick
  * [`encode.test.ts`](https://github.com/mmomtchev/ffmpeg/blob/main/test/encode.test.ts) contains a simple example for producing a video from stills using ImageMagick
  * [`rescale.test.ts`](https://github.com/mmomtchev/ffmpeg/blob/main/test/rescale.test.ts) contains a simple example for rescaling/resampling a video using ffmpeg's built-in `libswscale`
  * [`resample.test.ts`](https://github.com/mmomtchev/ffmpeg/blob/main/test/resample.test.ts) contains a simple example for resampling audio using ffmpeg's built-in `libswresample`
  * [`streaming.test.ts`](https://github.com/mmomtchev/ffmpeg/blob/main/test/streaming.test.ts) contains examples for transcoding to various formats and sending the resulting data to a Node.js `WriteStream`
  * [`filtering.test.ts`](https://github.com/mmomtchev/ffmpeg/blob/main/test/filtering.test.ts) contains several examples for using ffmpeg's filters including overlaying text or Picture-in-Picture that are fast enough to be used in real-time

  ---

  * [`transcodeVideo.js`](https://github.com/mmomtchev/ffmpeg/blob/main/example/transcodeAudio.js) is a low-level C/C++ style example that transcodes the video stream obtained from a container file without using the streams API
  * [`transcodeAudio.js`](https://github.com/mmomtchev/ffmpeg/blob/main/example/transcodeAudio.js) is a low-level C/C++ style example that transcodes the audio stream obtained from a container file without using the streams API

  ---

  * [`data-is-beautiful/orbital-launches/`](https://github.com/mmomtchev/data-is-beautiful/tree/main/orbital-launches) is a real data visualization generated with `@mmomtchev/ffmpeg` and [`magickwand.js`](https://github.com/mmomtchev/magickwand.js/)
  * [`orbitron`](https://github.com/mmomtchev/orbitron.git) is a tool for making short animations of objects in the Solar System using the NASA/JPL Horizons API - it can produce `mp4` and `gif` videos using `@mmomtchev/ffmpeg`

## Supported pixel and audio formats

* [Pixel Formats](https://github.com/FFmpeg/FFmpeg/blob/master/libavutil/pixdesc.c) (*scroll down*)

* [Audio Sampling Formats](https://github.com/FFmpeg/FFmpeg/blob/master/libavutil/samplefmt.c)

* [Codecs](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/codec_id.h)

* Container Formats
  * [Full List](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/allformats.c)
  * [Each Invidiual Format](https://github.com/FFmpeg/FFmpeg/tree/master/libavformat)

# Security

Prebuilt binaries of `@mmomtchev/ffmpeg` are **NOT** affected by [CVE-2024-3094](https://nvd.nist.gov/vuln/detail/CVE-2024-3094) since these are linked with xz-utils 5.4.5, the last version before the backdoor.

# License

ISC License

Copyright (c) 2023, Momtchil Momtchev <momtchil@momtchev.com>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
