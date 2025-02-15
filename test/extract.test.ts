import * as path from 'node:path';
import * as fs from 'node:fs';
import { Magick } from 'magickwand.js/native';

import { assert } from 'chai';

import ffmpeg from '@mmomtchev/ffmpeg';
import { Demuxer, VideoDecoder, Discarder } from '@mmomtchev/ffmpeg/stream';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);


it('extract a still', (done) => {
  const tmpFile = path.resolve(__dirname, 'output.jpeg');
  const input = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

  input.on('ready', () => {
    try {
      assert.lengthOf(input.video, 1);

      const discarder = new Discarder();
      const videoInput = new VideoDecoder(input.video[0]);

      const extract = (frame: ffmpeg.VideoFrame) => {
        if (frame.pts().seconds() > 0.5) {
          videoInput.off('data', extract);

          // Import in ImageMagick
          const blob = new Magick.Blob(frame.data().buffer);
          const image = new Magick.Image;

          assert.strictEqual(frame.data().length, frame.width() * frame.height() * frame.pixelFormat().bitsPerPixel() / 8);
          image.size(`${frame.width()}x${frame.height()}`);

          assert.strictEqual(frame.pixelFormat().toString(), 'yuv420p');
          image.magick('yuv');
          image.depth(8);
          image.samplingFactor('4:2:0');

          image.read(blob);
          assert.strictEqual(image.size().toString(), `${frame.width()}x${frame.height()}`);

          image.magick('jpeg');
          image.write(tmpFile);

          const readImage = new Magick.Image(tmpFile);
          assert.strictEqual(readImage.magick(), 'JPEG');

          fs.rmSync(tmpFile);
          done();
        }
      };
      videoInput.on('data', extract);

      input.video[0].pipe(videoInput);
      input.audio[0].pipe(discarder);
    } catch (err) {
      done(err);
    }
  });
});
