import ffmpeg from '@mmomtchev/ffmpeg';

import { assert } from 'chai';

describe('check inheritance', () => {
  it('CodecContext', () => {
    const videoEncoder = new ffmpeg.VideoEncoderContext;
    // @ts-expect-error (this is a flaw in the chai type definitions)
    assert.instanceOf(videoEncoder, ffmpeg.CodecContext);
    assert.instanceOf(videoEncoder, ffmpeg.VideoEncoderContext);

    const audioEncoder = new ffmpeg.AudioEncoderContext;
    // @ts-expect-error (this is a flaw in the chai type definitions)
    assert.instanceOf(audioEncoder, ffmpeg.CodecContext);
    assert.instanceOf(audioEncoder, ffmpeg.AudioEncoderContext);
  });
});
