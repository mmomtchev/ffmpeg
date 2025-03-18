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

  static const std::string TSType() { return "number"; };
};

template <typename T, const Nobind::ReturnAttribute &RET> class EnumToJS {
  Napi::Env env_;
  int64_t val_;

public:
  inline explicit EnumToJS(Napi::Env env, T val) : env_(env), val_(static_cast<int64_t>(val)) {}
  // JS at its finest - 64 bit integers are treated as double
  // The eventual loss of precision is part of the language specifications
  inline Napi::Value Get() { return Napi::Number::New(env_, static_cast<double>(val_)); }

  static const std::string TSType() {
    if constexpr (RET.isAsync())
      return "Promise<number>";
    else
      return "number";
  };
};

namespace Nobind {
namespace Typemap {

// A typemap that inserts an OptionalErrorCode w/o consuming a JS argument
template <> class FromJS<av::OptionalErrorCode> {

public:
  inline explicit FromJS(const Napi::Value &) {}
  inline av::OptionalErrorCode Get() { return av::throws(); }
  static const int Inputs = 0;

  static std::string TSType() { return ""; };
};

#define TYPEMAPS_FOR_ENUM(ENUM)                                                                                        \
  template <> class FromJS<ENUM> : public EnumFromJS<ENUM> {                                                           \
  public:                                                                                                              \
    using EnumFromJS<ENUM>::EnumFromJS;                                                                                \
    static std::string TSType() { return "number & { readonly [__ffmpeg_tag_type]: '" #ENUM "' }"; }                   \
  };                                                                                                                   \
  template <const Nobind::ReturnAttribute &RET> class ToJS<ENUM, RET> : public EnumToJS<ENUM, RET> {                   \
  public:                                                                                                              \
    using EnumToJS<ENUM, RET>::EnumToJS;                                                                               \
    static std::string TSType() {                                                                                      \
      if constexpr (RET.isAsync())                                                                                     \
        return "Promise<number & { readonly [__ffmpeg_tag_type]: '" #ENUM "' }>";                                      \
      else                                                                                                             \
        return "number & { readonly [__ffmpeg_tag_type]: '" #ENUM "' }";                                               \
    }                                                                                                                  \
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
