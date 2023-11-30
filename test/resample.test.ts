import * as path from 'node:path';
import * as fs from 'node:fs';

import { assert } from 'chai';

import ffmpeg from 'node-av';
import { Transform } from 'node:stream';
import { Muxer, Demuxer, AudioDecoder, AudioEncoder, Discarder } from '../lib/Stream';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

const tempFile = path.resolve(__dirname, 'resampled.mp4');

describe('transcode', () => {
  afterEach('delete temporary', (done) => {
    if (!process.env.DEBUG_ALL && !process.env.DEBUG_MUXER)
      fs.rm(tempFile, done);
    else
      done();
  });

  it('generalized audio transcoding with with resampling', (done) => {
    const input = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    input.on('ready', () => {
      try {
        assert.lengthOf(input.streams, 2);
        assert.lengthOf(input.audio, 1);
        assert.lengthOf(input.video, 1);

        const videoDiscard = new Discarder();
        const audioInput = new AudioDecoder(input.audio[0]);
        const audioDefintion = audioInput.definition();

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_AAC,
          bitRate: 128e3,
          sampleFormat: new ffmpeg.SampleFormat(ffmpeg.AV_SAMPLE_FMT_FLTP),
          sampleRate: 44100,
          channelLayout: new ffmpeg.ChannelLayout(ffmpeg.AV_CH_LAYOUT_STEREO)
        });

        const audioResampler = new ffmpeg.AudioResampler(
          ffmpeg.AV_CH_LAYOUT_STEREO, 44100, new ffmpeg.SampleFormat(ffmpeg.AV_SAMPLE_FMT_FLTP),
          audioDefintion.channelLayout.layout(), audioDefintion.sampleRate, audioDefintion.sampleFormat
        );

        // A standard Transform stream that resamples the audio
        const resample = new Transform({
          objectMode: true,
          transform(chunk, encoding, callback) {
            try {
              audioResampler.push(chunk);
              let samples;
              // At each tick we are sending 1024 samples and we are getting 941 samples
              // audioResampler has an internal buffer that does the necessary queuing automatically
              while (!(samples = audioResampler.pop(1024)).isNull()) {
                this.push(samples);
              }
              callback();
            } catch (err) {
              callback(err as Error);
            }
          },
          flush(callback) {
            let samples;
            try {
              while (!(samples = audioResampler.pop(1024)).isNull()) {
                this.push(samples);
              }
              samples = audioResampler.pop(0);
              if (!samples.isNull) this.push(samples);
              callback();
            } catch (err) {
              callback(err as Error);
            }
          },
        });

        const output = new Muxer({ outputFile: tempFile, streams: [audioOutput] });

        output.audio[0].on('finish', () => {
          done();
        });

        input.video[0].on('error', done);
        input.audio[0].on('error', done);
        output.audio[0].on('error', done);

        input.video[0].pipe(videoDiscard);
        input.audio[0].pipe(audioInput).pipe(resample).pipe(audioOutput).pipe(output.audio[0]);
      } catch (err) {
        done(err);
      }
    });
  });
});
