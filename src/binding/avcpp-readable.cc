#include "avcpp-customio.h"
#include "debug.h"
#include <exception>

ReadableCustomIO::ReadableCustomIO(const Napi::CallbackInfo &info)
    : av::CustomIO{}, Napi::ObjectWrap<ReadableCustomIO>{info}, queue_size{0}, eof{false},
      async_context{info.Env(), "ffmpeg_Readable_IO"}, flowing{false}, final_callback{} {
  Napi::Env env{info.Env()};

  instance_data = env.GetInstanceData<Nobind::EnvInstanceData<ffmpegInstanceData>>();
  if (instance_data->js_Readable_ctor.IsEmpty() || instance_data->js_ReadableCustomIO_ctor.IsEmpty())
    throw Napi::Error::New(env, "ReadableCustomIO is not initalized");

  instance_data->js_Readable_ctor.Call(this->Value(), {});

  uv_loop_t *event_loop;
  napi_get_uv_event_loop(env, &event_loop);
  push_callback = new uv_async_t;
  uv_async_init(event_loop, push_callback, &ReadableCustomIO::PushPendingData);
  push_callback->data = this;
}

ReadableCustomIO::~ReadableCustomIO() {
  std::unique_lock lk{lock};
  push_callback->data = nullptr;
  uv_close(reinterpret_cast<uv_handle_t *>(push_callback),
           [](uv_handle_t *async) { delete (reinterpret_cast<uv_async_t *>(async)); });
  assert(!flowing);
  while (!queue.empty()) {
    auto buf = queue.front();
    queue.pop();
    if (buf->data != nullptr)
      delete[] buf->data;
    delete buf;
  }
  verbose("ReadableCustomIO %p: destroy\n", this);
}

void ReadableCustomIO::Init(const Napi::CallbackInfo &info) {
  Napi::Env env{info.Env()};

  if (info.Length() != 1 || !info[0].IsFunction())
    throw Napi::Error::New(env, "Argument is not a function");

  auto instance_data = env.GetInstanceData<Nobind::EnvInstanceData<ffmpegInstanceData>>();
  instance_data->js_Readable_ctor = Napi::Persistent(info[0].As<Napi::Function>());
}

Napi::Function ReadableCustomIO::GetClass(Napi::Env env) {
  Napi::Function self =
      DefineClass(env, "ReadableCustomIO",
                  {StaticMethod("init", &ReadableCustomIO::Init), InstanceMethod("_read", &ReadableCustomIO::_Read),
                   InstanceMethod("_final", &ReadableCustomIO::_Final)});

  auto instance_data = env.GetInstanceData<Nobind::EnvInstanceData<ffmpegInstanceData>>();
  instance_data->js_ReadableCustomIO_ctor = Napi::Persistent(self);
  return self;
}

int ReadableCustomIO::write(const uint8_t *data, size_t size) {
  verbose("ReadableCustomIO: ffmpeg wrote data %lu, queue_size is %lu\n", size, queue_size);
  if (std::this_thread::get_id() == instance_data->v8_main_thread)
    throw std::logic_error{"This function cannot be called in sync mode"};

  auto *buffer = new BufferReadableItem{new uint8_t[size], size};
  memcpy(buffer->data, data, size);

  std::unique_lock lk{lock};
  cv.wait(lk, [this, size] { return queue_size < size; });

  verbose("ReadableCustomIO: write will unblock for ffmpeg\n");
  queue.push(buffer);
  queue_size += size;
  lk.unlock();
  uv_async_send(push_callback);

  return size;
}

int64_t ReadableCustomIO::seek(int64_t offset, int whence) {
  verbose("ReadableCustomIO: seek %ld (%d)\n", offset, whence);
  if (offset != 0) {
    fprintf(stderr, "ffmpeg tried to seek in a ReadStream\n");
    throw std::logic_error("ffmpeg tried to seek in a ReadStream");
  }
  return 0;
}
int ReadableCustomIO::seekable() const { return 0; }

