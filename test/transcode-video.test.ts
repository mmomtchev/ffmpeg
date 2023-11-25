import * as path from 'node:path';

import { assert } from 'chai';

import ffmpeg from 'node-av';
import { Muxer } from '../lib/Muxer';
import { Demuxer } from '../lib/Demuxer';
import { VideoEncoder } from '../lib/VideoEncoder';
import { VideoDecoder } from '../lib/VideoDecoder';
import { AudioDecoder } from '../lib/AudioDecoder';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

it('Transcode video', (done) => {
  const input = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

  input.on('ready', () => {
    try {
      assert.lengthOf(input.streams, 2);
      assert.lengthOf(input.audio, 1);
      assert.lengthOf(input.video, 1);

      const audioInput = new AudioDecoder();
      const videoInput = new VideoDecoder();

      const videoOutput = new VideoEncoder({
        type: 'Video',
        codec: ffmpeg.AV_CODEC_H264,
        bitRate: 12e6,
        width: 1280,
        height: 720,
        frameRate: new ffmpeg.Rational(30, 1),
        pixelFormat: new ffmpeg.PixelFormat('yuv420p')
      });

      const output = new Muxer({ outputFile: 'test.mp4', streams: [videoOutput] });

      output.video[0].on('finish', () => {
        done();
      });

      input.audio[0].pipe(audioInput);
      input.video[0].pipe(videoInput).pipe(videoOutput).pipe(output.video[0]);
    } catch (err) {
      done(err);
    }
  });
});
