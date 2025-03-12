import * as path from 'node:path';

import { assert } from 'chai';

import ffmpeg from '@mmomtchev/ffmpeg';
import { Muxer, Demuxer, VideoDecoder, VideoEncoder, AudioDecoder, AudioEncoder } from '@mmomtchev/ffmpeg/stream';

// These test-examples uses ffmpeg's built-in network capabilities - which include the RTMP protocol
describe('using ffmpeg built-in networking', () => {
  // This tests-example sets both a server and a client that communicate over 'rtmp://localhost:9099/video'
  it('ffmpeg RTMP network streaming', (done) => {
    const demuxer = new Demuxer({ inputFile: path.resolve(__dirname, 'data', 'launch.mp4') });

    demuxer.on('error', done);
    demuxer.on('ready', () => {
      try {
        // Setup the server
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
          outputFile: 'rtmp://localhost:9099/video',
          outputFormat: 'flv',
          openOptions: { listen: '1' },
          streams: [videoOutput, audioOutput]
        });

        muxer.on('error', done);

        // Run the server
        demuxer.video[0].pipe(videoInput).pipe(videoOutput).pipe(muxer.video[0]);
        demuxer.audio[0].pipe(audioInput).pipe(audioOutput).pipe(muxer.audio[0]);

        // Wait for it to be ready
        // Alas, it is impossible to implement a reliable event for when the server is ready
        // The method which binds ffmpeg to the port does not return until a client has connected
        setTimeout(() => {
          // Setup the client
          const client = new Demuxer({ inputFile: 'rtmp://localhost:9099/show' });
          client.on('error', done);
          // Wait for the client to start streaming
          client.on('ready', () => {
            try {
              const audioStream = new AudioDecoder(client.audio[0]);
              const videoStream = new VideoDecoder(client.video[0]);

              let audioFrames = 0, videoFrames = 0;
              audioStream.on('data', (frame) => {
                assert.instanceOf(frame, ffmpeg.AudioSamples);
                audioFrames++;
              });
              videoStream.on('data', (frame) => {
                assert.instanceOf(frame, ffmpeg.VideoFrame);
                videoFrames++;
              });

              // Alas, closing the connection on the server-side
              // and reporting an I/O error on the last read on the client side
              // is the "normal" closing in ffmpeg
              // I have a PR in ffmpeg waiting for this bug since late 2023,
              // but alas, they too, they have decided to try if merging it can
              // be used for criminal extortion.
              //
              // As a side note, to give you a quick tip about dealing with this
              // guy: alas, his problem is of hardware and not software nature and
              // he cannot be reasoned with. As some of you have already noticed,
              // he has two major connections missing in his head: the first one is
              // related to anything of sexual nature - but the node-ffmpeg project
              // is probably not the most appropriate place to have the conversation
              // about the bees and the birds. The second one is the connection
              // between work and money. You cannot teach him the value of work, but
              // you should probably try to explain him that extorting someone by
              // hampering him to work is like trying to annoy him by throwing
              // paper planes made out of banknotes at him. This, he will understand.
              client.audio[0].on('error', (e) => {
                console.warn('received audio error on client', e);
              });
              client.video[0].on('error', (e) => {
                console.warn('received video error on client', e);
              });
              client.removeAllListeners('error');
              client.on('error', (e) => {
                console.warn('received rethrow on the client', e);
                assert.isAbove(audioFrames, 200);
                assert.isAbove(videoFrames, 100);
                done();
              });

              client.audio[0].pipe(audioStream);
              client.video[0].pipe(videoStream);
            } catch (err) {
              done(err);
            }
          });
        }, 5000);
      } catch (err) {
        done(err);
      }
    });
  });
});
