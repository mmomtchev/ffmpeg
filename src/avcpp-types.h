#pragma once
#include <codec.h>
#include <libavutil/avutil.h>
#include <nooverrides.h>

// Generic typemaps for enum <-> int
template <typename T> class EnumFromJS {
  int val_;

public:
  inline explicit EnumFromJS(Napi::Value val) {
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

template <> class FromJS<AVPictureType> : public EnumFromJS<AVPictureType> {
public:
  using EnumFromJS<AVPictureType>::EnumFromJS;
};
template <> class ToJS<AVPictureType> : public EnumToJS<AVPictureType> {
public:
  using EnumToJS<AVPictureType>::EnumToJS;
};

template <> class FromJS<AVCodecID> : public EnumFromJS<AVCodecID> {
public:
  using EnumFromJS<AVCodecID>::EnumFromJS;
};
template <> class ToJS<AVCodecID> : public EnumToJS<AVCodecID> {
public:
  using EnumToJS<AVCodecID>::EnumToJS;
};

template <> class FromJS<AVMediaType> : public EnumFromJS<AVMediaType> {
public:
  using EnumFromJS<AVMediaType>::EnumFromJS;
};
template <> class ToJS<AVMediaType> : public EnumToJS<AVMediaType> {
public:
  using EnumToJS<AVMediaType>::EnumToJS;
};

template <> class FromJS<AVPixelFormat> : public EnumFromJS<AVPixelFormat> {
public:
  using EnumFromJS<AVPixelFormat>::EnumFromJS;
};
template <> class ToJS<AVPixelFormat> : public EnumToJS<AVPixelFormat> {
public:
  using EnumToJS<AVPixelFormat>::EnumToJS;
};

} // namespace Typemap

} // namespace Nobind
