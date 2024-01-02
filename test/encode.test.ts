import * as path from 'node:path';
import * as fs from 'node:fs';
import { Magick } from 'magickwand.js';

import ffmpeg from '@mmomtchev/ffmpeg';
import { VideoEncoder, Muxer } from '@mmomtchev/ffmpeg/stream';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

const width = 320;
const height = 200;
const ballRadius = 20;

// Produce bouncing ball frames
function genFrame(state: { height: number; speed: number; }) {
  const image = new Magick.Image(`${width}x${height}`, 'black');
  image.magick('yuv');
  image.depth(8);
  image.samplingFactor('4:2:0');

  image.fillColor('blue');
  image.draw(new Magick.DrawableCircle(width / 2, state.height, width / 2 + ballRadius, state.height + ballRadius));

  // movement
  state.height -= state.speed;
  // gravity acceleration
  state.speed -= 1;
  if (state.height > height - ballRadius) {
    state.height = height - ballRadius;
    state.speed = -state.speed;
  }

  return image;
}

it('produce a video from stills', (done) => {
  const tmpFile = path.resolve(__dirname, 'bouncing.mp4');
  const format = new ffmpeg.PixelFormat('yuv420p');
  // If the timebase is 1/25th, each frame's duration is 1
  // (which is very practical but does not allow to add audio)
  const timeBase = new ffmpeg.Rational(1, 25);

  const videoOutput = new VideoEncoder({
    type: 'Video',
    codec: ffmpeg.AV_CODEC_H264,
    bitRate: 2.5e6,
    width,
    height,
    frameRate: new ffmpeg.Rational(25, 1),
    timeBase,
    pixelFormat: format
  });

  const output = new Muxer({ outputFile: tmpFile, streams: [videoOutput] });

  output.on('finish', () => {
    fs.rm(tmpFile, done);
  });

  const state = { height: 720 / 2, speed: 0 };
  let totalFrames = 250;
  let pts = 0;
  const write = function () {
    let frame;
    do {
      const image = genFrame(state);
      const blob = new Magick.Blob;
      image.write(blob);

      frame = ffmpeg.VideoFrame.create(Buffer.from(blob.data()), format, width, height);
      frame.setTimeBase(timeBase);
      frame.setPts(new ffmpeg.Timestamp(pts++, timeBase));

      // This is the Node.js Writable protocol
      // write until write returns false, then wait for 'drain'
    } while (videoOutput.write(frame, 'binary') && --totalFrames > 0);
    if (totalFrames > 0)
      videoOutput.once('drain', write);
    else
      videoOutput.end();
  };
  write();

  videoOutput.pipe(output.video[0]);
});
