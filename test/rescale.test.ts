import * as path from 'node:path';
import * as fs from 'node:fs';

import { assert } from 'chai';

import ffmpeg from 'node-ffmpeg';
import { Muxer, Demuxer, VideoDecoder, VideoEncoder, Discarder, VideoTransform, VideoStreamDefinition } from 'node-ffmpeg/Stream';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

const tempFile = path.resolve(__dirname, 'rescaled.mp4');

describe('transcode', () => {
  afterEach('delete temporary', (done) => {
    if (!process.env.DEBUG_ALL && !process.env.DEBUG_MUXER)
      fs.rm(tempFile, done);
    else
      done();
  });

  it('generalized video transcoding with changing the pixel format and resolution', (done) => {
    const input = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    input.on('ready', () => {
      try {
        assert.lengthOf(input.streams, 2);
        assert.lengthOf(input.audio, 1);
        assert.lengthOf(input.video, 1);

        const audioDiscard = new Discarder();
        const videoInput = new VideoDecoder(input.video[0]);
        const videoInputDefinition = videoInput.definition();

        const videoOutputDefinition = {
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: 320,
          height: 200,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: new ffmpeg.PixelFormat(ffmpeg.AV_PIX_FMT_YUV422P)
        } as VideoStreamDefinition;
        const videoOutput = new VideoEncoder(videoOutputDefinition);

        // A standard Transform stream that rescales/resamples the video
        const videoRescaler = new VideoTransform({
          input: videoInputDefinition,
          output: videoOutputDefinition,
          interpolation: ffmpeg.SWS_BILINEAR
        });

        const output = new Muxer({ outputFile: tempFile, streams: [videoOutput] });

        output.video[0].on('finish', done);

        input.video[0].on('error', done);
        input.audio[0].on('error', done);
        output.video[0].on('error', done);

        input.video[0].pipe(videoInput).pipe(videoRescaler).pipe(videoOutput).pipe(output.video[0]);
        input.audio[0].pipe(audioDiscard);
      } catch (err) {
        done(err);
      }
    });
  });
});
