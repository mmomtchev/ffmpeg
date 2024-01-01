import * as path from 'node:path';
import * as fs from 'node:fs';
import ReadableStreamClone from 'readable-stream-clone';

import { assert } from 'chai';

import ffmpeg from '@mmomtchev/ffmpeg';
import { Muxer, Demuxer, VideoDecoder, VideoEncoder, AudioDecoder, AudioEncoder, Filter, Discarder } from '@mmomtchev/ffmpeg/stream';
import { Readable, Writable } from 'node:stream';
import { MediaTransform, VideoStreamDefinition } from '../lib/MediaStream';
import { Magick, MagickCore } from 'magickwand.js';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

const tempFile = path.resolve(__dirname, 'filter-temp.mkv');

describe('filtering', () => {
  afterEach('delete temporary', (done) => {
    console.log('DONE, DELETE');
    if (!process.env.DEBUG_ALL && !process.env.DEBUG_MUXER)
      fs.rm(tempFile, done);
    else
      done();
  });

  it('w/ overlay (ffmpeg filter overlay version)', (done) => {
    // This uses ffmpeg's filter subsystem to overlay text drawn by ImageMagick
    // It reads from a file, overlays and transcodes to a realtime stream.
    // This pipeline is fast enough to be usable in real-time even on an older CPU.
    //
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    // Use ImageMagick to create an image with the text
    const textImage = new Magick.Image('500x20', 'transparent');
    textImage.draw([
      new Magick.DrawableFont('sans-serif', MagickCore.NormalStyle, 100, MagickCore.NormalStretch),
      new Magick.DrawablePointSize(24),
      new Magick.DrawableStrokeColor('black'),
      new Magick.DrawableText(20, 18, 'The insurance is mandatory, the copyright is not')
    ]);
    // Convert the image to a single ffmpeg video frame
    // We can't use YUV420 because it does not support transparency, RGBA8888 does
    textImage.magick('rgba');
    textImage.depth(8);
    const textBlob = new Magick.Blob;
    textImage.write(textBlob);
    const textImagePixelFormat = new ffmpeg.PixelFormat(ffmpeg.AV_PIX_FMT_RGBA);
    const textFrame = new ffmpeg.VideoFrame.create(Buffer.from(textBlob.data()), textImagePixelFormat, 500, 20);

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {

        const audioInput = new Discarder;
        const videoInput = new VideoDecoder(demuxer.video[0]);

        const videoDefinition = videoInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat,
          // We will try to go as fast as possible
          // H.264 encoding in ffmpeg can be very fast
          codecOptions: { preset: 'veryfast' }
        });

        // A Filter is an ffmpeg filter chain
        const filter = new Filter({
          inputs: {
            // Filter with two inputs
            'video_in': videoDefinition,
            'text_in': {
              type: 'Video',
              width: 500,
              height: 20,
              pixelFormat: textImagePixelFormat,
              timeBase: videoDefinition.timeBase
            } as VideoStreamDefinition
          },
          outputs: {
            // One output
            'out': videoOutput.definition()
          },
          graph:
            // Overlay 'text_in' over 'video_in' at the specified offset to obtain 'out'
            `[video_in][text_in] overlay=x=20:y=${videoDefinition.height - 40} [out];  `,
          // A filter must have a single time base
          timeBase: videoDefinition.timeBase
        });
        // These should be available based on the above configuration
        assert.instanceOf(filter.src['video_in'], Writable);
        assert.instanceOf(filter.src['text_in'], Writable);
        assert.instanceOf(filter.sink['out'], Readable);

        const muxer = new Muxer({ outputFormat: 'matroska', streams: [videoOutput] });
        assert.instanceOf(muxer.output, Readable);

        muxer.on('finish', done);
        muxer.on('error', done);

        const output = fs.createWriteStream(tempFile);

        // Demuxer -> Decoder -> Filter source 'video_in'
        demuxer.video[0].pipe(videoInput).pipe(filter.src['video_in']);

        // Simply send the single frame to the other source, no need for a stream
        // (if you want to change subtitles, you will have to push frames with a time base and a pts)
        filter.src['text_in'].write(textFrame);
        filter.src['text_in'].end();

        // Filter sink 'out' -> Encoder -> Muxer
        filter.sink['out'].pipe(videoOutput).pipe(muxer.video[0]);

        demuxer.audio[0].pipe(audioInput);
        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });

  it('w/ video overlay (ffmpeg PiP filter)', (done) => {
    // This uses ffmpeg's filter subsystem to overlay a copy of the video
    // in a small thumbnail (Picture-in-Picture).
    // It also processes the audio.
    // It reads from a file, overlays and transcodes to a realtime stream.
    // This pipeline is fast enough to be usable in real-time even on an older CPU.
    //
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

        const audioDefinition = audioInput.definition();
        const videoDefinition = videoInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat,
          // We will try to go as fast as possible
          // H.264 encoding in ffmpeg can be very fast
          codecOptions: { preset: 'veryfast' }
        });

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_AAC,
          bitRate: 128e3,
          sampleRate: audioDefinition.sampleRate,
          sampleFormat: audioDefinition.sampleFormat,
          channelLayout: audioDefinition.channelLayout
        });

        // A Filter is an ffmpeg filter chain
        const filter = new Filter({
          inputs: {
            // Filter with two identical video inputs (the same video)
            'main_in': videoDefinition,
            'pip_in': videoDefinition,
            // and one audio input
            'audio_in': audioDefinition
          },
          outputs: {
            // Outputs
            'video_out': videoOutput.definition(),
            'audio_out': audioOutput.definition()
          },
          graph:
            // Take 'pip_in' and rescale it to 1/8th to obtain 'pip_out'
            `[pip_in] scale=${videoDefinition.width / 8}x${videoDefinition.height / 8} [pip_out];  ` +
            // Overlay 'pip_out' over 'main_in' at the specified offset to obtain 'out'
            `[main_in][pip_out] overlay=x=${videoDefinition.width * 13 / 16}:y=${videoDefinition.height / 16} [video_out];  ` +
            // Simply copy the audio through the filter
            '[audio_in] acopy [audio_out];  ',
          // A filter must have a single time base
          timeBase: videoDefinition.timeBase
        });
        // These should be available based on the above configuration
        assert.instanceOf(filter.src['main_in'], Writable);
        assert.instanceOf(filter.src['pip_in'], Writable);
        assert.instanceOf(filter.sink['video_out'], Readable);
        assert.instanceOf(filter.sink['audio_out'], Readable);

        const muxer = new Muxer({ outputFormat: 'matroska', streams: [videoOutput, audioOutput] });
        assert.instanceOf(muxer.output, Readable);

        muxer.on('finish', done);
        muxer.on('error', done);

        const output = fs.createWriteStream(tempFile);

        // Create a T junction to copy the raw decoded video
        const videoInput1 = new ReadableStreamClone(videoInput, { objectMode: true });
        const videoInput2 = new ReadableStreamClone(videoInput, { objectMode: true });

        // Demuxer -> Decoder -> T junction
        demuxer.video[0].pipe(videoInput);

        // Demuxer -> Decoder -> Filter source 'audio_in'
        demuxer.audio[0].pipe(audioInput).pipe(filter.src['audio_in']);

        // T junction -> Filter source 'main_in'
        videoInput1.pipe(filter.src['main_in']);

        // T junction -> Filter source 'pip_in'
        videoInput2.pipe(filter.src['pip_in']);

        // Filter sinks -> Encoder -> Muxer
        filter.sink['video_out'].pipe(videoOutput).pipe(muxer.video[0]);
        filter.sink['audio_out'].pipe(audioOutput).pipe(muxer.audio[0]);

        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });

  describe('error handling', () => {
    it('error when constructing the filter', (done) => {
      const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });
      const output = fs.createWriteStream(tempFile);

      demuxer.on('error', done);
      demuxer.on('ready', () => {
        try {

          const audioInput = new AudioDecoder(demuxer.audio[0]);
          const videoInput = new VideoDecoder(demuxer.video[0]);

          const audioDefinition = audioInput.definition();
          const videoDefinition = videoInput.definition();

          const videoOutput = new VideoEncoder({
            type: 'Video',
            codec: ffmpeg.AV_CODEC_H264,
            bitRate: 2.5e6,
            width: videoDefinition.width,
            height: videoDefinition.height,
            frameRate: new ffmpeg.Rational(25, 1),
            pixelFormat: videoDefinition.pixelFormat,
            codecOptions: { preset: 'veryfast' }
          });

          const audioOutput = new AudioEncoder({
            type: 'Audio',
            codec: ffmpeg.AV_CODEC_AAC,
            bitRate: 128e3,
            sampleRate: audioDefinition.sampleRate,
            sampleFormat: audioDefinition.sampleFormat,
            channelLayout: audioDefinition.channelLayout
          });

          const filter = new Filter({
            inputs: {
              'video_in': videoDefinition,
              'audio_in': audioDefinition
            },
            outputs: {
              'video_out': videoOutput.definition(),
              'audio_out': audioOutput.definition()
            },
            graph:
              '[audio_in] acopy [video_out];  ',
            timeBase: videoDefinition.timeBase
          });

          const muxer = new Muxer({ outputFormat: 'matroska', streams: [videoOutput, audioOutput] });
          assert.instanceOf(muxer.output, Readable);

          muxer.on('finish', () => done(new Error('Expected an error')));
          muxer.on('error', done);

          demuxer.video[0].pipe(videoInput).pipe(filter.src['video_in']);
          demuxer.audio[0].pipe(audioInput).pipe(filter.src['audio_in']);
          filter.sink['video_out'].pipe(videoOutput).pipe(muxer.video[0]);
          filter.sink['audio_out'].pipe(audioOutput).pipe(muxer.audio[0]);

          muxer.output!.pipe(output);
        } catch (err) {
          output.close();
          // ffmpeg is not known for its explicative error messages
          // The real information is usually found in stderr
          assert.match((err as Error).message, /Invalid argument/);
          done();
        }
      });
    });

    it('filter error while streaming', (done) => {
      const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });
      const output = fs.createWriteStream(tempFile);

      demuxer.on('error', done);
      demuxer.on('ready', () => {
        try {

          const audioInput = new AudioDecoder(demuxer.audio[0]);
          const videoInput = new VideoDecoder(demuxer.video[0]);

          const audioDefinition = audioInput.definition();
          const videoDefinition = videoInput.definition();

          const videoOutput = new VideoEncoder({
            type: 'Video',
            codec: ffmpeg.AV_CODEC_H264,
            bitRate: 2.5e6,
            width: videoDefinition.width,
            height: videoDefinition.height,
            frameRate: new ffmpeg.Rational(25, 1),
            pixelFormat: videoDefinition.pixelFormat,
            codecOptions: { preset: 'veryfast' }
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
            transform(chunk, encoding, callback) {
              if (frames++ === 100) this.push('invalid');
              else this.push(chunk);
              callback();
            }
          });

          const filter = new Filter({
            inputs: {
              'video_in': videoDefinition,
              'audio_in': audioDefinition
            },
            outputs: {
              'video_out': videoOutput.definition(),
              'audio_out': audioOutput.definition()
            },
            graph:
              '[video_in] copy [video_out];  ' +
              '[audio_in] acopy [audio_out];  ',
            timeBase: videoDefinition.timeBase
          });

          const muxer = new Muxer({ outputFormat: 'matroska', streams: [videoOutput, audioOutput] });
          assert.instanceOf(muxer.output, Readable);

          muxer.on('finish', () => done(new Error('Expected an error')));
          filter.on('error', (error) => {
            try {
              assert.match((error as Error).message, /Filter source video input must be a stream of VideoFrames/);
              // Simple .pipe() does not close the attached Writable streams (.pipeline() does it)
              // and a Muxer that is not closed/destroyed never exits
              // (this is a caveat of Node.js streams and it is expected)
              muxer.video[0].destroy(error);
              output.close();
              done();
            } catch (err) {
              done(err);
            }
          });

          demuxer.video[0].pipe(videoInput).pipe(injectError).pipe(filter.src['video_in']);
          demuxer.audio[0].pipe(audioInput).pipe(filter.src['audio_in']);
          filter.sink['video_out'].pipe(videoOutput).pipe(muxer.video[0]);
          filter.sink['audio_out'].pipe(audioOutput).pipe(muxer.audio[0]);

          muxer.output!.pipe(output);
        } catch (err) {
          done(err);
        }
      });
    });
  });
});
