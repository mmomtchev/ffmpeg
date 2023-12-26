#pragma once
#pragma once
#include <dictionary.h>
#include <napi.h>
#include <nooverrides.h>

/**
 * Typemaps implementing transformation of a JS vanilla object
 * to and from an av::Dictionary.
 *
 * av::Dictionary is not directly exposed to JS - it is entirely
 * replaced by a vanilla JS object.
 */

namespace Nobind {
namespace Typemap {

template <> class FromJS<av::Dictionary &> {
  av::Dictionary dict;

public:
  inline explicit FromJS(const Napi::Value &val) : dict{} {
    if (!val.IsObject()) {
      throw Napi::Error::New(val.Env(), "Expected an object for the Dictionary argument");
    }
    Napi::Object obj = val.ToObject();
    for (const auto &el : obj) {
      auto key = el.first.ToString().Utf8Value();
      Napi::Value value = el.second;
      if (!value.IsString()) {
        throw Napi::Error::New(val.Env(), "Non-string value encountered in the Dictionary argument");
      }
      dict.set(key, value.ToString().Utf8Value());
    }
  }
  inline av::Dictionary &Get() { return dict; }
};

} // namespace Typemap
} // namespace Nobind
