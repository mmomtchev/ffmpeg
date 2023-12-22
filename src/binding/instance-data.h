#pragma once
#include <napi.h>
#include <thread>

struct ffmpegInstanceData {
  std::thread::id v8_main_thread;
  Napi::FunctionReference js_Writable_ctor;
  Napi::FunctionReference js_Readable_ctor;
  Napi::FunctionReference js_ReadableCustomIO_ctor;
  Napi::FunctionReference js_WritableCustomIO_ctor;
};
