#pragma once
#include <codec.h>
#include <libavutil/avutil.h>
#include <nooverrides.h>

// Generic typemaps for enum <-> BigInt
// ffmpeg/avcpp use 64-bit constants that are above the max safe integer in JavaScript
// (for example: #define AV_CH_LAYOUT_NATIVE 0x8000000000000000ULL)
template <typename T> class BigIntEnumFromJS {
  uint64_t val_;

public:
  inline explicit BigIntEnumFromJS(const Napi::Value &val) {
    if (!val.IsBigInt()) {
      throw Napi::TypeError::New(val.Env(), "value must be a BigInt");
    }
    bool lossless;
    val_ = val.As<Napi::BigInt>().Uint64Value(&lossless);
    if (!lossless) {
      throw Napi::RangeError::New(val.Env(), "constant will overflow uint64_t");
    }
  }
  inline T Get() { return static_cast<T>(val_); }
};

template <typename T> class BigIntEnumToJS {
  Napi::Env env_;
  uint64_t val_;

public:
  // We know that ffmpeg/avcpp constants are never negative
  inline explicit BigIntEnumToJS(Napi::Env env, T val) : env_(env), val_(static_cast<uint64_t>(val)) {}
  inline Napi::Value Get() { return Napi::BigInt::New(env_, val_); }
};

// Use an artificial type for the numeric constants
// so that we can register them as BigInts without
// converting all size_t
struct ffmpeg_constant_t {
  uint64_t value;
};

namespace Nobind {
namespace Typemap {

// A typemap that inserts an OptionalErrorCode w/o consuming a JS argument
template <> class FromJS<av::OptionalErrorCode> {

public:
  inline explicit FromJS(const Napi::Value &) {}
  inline av::OptionalErrorCode Get() { return av::throws(); }
  static const int Inputs = 0;
};

#define TYPEMAPS_FOR_ENUM(ENUM)                                                                                        \
  template <> class FromJS<ENUM> : public BigIntEnumFromJS<ENUM> {                                                     \
  public:                                                                                                              \
    using BigIntEnumFromJS<ENUM>::BigIntEnumFromJS;                                                                    \
  };                                                                                                                   \
  template <> class ToJS<ENUM> : public BigIntEnumToJS<ENUM> {                                                         \
  public:                                                                                                              \
    using BigIntEnumToJS<ENUM>::BigIntEnumToJS;                                                                        \
  };

// Create typemaps for all basic enums
TYPEMAPS_FOR_ENUM(AVPictureType);
TYPEMAPS_FOR_ENUM(AVCodecID);
TYPEMAPS_FOR_ENUM(AVMediaType);
TYPEMAPS_FOR_ENUM(AVPixelFormat);
TYPEMAPS_FOR_ENUM(AVSampleFormat);

template <> class FromJS<ffmpeg_constant_t> {
  uint64_t val_;

public:
  inline explicit FromJS(const Napi::Value &val) {
    if (!val.IsBigInt()) {
      throw Napi::TypeError::New(val.Env(), "value must be a BigInt");
    }
    bool lossless;
    val_ = val.As<Napi::BigInt>().Uint64Value(&lossless);
    if (!lossless) {
      throw Napi::RangeError::New(val.Env(), "constant will overflow uint64_t");
    }
  }
  inline ffmpeg_constant_t Get() { return ffmpeg_constant_t{val_}; }
};

template <> class ToJS<ffmpeg_constant_t> {
  Napi::Env env_;
  uint64_t val_;

public:
  inline explicit ToJS(Napi::Env env, ffmpeg_constant_t val) : env_(env), val_(val.value) {}
  inline Napi::Value Get() { return Napi::BigInt::New(env_, val_); }
};

} // namespace Typemap

namespace TypemapOverrides {

} // namespace TypemapOverrides

} // namespace Nobind
