const { assert } = require('chai');

const ffmpeg = require('..');

const { PixelFormat, VideoFrame } = ffmpeg;

describe('video', () => {
  describe('VideoFrame', () => {
    it('should be constructible from a Buffer', () => {
      const format = new PixelFormat('yuv420p');
      const buffer = Buffer.alloc(160 * 120 * format.bitsPerPixel() / 8);

      const frame = VideoFrame.create(buffer, format, 160, 120);
      assert.instanceOf(frame, VideoFrame);
      assert.isAtLeast(frame.size(), 160 * 120 * format.bitsPerPixel() / 8);
      assert.strictEqual(frame.pixelFormat().bitsPerPixel(), 12);
      assert.strictEqual(frame.pixelFormat().name(), 'yuv420p');
      assert.strictEqual(frame.width(), 160);
      assert.strictEqual(frame.height(), 120);
    });
  });
});
