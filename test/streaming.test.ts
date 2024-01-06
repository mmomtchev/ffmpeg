import * as path from 'node:path';
import * as fs from 'node:fs';

import { assert } from 'chai';

import ffmpeg from '@mmomtchev/ffmpeg';
import { Muxer, Demuxer, VideoDecoder, VideoEncoder, AudioDecoder, AudioEncoder, AudioTransform, VideoTransform, MediaTransform, VideoStreamDefinition } from '@mmomtchev/ffmpeg/stream';
import { Readable, Transform, TransformCallback } from 'node:stream';
import { Magick, MagickCore } from 'magickwand.js';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

const tempFile = path.resolve(__dirname, 'streaming-temp.mkv');

describe('streaming', () => {
  afterEach('delete temporary', (done) => {
    if (!process.env.DEBUG_ALL && !process.env.DEBUG_MUXER)
      fs.rm(tempFile, done);
    else
      done();
  });

  it('transcoding to Matroska/H264', (done) => {
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

        const videoDefinition = videoInput.definition();
        const audioDefinition = audioInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat
        });

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_AAC,
          bitRate: 128e3,
          sampleRate: audioDefinition.sampleRate,
          sampleFormat: audioDefinition.sampleFormat,
          channelLayout: audioDefinition.channelLayout
        });

        const muxer = new Muxer({ outputFormat: 'matroska', streams: [videoOutput, audioOutput] });

        muxer.on('finish', done);
        muxer.on('error', done);

        assert.instanceOf(muxer.output, Readable);
        const output = fs.createWriteStream(tempFile);

        demuxer.video[0].pipe(videoInput).pipe(videoOutput).pipe(muxer.video[0]);
        demuxer.audio[0].pipe(audioInput).pipe(audioOutput).pipe(muxer.audio[0]);
        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });

  it('transcoding to mp4/H264', (done) => {
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

        const videoDefinition = videoInput.definition();
        const audioDefinition = audioInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat
        });

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_AAC,
          bitRate: 128e3,
          sampleRate: audioDefinition.sampleRate,
          sampleFormat: audioDefinition.sampleFormat,
          channelLayout: audioDefinition.channelLayout
        });

        const muxer = new Muxer({
          outputFormat: 'mp4',
          outputFormatOptions: {
            movflags: 'isml+frag_keyframe'
          },
          streams: [videoOutput, audioOutput]
        });

        muxer.on('finish', done);
        muxer.on('error', done);

        assert.instanceOf(muxer.output, Readable);
        const output = fs.createWriteStream(tempFile);

        demuxer.video[0].pipe(videoInput).pipe(videoOutput).pipe(muxer.video[0]);
        demuxer.audio[0].pipe(audioInput).pipe(audioOutput).pipe(muxer.audio[0]);
        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });

  it('transcoding to WebM', (done) => {
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

        const videoDefinition = videoInput.definition();
        const audioDefinition = audioInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          // Encoding to VP9 is very expensive
          codec: ffmpeg.AV_CODEC_VP8,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat
        });

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_VORBIS,
          bitRate: 128e3,
          sampleRate: audioDefinition.sampleRate,
          sampleFormat: audioDefinition.sampleFormat,
          channelLayout: audioDefinition.channelLayout
        });

        audioOutput.on('ready', () => {
          try {
            // Vorbis requires a specific audio frame size (64) that is not known
            // until the codec is opened
            // Hard-coding it in the above structure is also an option

            // An AudioTransform can also be used to automatically change the
            // frame size
            const audioTransform = new AudioTransform({
              output: audioOutput.definition(),
              input: audioInput.definition()
            });

            const muxer = new Muxer({ outputFormat: 'webm', streams: [videoOutput, audioOutput] });

            muxer.on('finish', done);
            muxer.on('error', done);

            assert.instanceOf(muxer.output, Readable);
            const output = fs.createWriteStream(tempFile);

            demuxer.video[0].pipe(videoInput).pipe(videoOutput).pipe(muxer.video[0]);
            demuxer.audio[0].pipe(audioInput).pipe(audioTransform).pipe(audioOutput).pipe(muxer.audio[0]);
            muxer.output!.pipe(output);
          } catch (err) {
            done(err);
          }
        });
      } catch (err) {
        done(err);
      }
    });
  });

  it('error handling on creation', (done) => {
    // MP4 does not support streaming in its default configuration
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });
    const output = fs.createWriteStream(tempFile);

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

        const videoDefinition = videoInput.definition();
        const audioDefinition = audioInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat
        });

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_AAC,
          bitRate: 128e3,
          sampleRate: audioDefinition.sampleRate,
          sampleFormat: audioDefinition.sampleFormat,
          channelLayout: audioDefinition.channelLayout
        });

        const muxer = new Muxer({ outputFormat: 'mp4', streams: [videoOutput, audioOutput] });

        muxer.on('finish', () => done('Expected an error'));
        muxer.on('error', (e) => {
          try {
            assert.match(e.message, /Invalid argument/);
            output.close();
            done();
          } catch (e) {
            done(e);
          }
        });

        assert.instanceOf(muxer.output, Readable);

        demuxer.video[0].pipe(videoInput).pipe(videoOutput).pipe(muxer.video[0]);
        demuxer.audio[0].pipe(audioInput).pipe(audioOutput).pipe(muxer.audio[0]);
        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });

  it('error handling while streaming', (done) => {
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        assert.lengthOf(demuxer.streams, 2);
        assert.lengthOf(demuxer.audio, 1);
        assert.lengthOf(demuxer.video, 1);

        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

        const videoDefinition = videoInput.definition();
        const audioDefinition = audioInput.definition();

        const videoOutput = new VideoEncoder({
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat
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
          transform: function (this: Transform, chunk: any, encoding: any, callback: TransformCallback) {
            if (frames++ === 100)
              this.push('invalid');
            else
              this.push(chunk);
            callback();
          }
        });

        const muxer = new Muxer({ outputFormat: 'matroska', streams: [videoOutput, audioOutput] });

        muxer.on('finish', () => done('Expected an error'));
        videoOutput.on('error', (e) => {
          try {
            assert.match(e.message, /Input is not a raw video/);
            done();
          } catch (e) {
            done(e);
          }
        });

        assert.instanceOf(muxer.output, Readable);
        const output = fs.createWriteStream(tempFile);

        demuxer.video[0].pipe(videoInput).pipe(injectError).pipe(videoOutput).pipe(muxer.video[0]);
        demuxer.audio[0].pipe(audioInput).pipe(audioOutput).pipe(muxer.audio[0]);
        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });

  it('w/ overlay (ImageMagick overlay version)', (done) => {
    // Overlaying using ImageMagick is very versatile and allows for maximum quality,
    // however it is far too slow to be done in realtime
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        const audioInput = new AudioDecoder(demuxer.audio[0]);
        const videoInput = new VideoDecoder(demuxer.video[0]);

        const videoDefinition = videoInput.definition();
        const audioDefinition = audioInput.definition();

        // Alas, even if ImageMagick supports YUV420 raw pixel encoding, it does so
        // in a particularly inefficient manner - it performs a very high-quality
        // transformation both when reading and when writing the image, preserving
        // all available information while supporting arbitrary color depths
        //
        // On the other side, ffmpeg does this transformation using a low-level
        // hand-optimized SSE assembly loop and it is more than 10 times faster
        // Thus, we will add additional pipeline elements to convert the incoming
        // frames to RGBA8888 and then back to YUV420
        //
        // See the example in filtering for a much faster example that uses
        // ffmpeg's filtering system to overlay the image
        //
        // This is the intermediate format used
        const videoRGB = {
          type: 'Video',
          codec: videoDefinition.codec,
          bitRate: videoDefinition.bitRate,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: new ffmpeg.PixelFormat(ffmpeg.AV_PIX_FMT_RGBA)
        } as VideoStreamDefinition;
        // A transformer that uses ffmpeg to convert from YUV420 to RGBA8888
        const toRGB = new VideoTransform({
          input: videoDefinition,
          output: videoRGB,
          interpolation: ffmpeg.SWS_BILINEAR
        });
        // A transformer that uses ffmpeg to convert from RGBA8888 to YUV420
        const fromRGB = new VideoTransform({
          output: videoDefinition,
          input: videoRGB,
          interpolation: ffmpeg.SWS_BILINEAR
        });

        const videoOutput = new VideoEncoder({
          type: 'Video',
          codec: ffmpeg.AV_CODEC_H264,
          bitRate: 2.5e6,
          width: videoDefinition.width,
          height: videoDefinition.height,
          frameRate: new ffmpeg.Rational(25, 1),
          pixelFormat: videoDefinition.pixelFormat
        });

        const audioOutput = new AudioEncoder({
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_AAC,
          bitRate: 128e3,
          sampleRate: audioDefinition.sampleRate,
          sampleFormat: audioDefinition.sampleFormat,
          channelLayout: audioDefinition.channelLayout
        });

        // We will be overlaying a subtitle over the image
        // Drawing text is a very expensive operation, so we won't be drawing on each frame
        // We will draw it once and then overlay it on each frame
        const textImage = new Magick.Image('500x20', 'transparent');
        textImage.draw([
          new Magick.DrawableFont('sans-serif', MagickCore.NormalStyle, 100, MagickCore.NormalStretch),
          new Magick.DrawablePointSize(24),
          new Magick.DrawableStrokeColor('black'),
          new Magick.DrawableText(20, 18, 'The insurance is mandatory, the copyright is not')
        ]);

        const frame = new Magick.Image;
        // A MediaTransform is a generic user-definable object-mode stream transform
        const overlay = new MediaTransform({
          transform(chunk, encoding, callback) {
            assert.instanceOf(chunk, ffmpeg.VideoFrame);
            // Create a Magick.Blob from the ffmpeg.VideoFrame
            const blob = new Magick.Blob(chunk.data().buffer);
            // Import this binary blob into an Image object, specify the RGBA 8:8:8:8 raw pixel format
            frame.readAsync(blob, `${videoDefinition.width}x${videoDefinition.height}`, 8, 'rgba')
              // Overlay the subtitle on this image
              .then(() => frame.compositeAsync(textImage, `+0+${videoDefinition.height - 40}`, MagickCore.MultiplyCompositeOp))
              // Export the image back to a binary buffer
              .then(() => frame.writeAsync(blob))
              // Extract an ArrayBuffer from the blob
              .then(() => blob.dataAsync())
              .then((ab) => {
                // Wrap it first in a Node.js Buffer, then in a ffmpeg.VideoFrame
                const output = ffmpeg.VideoFrame.create(
                  Buffer.from(ab), videoRGB.pixelFormat, videoDefinition.width, videoDefinition.height);
                // Each frame must carry a timestamp, we copy it from the original
                output.setPts(chunk.pts());
                this.push(output);
                callback();
              })
              .catch(callback);
          }
        });

        const muxer = new Muxer({ outputFormat: 'matroska', streams: [videoOutput, audioOutput] });

        muxer.on('finish', done);
        muxer.on('error', done);

        assert.instanceOf(muxer.output, Readable);
        const output = fs.createWriteStream(tempFile);

        demuxer.video[0].pipe(videoInput).pipe(toRGB).pipe(overlay).pipe(fromRGB).pipe(videoOutput).pipe(muxer.video[0]);
        demuxer.audio[0].pipe(audioInput).pipe(audioOutput).pipe(muxer.audio[0]);
        muxer.output!.pipe(output);
      } catch (err) {
        done(err);
      }
    });
  });
});
