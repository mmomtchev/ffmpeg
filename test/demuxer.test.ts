import * as path from 'node:path';

import { assert } from 'chai';

import { Demuxer } from '../lib/Demuxer';
import { StreamTypes } from '../lib/Stream';
import ffmpeg from 'node-av';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

describe('Demuxer', () => {
  it('read', (done) => {
    const input = new Demuxer({inputFile: path.resolve(__dirname, 'data', 'launch.mp4')});
    let audio = 0, video = 0;
    input.on('data', (data) => {
      if (data.type === StreamTypes.Audio) audio++;
      if (data.type === StreamTypes.Video) video++;
    });
    input.on('close', () => {
      assert.isAtLeast(audio, 500);
      assert.isAtLeast(video, 500);
      console.log(`Received ${video} video frames and ${audio} audio frames`);
      done();
    });
    input.on('error', (err) => {
      done(err);
    })
  });
});
