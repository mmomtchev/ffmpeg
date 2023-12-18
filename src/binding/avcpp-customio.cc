#include "avcpp-customio.h"
#include "debug.h"
#include <exception>

Napi::FunctionReference *WritableCustomIO::js_Writable_ctor = nullptr;
Napi::FunctionReference *WritableCustomIO::js_ctor = nullptr;
std::thread::id WritableCustomIO::v8_main_thread;

WritableCustomIO::WritableCustomIO(const Napi::CallbackInfo &info)
    : av::CustomIO(), Napi::ObjectWrap<WritableCustomIO>(info), eof(false) {
  Napi::Env env{info.Env()};

  if (js_Writable_ctor == nullptr || js_ctor == nullptr)
    throw Napi::Error::New(env, "WritableCustomIO is not initalized");

  js_Writable_ctor->Call(this->Value(), {});
}

void WritableCustomIO::Init(const Napi::CallbackInfo &info) {
  Napi::Env env{info.Env()};

  if (info.Length() != 1 || !info[0].IsFunction())
    throw Napi::Error::New(env, "Argument is not a function");

  js_Writable_ctor = new Napi::FunctionReference;
  *js_Writable_ctor = Napi::Persistent(info[0].As<Napi::Function>());
}

Napi::Function WritableCustomIO::GetClass(Napi::Env env) {
  Napi::Function self =
      DefineClass(env, "WritableCustomIO",
                  {StaticMethod("init", &WritableCustomIO::Init), InstanceMethod("_write", &WritableCustomIO::_Write),
                   InstanceMethod("_final", &WritableCustomIO::_Final)});

  js_ctor = new Napi::FunctionReference;
  *js_ctor = Napi::Persistent(self);
  v8_main_thread = std::this_thread::get_id();
  return self;
}

int WritableCustomIO::read(uint8_t *data, size_t size) {
  verbose("ffmpeg asked for data %lu\n", (long unsigned)size);
  if (std::this_thread::get_id() == v8_main_thread)
    throw std::logic_error{"This function cannot be called in sync mode"};
  if (eof) {
    verbose("sending an EOF to ffmpeg\n");
    return AVERROR_EOF;
  }

  std::unique_lock lk{lock};
  cv.wait(lk, [this] { return !queue.empty(); });

  verbose("will send data to ffmpeg\n");
  size_t remaining = size;
  uint8_t *dst = data;
  while (remaining > 0) {
    auto *buf = queue.front();
    if (buf->data == nullptr) {
      // EOF
      verbose("reached EOF, sending last %lu bytes to ffmpeg\n", size - remaining);
      buf->callback.NonBlockingCall();
      buf->callback.Release();
      eof = true;
      return size - remaining;
    }
    size_t buf_remaining = buf->length - (buf->current - buf->data);
    if (buf_remaining > remaining) {
      verbose("will partially copy BufferItem %p, %lu of %lu\n", buf->current, remaining, buf_remaining);
      // The current BufferItem has more data than we need
      memcpy(dst, buf->current, remaining);
      buf->current += remaining;
      dst += remaining;
      remaining = 0;
    } else {
      // The current BufferItem has less or exactly as much data as we need
      verbose("will consume BufferItem %p %lu, need %lu\n", buf->current, buf_remaining, remaining);
      memcpy(dst, buf->current, buf_remaining);
      dst += buf_remaining;
      remaining -= buf_remaining;
      buf->callback.NonBlockingCall();
      buf->callback.Release();

      queue.pop();
      if (queue.empty() && remaining > 0) {
        verbose("ate everything, still need more, will go back to sleep\n");
        cv.wait(lk, [this] { return !queue.empty(); });
      }
    }
  }
  verbose("returning data to ffmpeg\n");
  return size;
}

int64_t WritableCustomIO::seek(int64_t offset, int whence) {
  if (offset != 0) {
    fprintf(stderr, "ffmpeg tried to seek in a ReadStream\n");
    throw std::logic_error("ffmpeg tried to seek in a ReadStream");
  }
  return 0;
}
int WritableCustomIO::seekable() const { return 0; }

void WritableCustomIO::_Write(const Napi::CallbackInfo &info) {
  verbose("JS is writing\n");
  Napi::Env env{info.Env()};

  if (!info[0].IsBuffer())
    throw Napi::Error::New(env, "_write did not receive a Buffer");
  if (!info[2].IsFunction())
    throw Napi::Error::New(env, "_write called without a callback");
  auto callback = info[2].As<Napi::Function>();

  auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
  verbose("buffer %p length %lu\n", buffer.Data(), (unsigned long)buffer.Length());

  std::unique_lock lk(lock);
  auto item = new BufferItem{buffer.Data(), buffer.Data(), buffer.Length(), Napi::Persistent<Napi::Object>(buffer), {}};
  item->callback = Napi::ThreadSafeFunction::New(env, callback, "ffmpeg_Writable_IO", 0, 1, [item](Napi::Env) {
    // The BufferItem has been consumed
    delete item;
  });
  queue.push(item);

  lk.unlock();
  cv.notify_one();
}

void WritableCustomIO::_Final(const Napi::CallbackInfo &info) {
  verbose("JS is finalizing\n");
  Napi::Env env{info.Env()};

  if (!info[0].IsFunction())
    throw Napi::Error::New(env, "Readable did not provide a callback");
  Napi::Function callback = info[0].As<Napi::Function>();

  std::unique_lock lk(lock);
  auto item = new BufferItem{nullptr, nullptr, 0, {}, {}};
  item->callback = Napi::ThreadSafeFunction::New(env, callback, "ffmpeg_Writable_IO", 0, 1, [item](Napi::Env) {
    // The BufferItem has been consumed
    delete item;
  });
  queue.push(item);

  lk.unlock();
  cv.notify_one();
}
