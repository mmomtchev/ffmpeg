import * as path from 'node:path';
import * as fs from 'node:fs';

import { assert } from 'chai';

import ffmpeg from '@mmomtchev/ffmpeg';
import { Muxer, Demuxer, VideoDecoder, VideoEncoder, AudioDecoder, AudioEncoder, AudioTransform } from '@mmomtchev/ffmpeg/stream';
import { Readable, Transform, TransformCallback } from 'node:stream';
import { MediaTransform } from '../lib/MediaStream';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

const tempFile = path.resolve(__dirname, 'streaming-temp.mkv');

describe('streaming', () => {
  afterEach('delete temporary', (done) => {
    if (!process.env.DEBUG_ALL && !process.env.DEBUG_MUXER)
      fs.rm(tempFile, done);
    else
      done();
  });

  it('transcoding to Matroska/H264', (done) => {
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

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

        const muxer = new Muxer({ outputFormat: 'matroska', streams: [videoOutput, audioOutput] });

        muxer.on('finish', done);
        muxer.on('error', done);

        assert.instanceOf(muxer.output, Readable);
        const output = fs.createWriteStream(tempFile);

        demuxer.video[0].pipe(videoInput).pipe(videoOutput).pipe(muxer.video[0]);
        demuxer.audio[0].pipe(audioInput).pipe(audioOutput).pipe(muxer.audio[0]);
        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });

  it('transcoding to mp4/H264', (done) => {
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

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

        const muxer = new Muxer({
          outputFormat: 'mp4',
          outputFormatOptions: {
            movflags: 'isml+frag_keyframe'
          },
          streams: [videoOutput, audioOutput]
        });

        muxer.on('finish', done);
        muxer.on('error', done);

        assert.instanceOf(muxer.output, Readable);
        const output = fs.createWriteStream(tempFile);

        demuxer.video[0].pipe(videoInput).pipe(videoOutput).pipe(muxer.video[0]);
        demuxer.audio[0].pipe(audioInput).pipe(audioOutput).pipe(muxer.audio[0]);
        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });

  it('transcoding to WebM', (done) => {
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

        const videoDefinition = videoInput.definition();
        const audioDefinition = audioInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          // Encoding to VP9 is very expensive
          codec: ffmpeg.AV_CODEC_VP8,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat
        });

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_VORBIS,
          bitRate: 128e3,
          sampleRate: audioDefinition.sampleRate,
          sampleFormat: audioDefinition.sampleFormat,
          channelLayout: audioDefinition.channelLayout
        });

        audioOutput.on('ready', () => {
          try {
            // Vorbis requires a specific audio frame size (64) that is not known
            // until the codec is opened
            // Hard-coding it in the above structure is also an option

            // An AudioTransform can also be used to automatically change the
            // frame size
            const audioTransform = new AudioTransform({
              output: audioOutput.definition(),
              input: audioInput.definition()
            });

            const muxer = new Muxer({ outputFormat: 'webm', streams: [videoOutput, audioOutput] });

            muxer.on('finish', done);
            muxer.on('error', done);

            assert.instanceOf(muxer.output, Readable);
            const output = fs.createWriteStream(tempFile);

            demuxer.video[0].pipe(videoInput).pipe(videoOutput).pipe(muxer.video[0]);
            demuxer.audio[0].pipe(audioInput).pipe(audioTransform).pipe(audioOutput).pipe(muxer.audio[0]);
            muxer.output!.pipe(output);
          } catch (err) {
            done(err);
          }
        });
      } catch (err) {
        done(err);
      }
    });
  });

  it('error handling on creation', (done) => {
    // MP4 does not support streaming in its default configuration
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

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

        const muxer = new Muxer({ outputFormat: 'mp4', streams: [videoOutput, audioOutput] });

        muxer.on('finish', () => done('Expected an error'));
        muxer.on('error', (e) => {
          try {
            assert.match(e.message, /Invalid argument/);
            done();
          } catch (e) {
            done(e);
          }
        });

        assert.instanceOf(muxer.output, Readable);
        const output = fs.createWriteStream(tempFile);

        demuxer.video[0].pipe(videoInput).pipe(videoOutput).pipe(muxer.video[0]);
        demuxer.audio[0].pipe(audioInput).pipe(audioOutput).pipe(muxer.audio[0]);
        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });

  it('error handling while streaming', (done) => {
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

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

        let frames = 0;
        const injectError = new MediaTransform({
          transform: function (this: Transform, chunk: any, encoding: any, callback: TransformCallback) {
            if (frames++ === 100)
              this.push('invalid');
            else
              this.push(chunk);
            callback();
          }
        });

        const muxer = new Muxer({ outputFormat: 'matroska', streams: [videoOutput, audioOutput] });

        muxer.on('finish', () => done('Expected an error'));
        videoOutput.on('error', (e) => {
          try {
            assert.match(e.message, /Input is not a raw video/);
            done();
          } catch (e) {
            done(e);
          }
        });

        assert.instanceOf(muxer.output, Readable);
        const output = fs.createWriteStream(tempFile);

        demuxer.video[0].pipe(videoInput).pipe(injectError).pipe(videoOutput).pipe(muxer.video[0]);
        demuxer.audio[0].pipe(audioInput).pipe(audioOutput).pipe(muxer.audio[0]);
        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });

});
