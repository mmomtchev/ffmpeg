#pragma once
#include "avcpp-dictionary.h"
#include <codec.h>
#include <libavutil/avutil.h>
#include <nooverrides.h>

template <typename T> class EnumFromJS {
  int64_t val_;

public:
  inline explicit EnumFromJS(const Napi::Value &val) {
    if (!val.IsNumber()) {
      throw Napi::TypeError::New(val.Env(), "value must be a number");
    }
    val_ = val.ToNumber().Int64Value();
  }
  inline T Get() { return static_cast<T>(val_); }
};

template <typename T> class EnumToJS {
  Napi::Env env_;
  int64_t val_;

public:
  inline explicit EnumToJS(Napi::Env env, T val) : env_(env), val_(static_cast<int64_t>(val)) {}
  inline Napi::Value Get() { return Napi::Number::New(env_, val_); }
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
  template <> class FromJS<ENUM> : public EnumFromJS<ENUM> {                                                           \
  public:                                                                                                              \
    using EnumFromJS<ENUM>::EnumFromJS;                                                                                \
  };                                                                                                                   \
  template <> class ToJS<ENUM> : public EnumToJS<ENUM> {                                                               \
  public:                                                                                                              \
    using EnumToJS<ENUM>::EnumToJS;                                                                                    \
  };

// Create typemaps for all basic enums
TYPEMAPS_FOR_ENUM(AVPictureType);
TYPEMAPS_FOR_ENUM(AVCodecID);
TYPEMAPS_FOR_ENUM(AVMediaType);
TYPEMAPS_FOR_ENUM(AVPixelFormat);
TYPEMAPS_FOR_ENUM(AVSampleFormat);
TYPEMAPS_FOR_ENUM(FilterMediaType);
// While this is not an enum, the typemap is still compatible
TYPEMAPS_FOR_ENUM(std::bitset<64>);

} // namespace Typemap

namespace TypemapOverrides {} // namespace TypemapOverrides

} // namespace Nobind
