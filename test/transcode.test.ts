import * as path from 'node:path';
import * as fs from 'node:fs';

import { assert } from 'chai';

import ffmpeg from '@mmomtchev/ffmpeg';
import { Muxer, Demuxer, VideoDecoder, VideoEncoder, AudioDecoder, AudioEncoder, Discarder } from '@mmomtchev/ffmpeg/stream';

const tempFile = path.resolve(__dirname, 'temp.mp4');

describe('transcode', () => {
  afterEach('delete temporary', (done) => {
    if (!process.env.DEBUG_ALL && !process.env.DEBUG_MUXER)
      fs.rm(tempFile, done);
    else
      done();
  });
  it('audio / video multiplexing', (done) => {
    const input = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    input.on('ready', () => {
      try {
        assert.lengthOf(input.streams, 2);
        assert.lengthOf(input.audio, 1);
        assert.lengthOf(input.video, 1);

        const audioInput = new AudioDecoder(input.audio[0]);
        const videoInput = new VideoDecoder(input.video[0]);

        const videoDefinition = videoInput.definition();
        const audioDefinition = audioInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat
        });

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_AAC,
          bitRate: 128e3,
          sampleRate: audioDefinition.sampleRate,
          sampleFormat: audioDefinition.sampleFormat,
          channelLayout: audioDefinition.channelLayout
        });

        const output = new Muxer({ outputFile: tempFile, streams: [videoOutput, audioOutput] });

        output.on('finish', done);
        input.on('error', done);
        output.on('error', done);

        input.video[0].pipe(videoInput).pipe(videoOutput).pipe(output.video[0]);
        input.audio[0].pipe(audioInput).pipe(audioOutput).pipe(output.audio[0]);
      } catch (err) {
        done(err);
      }
    });
  });

  it('only video', (done) => {
    const input = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    input.on('ready', () => {
      try {
        assert.lengthOf(input.streams, 2);
        assert.lengthOf(input.audio, 1);
        assert.lengthOf(input.video, 1);

        const audioDiscard = new Discarder();
        const videoInput = new VideoDecoder(input.video[0]);

        const videoDefinition = videoInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat
        });

        const output = new Muxer({ outputFile: tempFile, streams: [videoOutput] });

        output.on('finish', done);
        input.on('error', done);
        output.on('error', done);

        input.video[0].pipe(videoInput).pipe(videoOutput).pipe(output.video[0]);
        input.audio[0].pipe(audioDiscard);
      } catch (err) {
        done(err);
      }
    });
  });

  it('only audio', (done) => {
    const input = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    input.on('ready', () => {
      try {
        assert.lengthOf(input.streams, 2);
        assert.lengthOf(input.audio, 1);
        assert.lengthOf(input.video, 1);

        const audioInput = new AudioDecoder(input.audio[0]);
        const videoDiscard = new Discarder();

        const audioDefinition = audioInput.definition();

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_AAC,
          bitRate: 128e3,
          sampleRate: audioDefinition.sampleRate,
          sampleFormat: audioDefinition.sampleFormat,
          channelLayout: audioDefinition.channelLayout
        });

        const output = new Muxer({ outputFile: tempFile, streams: [audioOutput] });

        output.on('finish', done);
        input.on('error', done);
        output.on('error', done);

        input.audio[0].pipe(audioInput).pipe(audioOutput).pipe(output.audio[0]);
        input.video[0].pipe(videoDiscard);
      } catch (err) {
        done(err);
      }
    });
  });

  it('convert format without transcoding', (done) => {
    // This requires that the output format supports the input codec
    // and the output is seekable (ie a file)
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const muxer = new Muxer({ outputFile: tempFile, streams: [demuxer.audio[0], demuxer.video[0]] });

        muxer.on('finish', done);
        muxer.on('error', done);

        demuxer.video[0].pipe(muxer.video[0]);
        demuxer.audio[0].pipe(muxer.audio[0]);
      } catch (err) {
        done(err);
      }
    });
  });
});
