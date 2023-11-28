import * as path from 'node:path';
import * as fs from 'node:fs';

import { assert } from 'chai';

import ffmpeg from 'node-av';
import { Muxer } from '../lib/Muxer';
import { Demuxer } from '../lib/Demuxer';
import { VideoEncoder } from '../lib/VideoEncoder';
import { VideoDecoder } from '../lib/VideoDecoder';
import { AudioDecoder } from '../lib/AudioDecoder';
import { AudioEncoder } from '../lib/AudioEncoder';
import { rmSync } from 'node:fs';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

const tempFile = path.resolve(__dirname, 'data', 'temp.mp4');

describe('Transcode with multiplexing', () => {
  afterEach('delete temporary', (done) => {
    fs.rm(tempFile, done);
  });
  it('Transcode video / audio', (done) => {
    const input = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    input.on('ready', () => {
      try {
        assert.lengthOf(input.streams, 2);
        assert.lengthOf(input.audio, 1);
        assert.lengthOf(input.video, 1);

        const audioInput = new AudioDecoder(input.audio[0]);
        const videoInput = new VideoDecoder(input.video[0]);

        const videoDefintion = videoInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: videoDefintion.width,
          height: videoDefintion.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: new ffmpeg.PixelFormat('yuv420p')
        });

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_AAC,
          bitRate: 128e3,
          sampleRate: 48000,
          sampleFormat: new ffmpeg.SampleFormat('fltp'),
          channelLayout: new ffmpeg.ChannelLayout(2)
        });

        const output = new Muxer({ outputFile: tempFile, streams: [videoOutput, audioOutput] });

        let audioDone = false, videoDone = false;
        output.video[0].on('finish', () => {
          console.log('video done');
          videoDone = true;
          if (audioDone) done();
        });
        output.audio[0].on('finish', () => {
          console.log('audio done');
          audioDone = true;
          if (videoDone) done();
        });

        input.video[0].on('error', done);
        input.audio[0].on('error', done);
        output.video[0].on('error', done);
        output.audio[0].on('error', done);

        input.video[0].pipe(videoInput).pipe(videoOutput).pipe(output.video[0]);
        input.audio[0].pipe(audioInput).pipe(audioOutput).pipe(output.audio[0]);
      } catch (err) {
        done(err);
      }
    });
  });
});
