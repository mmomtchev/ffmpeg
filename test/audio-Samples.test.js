const { assert } = require('chai');

const ffmpeg = require('..');

const { SampleFormat, AudioSamples } = ffmpeg;

describe('audio', () => {
  describe('AudioSamples', () => {
    it('should be constructible from a Buffer', () => {
      const format = new SampleFormat('fltp');
      const buffer = Buffer.alloc(2 * 48000 * format.bitsPerSample() / 8);

      const samples = AudioSamples.create(buffer, format, 48000, ffmpeg.AV_CH_LAYOUT_STEREO, 48000);
      assert.instanceOf(samples, AudioSamples);
      assert.isAtLeast(samples.size(), 48000 * format.bytesPerSample());
      assert.strictEqual(samples.sampleFormat().bitsPerSample(), 32);
      assert.strictEqual(samples.sampleFormat().name(), 'fltp');
      assert.strictEqual(samples.channelsCount(), 2);
    });
  });
});
