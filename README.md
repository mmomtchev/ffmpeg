# ffmpeg (w/avcpp) bindings for Node.js

`node-ffmpeg` is a JavaScript wrapper around [`avcpp`](https://github.com/h4tr3d/avcpp) which is a C++ wrapper around the low-level C API of [`ffmpeg`](https://ffmpeg.org/).

# Current status

The project is still unpublished, but basic video and audio demultiplexing, transcoding and multiplexing are functional.

`ffmpeg` is a low-level C API which is very unsafe to use - try to interpret 720p as 1080p and you will end up a segfault. `avcpp` adds a semi-safe layer on top of it, but mismatching stream parameters will still lead to a segfault. `node-ffmpeg` should never segfault if all the parameters are correctly checked and set up - but may easily segfault if these are mismatched - or if the asynchronous methods are reentered.

Producing a completely safe wrapper that never segfaults no matter what the user does is a gargantuan task that is currently not planned.

The current goal is to simply be able to guarantee that a ***correct*** JavaScript code will never segfault on any input file.

## Performance

All the underlying heavy-lifting is performed by the `ffmpeg` C code - which means that unless you access and process the raw video and audio data, the performance will be nearly identical to that of `ffmpeg` when used from the command-line. This includes rescaling and resampling via the provided tools. Background processing is provided via the `libuv` thread pool of Node.js - which means that, at least in theory - you can be decoding and encoding on two different cores while V8/JavaScript runs on a third core. In practice, you need huge buffers for this to actually be the case.

If you need to access the actual video data, then, depending on the applied processing, performance may be an order of magnitude lower.

# Usage

## Streams API

The easiest way to use `node-ffmpeg` is the high-level streams API.

You should start by looking at the unit tests:
  * [`transcode.test.ts`](https://github.com/mmomtchev/node-ffmpeg/blob/main/test/transcode.test.ts) contains simple examples for transcoding audio and video
  * [`extract.test.ts`](https://github.com/mmomtchev/node-ffmpeg/blob/main/test/extract.test.ts) contains a simple example for extracting a still from a video and importing it in ImageMagick
  * [`encode.test.ts`](https://github.com/mmomtchev/node-ffmpeg/blob/main/test/encode.test.ts) contains a simple example for producing a video from stills using ImageMagick
