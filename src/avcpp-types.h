#pragma once
#include <codec.h>
#include <libavutil/avutil.h>
#include <nooverrides.h>

// Generic typemaps for enum <-> int
template <typename T> class EnumFromJS {
  int val_;

public:
  inline explicit EnumFromJS(const Napi::Value &val) {
    if (!val.IsNumber()) {
      throw Napi::TypeError::New(val.Env(), "Enum must be a number");
    }
    val_ = val.ToNumber().Int32Value();
  }
  inline T Get() { return static_cast<T>(val_); }
};

template <typename T> class EnumToJS {
  Napi::Env env_;
  int val_;

public:
  inline explicit EnumToJS(Napi::Env env, T val) : env_(env), val_(static_cast<int>(val)) {}
  inline Napi::Value Get() { return Napi::Number::New(env_, val_); }
};

namespace Nobind {
namespace Typemap {

// A typemap that inserts an OptionalErrorCode w/o a JS argument
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

TYPEMAPS_FOR_ENUM(AVPictureType);
TYPEMAPS_FOR_ENUM(AVCodecID);
TYPEMAPS_FOR_ENUM(AVMediaType);
TYPEMAPS_FOR_ENUM(AVPixelFormat);
TYPEMAPS_FOR_ENUM(AVSampleFormat);

} // namespace Typemap

} // namespace Nobind
