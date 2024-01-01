# `@mmomtchev/ffmpeg` Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## []
 - Add `streams/Filter` to support ffmpeg filters
 - Support piping from a `ReadStream` to a `Demuxer`
 - Support piping from a `Muxer` to a `WriteStream`
 - Send `error` events on `Demuxer` and `Muxer`
 - Support `worker_threads`
 - Fix [#1](https://github.com/mmomtchev/ffmpeg/issues/1), crash when loading the module in a debug build of Node.js

## [0.9.0] 2023-12-08
 - First release
