import * as path from 'node:path';

import { assert } from 'chai';

import { Demuxer } from '../lib/Demuxer';
import { StreamTypes } from '../lib/Stream';
import ffmpeg from 'node-av';
import { AudioDecoder } from '../lib/AudioDecoder';
import { VideoDecoder } from '../lib/VideoDecoder';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

describe('Demuxer', () => {
  it('read', (done) => {
    let audioFrames = 0, videoFrames = 0;
    let audioClosed = false, videoClosed = false;
    const input = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    input.prime()
      .then(() => {
        assert.lengthOf(input.streams, 2);
        assert.lengthOf(input.audio, 1);
        assert.lengthOf(input.video, 1);

        const audioStream = new AudioDecoder();
        const videoStream = new VideoDecoder();

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
          console.log(`Received ${videoFrames} video frames`);
          videoClosed = true;
          if (audioClosed) done();
        });
        audioStream.on('close', () => {
          assert.isAtLeast(audioFrames, 100);
          console.log(`Received ${audioFrames} audio frames`);
          audioClosed = true;
          if (videoClosed) done();
        });
        videoStream.on('error', (err) => {
          done(err);
        });
        audioStream.on('error', (err) => {
          done(err);
        });
      })
      .catch(done);
  });
});
