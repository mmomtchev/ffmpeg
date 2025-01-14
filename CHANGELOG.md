# `@mmomtchev/ffmpeg` Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### [1.0.1] 2025-01-13
 - Update ffmpeg to 6.1.1
 - Update avcpp to 2.4.1
 - Apple ARM prebuilt binaries
 - Support rebuilding on Ubuntu 24.04
 - Fix rebuilding when installing from npm

# [1.0.0] 2024-01-26
 - Add `streams/Filter` to support ffmpeg filters
 - Support the built-in networking capabilities of ffmpeg
 - Support piping from a `ReadStream` to a `Demuxer`
 - Support piping from a `Muxer` to a `WriteStream`
 - Send `error` events on `Demuxer` and `Muxer`
 - Support `worker_threads`
 - Publish the package as a traditional CommonJS package to ensure best support across different environments
 - Fix [#1](https://github.com/mmomtchev/ffmpeg/issues/1), crash when loading the module in a debug build of Node.js
 - Fix [#26](https://github.com/mmomtchev/ffmpeg/issues/26), missing constants
 - Fix [#28](https://github.com/mmomtchev/ffmpeg/issues/28), flow control issues in `Filter`

## [0.9.0] 2023-12-08
 - First release
