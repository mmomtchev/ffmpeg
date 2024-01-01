import * as path from 'node:path';
import * as fs from 'node:fs';
import ReadableStreamClone from 'readable-stream-clone';

import { assert } from 'chai';

import ffmpeg from '@mmomtchev/ffmpeg';
import { Muxer, Demuxer, VideoDecoder, VideoEncoder, AudioDecoder, AudioEncoder, VideoTransform, Filter, Discarder } from '@mmomtchev/ffmpeg/stream';
import { Readable, Writable } from 'node:stream';
import { MediaTransform, VideoStreamDefinition } from '../lib/MediaStream';
import { Magick, MagickCore } from 'magickwand.js';

ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_ERROR);

const tempFile = path.resolve(__dirname, 'overlay-temp.mkv');

describe('streaming', () => {
  afterEach('delete temporary', (done) => {
    if (!process.env.DEBUG_ALL && !process.env.DEBUG_MUXER)
      fs.rm(tempFile, done);
    else
      done();
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
        // See below for a much faster example that uses ffmpeg's filtering
        // system to overlay the image
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

});
