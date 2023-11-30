import * as path from 'node:path';

import { assert } from 'chai';

import ffmpeg from 'node-ffmpeg';
import { Demuxer, AudioDecoder, VideoDecoder } from '../lib/Stream';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

describe('Demuxer', () => {
  it('read', (done) => {
    let audioFrames = 0, videoFrames = 0;
    let audioClosed = false, videoClosed = false;
    const input = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    input.on('ready', () => {
      try {
        assert.lengthOf(input.streams, 2);
        assert.lengthOf(input.audio, 1);
        assert.lengthOf(input.video, 1);

        const audioStream = new AudioDecoder(input.audio[0]);
        const videoStream = new VideoDecoder(input.video[0]);

        audioStream.on('data', (data) => {
          assert.instanceOf(data, ffmpeg.AudioSamples);
          audioFrames++;
        });
        videoStream.on('data', (data) => {
          assert.instanceOf(data, ffmpeg.VideoFrame);
          videoFrames++;
        });

        input.audio[0].pipe(audioStream);
        input.video[0].pipe(videoStream);

        videoStream.on('close', () => {
          assert.isAtLeast(videoFrames, 100);
          videoClosed = true;
          if (audioClosed) done();
        });
        audioStream.on('close', () => {
          assert.isAtLeast(audioFrames, 100);
          audioClosed = true;
          if (videoClosed) done();
        });
        videoStream.on('error', (err) => {
          done(err);
        });
        audioStream.on('error', (err) => {
          done(err);
        });
      } catch (err) {
        done(err);
      }
    });
  })
});
