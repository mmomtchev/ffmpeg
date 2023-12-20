#pragma once
#include <condition_variable>
#include <formatcontext.h>
#include <mutex>
#include <nobind.h>
#include <queue>
#include <thread>

// These are the BufferItems that are passed to the background threads
// The second structure must be freed in the main thread!
struct BufferReadableItem {
  // The beginning of the Buffer
  uint8_t *data;
  // The length of the Buffer
  size_t length;
};
struct BufferWritableItem {
  // The beginning of the Buffer
  uint8_t *data;
  // The current read position
  uint8_t *current;
  // The length of the Buffer
  size_t length;
  // A persistent reference to the JS object, needed to protect it from the GC
  Napi::ObjectReference buffer;
  // The write callback to be called once the Buffer is consumed
  Napi::ThreadSafeFunction callback;
};

// This class is very touchy and it is implemented manually.
// It is far beyond the current scope of nobind17.
//
// It inherits both from the JS Readable and the C++ av::CustomIO.
//
// As it must bridge between the sync IO of ffmpeg/avcpp an async IO of Node.js,
// it is compatible only with async mode. Its C++ read may be called only from a background
// thread in which case it will block until the main JS thread has delivered more data.
//
// This uses my technique for extending JS classes in C++ by using node-addon-api:
// https://mmomtchev.medium.com/c-class-inheritance-with-node-api-and-node-addon-api-c180334d9902

// FIXME: This does not support multiple isolates
class WritableCustomIO : public av::CustomIO, public Napi::ObjectWrap<WritableCustomIO> {
  static Napi::FunctionReference *js_Writable_ctor;
  static std::thread::id v8_main_thread;
  std::queue<BufferWritableItem *> queue;
  std::mutex lock;
  std::condition_variable cv;
  bool eof;

public:
  // A JS-convention constructor
  static Napi::FunctionReference *js_ctor;
  WritableCustomIO(const Napi::CallbackInfo &info);

  virtual ~WritableCustomIO() override;

  // This is the CustomIO::read to be called from ffmpeg
  virtual int read(uint8_t *data, size_t size) override;

  // These are obviously not supported
  virtual int64_t seek(int64_t offset, int whence) override;
  virtual int seekable() const override;

  // These are the JS stream _write/_final to be called from JS
  void _Write(const Napi::CallbackInfo &info);
  void _Final(const Napi::CallbackInfo &info);

  // To be called once for each isolate to set up the Writable inheritance
  static void Init(const Napi::CallbackInfo &info);

  // The usual Napi GetClass
  static Napi::Function GetClass(Napi::Env env);
};

class ReadableCustomIO : public av::CustomIO, public Napi::ObjectWrap<ReadableCustomIO> {
  static Napi::FunctionReference *js_Readable_ctor;
  static std::thread::id v8_main_thread;
  std::queue<BufferReadableItem *> queue;
  size_t queue_size;
  std::mutex lock;
  std::condition_variable cv;
  bool eof;

  void PushPendingData(int64_t);

public:
  // A JS-convention constructor
  static Napi::FunctionReference *js_ctor;
  ReadableCustomIO(const Napi::CallbackInfo &info);

  virtual ~ReadableCustomIO() override;

  // This is the CustomIO::write to be called from ffmpeg
  virtual int write(const uint8_t *data, size_t size) override;

  // These are obviously not supported
  virtual int64_t seek(int64_t offset, int whence) override;
  virtual int seekable() const override;

  // This is the JS stream _read to be called from JS
  void _Read(const Napi::CallbackInfo &info);

  // This a ffmpeg extension - ffmpeg does not signal EOF to CustomIO
  // It is done manually in the Demuxer
  void _Final(const Napi::CallbackInfo &info);

  // To be called once for each isolate to set up the Readable inheritance
  static void Init(const Napi::CallbackInfo &info);

  // The usual Napi GetClass
  static Napi::Function GetClass(Napi::Env env);
};

namespace Nobind {
namespace Typemap {

// CustomIO is not a nobind17 class and needs a custom typemap
template <> class FromJS<av::CustomIO *> {
  av::CustomIO *object;

public:
  inline explicit FromJS(const Napi::Value &js_val) : object(nullptr) {
    if (!js_val.IsObject())
      throw Napi::Error::New(js_val.Env(), "Expected an object");
    Napi::Object js_obj = js_val.ToObject();
    if (js_obj.InstanceOf(WritableCustomIO::js_ctor->Value()))
      object = Napi::ObjectWrap<WritableCustomIO>::Unwrap(js_obj);
    else if (js_obj.InstanceOf(ReadableCustomIO::js_ctor->Value()))
      object = Napi::ObjectWrap<ReadableCustomIO>::Unwrap(js_obj);
    else
      throw Napi::Error::New(js_val.Env(), "Expected a CustomIO");
  }
  inline av::CustomIO *Get() { return object; }
};

} // namespace Typemap
} // namespace Nobind
