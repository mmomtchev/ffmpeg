#include "avcpp-frame.h"

AudioSamples CreateAudioSamples(Nobind::Typemap::Buffer buffer, SampleFormat sampleFormat, int samplesCount,
                                uint64_t channelLayout, int sampleRate) {
  return AudioSamples{buffer.first, buffer.second, sampleFormat, samplesCount, channelLayout, sampleRate};
}

VideoFrame CreateVideoFrame(Nobind::Typemap::Buffer buffer, PixelFormat pixelFormat, int width, int height) {
  return VideoFrame{buffer.first, buffer.second, pixelFormat, width, height};
}

// This copies twice (FIXME)
Nobind::Typemap::Buffer CopyFrameToBuffer(av::VideoFrame &frame) {
  auto size = frame.bufferSize();
  auto buffer = new uint8_t[size];
  frame.copyToBuffer(buffer, size);
  return Nobind::Typemap::Buffer{buffer, size};
}
