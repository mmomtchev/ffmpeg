#include "avcpp-frame.h"

AudioSamples CreateAudioSamples(Nobind::Typemap::Buffer buffer, SampleFormat sampleFormat, int samplesCount,
                                uint64_t channelLayout, int sampleRate) {
  return AudioSamples{buffer.first, buffer.second, sampleFormat, samplesCount, channelLayout, sampleRate};
}

VideoFrame CreateVideoFrame(Nobind::Typemap::Buffer buffer, PixelFormat pixelFormat, int width, int height) {
  return VideoFrame{buffer.first, buffer.second, pixelFormat, width, height};
}

VideoFrameBuffer CopyFrameToBuffer(VideoFrame &frame) {
  auto size = frame.bufferSize();
  return VideoFrameBuffer{{[&frame, size](uint8_t *data) { frame.copyToBuffer(data, size); }, size}};
}

VideoFrame *GetVideoFrame(BufferSinkFilterContext &sink, OptionalErrorCode ec) {
  VideoFrame *frame = new VideoFrame;
  if (!sink.getVideoFrame(*frame, ec)) {
    delete frame;
    return nullptr;
  }

  return frame;
}

AudioSamples *GetAudioFrame(BufferSinkFilterContext &sink, OptionalErrorCode ec) {
  AudioSamples *samples = new AudioSamples;
  if (!sink.getAudioFrame(*samples, ec)) {
    delete samples;
    return nullptr;
  }

  return samples;
}
