#pragma once
#include <filters/buffersink.h>
#include <frame.h>
#include <functional>
#include <nooverrides.h>

// This is a typemap for the special case of CopyFrameToBuffer
// The buffer can only be obtained by calling a special function that copies it for us
//
// Instead of `using` we create a new class to create a new distinct type
// that will have its own distinct typemap
//
// A VideoFrameBuffer is a function that fills it and a size
class VideoFrameBuffer : public std::pair<std::function<void(uint8_t *)>, size_t> {};

namespace Nobind {

namespace Typemap {

template <const ReturnAttribute &RETATTR> class ToJS<VideoFrameBuffer, RETATTR> {
  Napi::Env env_;
  VideoFrameBuffer val_;

public:
  inline explicit ToJS(Napi::Env env, VideoFrameBuffer val) : env_(env), val_(val) {}
  inline Napi::Value Get() {
    // Create a new empty Napi::Buffer
    auto buffer = Napi::Buffer<uint8_t>::New(env_, val_.second);
    // Call the callback to fill it
    val_.first(buffer.Data());
    return buffer;
  }

  ToJS(const ToJS &) = delete;
  ToJS(ToJS &&) = delete;

  static const std::string TSType() { return "Buffer<ArrayBuffer>"; };
};

} // namespace Typemap
} // namespace Nobind

#include <nobind.h>

using namespace av;

VideoFrameBuffer CopyFrameToBuffer(VideoFrame &frame);

// An universal wrapper for Frame-derived types that returns a Buffer
// by copying the underlying data
template <typename T> Nobind::Typemap::Buffer ReturnBuffer(T &object) {
  return Nobind::Typemap::Buffer{object.data(), object.size()};
}

// Version for multiplane data (ie stereo audio)
template <typename T> Nobind::Typemap::Buffer ReturnBufferPlane(T &object, size_t plane) {
  return Nobind::Typemap::Buffer{object.data(plane), object.size(plane)};
}

// The avcpp Frame constructors are unusable with nobind 1.x
// Thus, there are two factory methods that return prvalues
// This is the best way to return an object - JavaScript (and thus nobind)
// needs a heap constructed object - returning a prvalue here will allow direct construction on the heap
// (maybe a future version will support this transformation)
AudioSamples CreateAudioSamples(Nobind::Typemap::Buffer buffer, SampleFormat sampleFormat, int samplesCount,
                                uint64_t channelLayout, int sampleRate);

VideoFrame CreateVideoFrame(Nobind::Typemap::Buffer buffer, PixelFormat pixelFormat, int width, int height);

// These extension functions are needed to wrap their avcpp counterparts which return data in an argument
// They return pointers to avoid unnecessary copying of the VideoFrame - as JavaScript makes no difference
// In JavaScript all C++ objects are heap-allocated objects referenced by a pointer
VideoFrame *GetVideoFrame(BufferSinkFilterContext &sink, OptionalErrorCode ec);
AudioSamples *GetAudioFrame(BufferSinkFilterContext &sink, OptionalErrorCode ec);