void ReadableCustomIO::PushPendingData(uv_async_t *async) {
  ReadableCustomIO *self = reinterpret_cast<ReadableCustomIO *>(async->data);
  assert(self != nullptr);
  Napi::Env env{self->Env()};
  Napi::HandleScope scope{env};

  verbose("ReadableCustomIO %p: push pending data\n", self);
  Napi::Function push = self->Value().Get("push").As<Napi::Function>();
  Napi::Value more;
  std::unique_lock lk{self->lock};
  if (!self->flowing) {
    verbose("ReadableCustomIO: not flowing\n");
    return;
  }
  if (self->queue.empty()) {
    verbose("ReadableCustomIO: queue is empty\n");
    return;
  }
  do {
    auto buf = self->queue.front();
    self->queue.pop();
    self->queue_size -= buf->length;
    if (buf->data == nullptr) {
      // This is EOF
      verbose("ReadableCustomIO: pushing null to signal EOF\n");
      lk.unlock();
      push.MakeCallback(self->Value(), {env.Null()});
      lk.lock();
      delete buf;
      self->eof = true;
      if (!self->final_callback.IsEmpty()) {
        lk.unlock();
        self->final_callback.MakeCallback(self->Value(), 0, nullptr, self->async_context);
        lk.lock();
      }
      if (self->flowing) {
        verbose("ReadableCustomIO: EOF, stop flowing\n");
        self->flowing = false;
        self->Unref();
      }
      return;
    }
    // Some alternative Node-API implementations (Electron for example) disallow external buffers
#ifdef NODE_API_NO_EXTERNAL_BUFFERS_ALLOWED
    napi_value js_buffer = Napi::Buffer<uint8_t>::Copy(env, buf->data, buf->length);
    delete[] buf->data;
#else
    napi_value js_buffer =
        Napi::Buffer<uint8_t>::New(env, buf->data, buf->length, [](Napi::Env, uint8_t *buffer) { delete[] buffer; });
#endif
    verbose("ReadableCustomIO: pushed Buffer length %lu\n", buf->length);
    // MakeCallBack runs the microtasks queue, this means that everything
    // in this class must be reentrable as this will potentially call another _read
    lk.unlock();
    more = push.MakeCallback(self->Value(), 1, &js_buffer, self->async_context);
    lk.lock();
    delete buf;
  } while (!self->queue.empty() && more.ToBoolean().Value());
  if (more.ToBoolean().Value() == false) {
    verbose("ReadableCustomIO: pipe is full, stop flowing\n");
    self->flowing = false;
    self->Unref();
  }
  lk.unlock();
  // Unblock write if it is waiting because it has reached the high water mark
  self->cv.notify_one();
}

void ReadableCustomIO::_Read(const Napi::CallbackInfo &info) {
  Napi::Env env{info.Env()};

  if (!info[0].IsNumber())
    throw Napi::Error::New(env, "_read did not receive a size");

  verbose("ReadableCustomIO %p: JS is reading, queue_size is %lu\n", this, queue_size);

  if (eof)
    throw Napi::Error::New(env, "_read past EOF");
  if (flowing) {
    verbose("ReadableCustomIO: already reading\n");
    return;
  }

  verbose("ReadableCustomIO: start flowing\n");
  flowing = true;
  Ref();
  uv_async_send(push_callback);
}

void ReadableCustomIO::_Final(const Napi::CallbackInfo &info) {
  verbose("ReadableCustomIO: received EOF\n");

  auto *buffer = new BufferReadableItem{nullptr, 0};

  if (info[0].IsFunction()) {
    final_callback = Napi::Persistent<Napi::Function>(info[0].As<Napi::Function>());
  }

  std::unique_lock lk{lock};
  queue.push(buffer);
  uv_async_send(push_callback);
}
