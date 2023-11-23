#pragma once
#include <frame.h>
#include <nobind.h>

using namespace av;

// An universal wrapper for Frame-derived types that returns a Buffer
// by copying the underlying data
template <typename T> Nobind::Typemap::Buffer ReturnBuffer(T &object);

// Version for multiplane data (ie stereo audio)
template <typename T> Nobind::Typemap::Buffer ReturnBufferPlane(T &object, size_t plane);

// The avcpp Frame constructors are unusable with nobind 1.x
// Thus, there are two factory methods that return prvalues
// This is the best way to return an object - JavaScript (and thus nobind)
// needs a heap constructed object - returning a prvalue here will allow direct construction on the heap
// (maybe a future version will support this transformation)
AudioSamples CreateAudioSamples(Nobind::Typemap::Buffer buffer, SampleFormat sampleFormat, int samplesCount,
                                uint64_t channelLayout, int sampleRate) {
  return AudioSamples{buffer.first, buffer.second, sampleFormat, samplesCount, channelLayout, sampleRate};
}

VideoFrame CreateVideoFrame(Nobind::Typemap::Buffer buffer, PixelFormat pixelFormat, int width, int height) {
  return VideoFrame{buffer.first, buffer.second, pixelFormat, width, height};
}
