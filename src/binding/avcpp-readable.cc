#include "avcpp-customio.h"
#include "debug.h"
#include <exception>

ReadableCustomIO::ReadableCustomIO(const Napi::CallbackInfo &info)
    : av::CustomIO(), Napi::ObjectWrap<ReadableCustomIO>(info), queue_size(0), eof(false), final_callback() {
  Napi::Env env{info.Env()};

  instance_data = env.GetInstanceData<Nobind::EnvInstanceData<ffmpegInstanceData>>();
  if (instance_data->js_Readable_ctor.IsEmpty() || instance_data->js_ReadableCustomIO_ctor.IsEmpty())
    throw Napi::Error::New(env, "ReadableCustomIO is not initalized");

  instance_data->js_Readable_ctor.Call(this->Value(), {});
}

ReadableCustomIO::~ReadableCustomIO() { verbose("ReadableCustomIO: destroy\n"); }

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
  cv.notify_one();

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

// Called only when we know that the queue is not empty
// with the lock already held
void ReadableCustomIO::PushPendingData(int64_t to_read) {
  verbose("ReadableCustomIO: push pending data: request %lu bytes\n", to_read);
  Napi::Env env(Env());
  Napi::Function push = Value().Get("push").As<Napi::Function>();
  assert(!queue.empty());
  do {
    auto buf = queue.front();
    queue.pop();
    if (buf->data == nullptr) {
      // This is EOF
      verbose("ReadableCustomIO: pushing null to signal EOF\n");
      push.MakeCallback(Value(), {env.Null()});
      delete buf;
      eof = true;
      if (!final_callback.IsEmpty()) {
        final_callback.MakeCallback(Value(), 0, nullptr);
      }
      return;
    }
    to_read -= buf->length;
    // Some alternative Node-API implementations (Electron for example) disallow external buffers
#ifdef NODE_API_NO_EXTERNAL_BUFFERS_ALLOWED
    napi_value js_buffer = Napi::Buffer<uint8_t>::Copy(env, buf->data, buf->length);
    delete[] buf->data;
#else
    napi_value js_buffer =
        Napi::Buffer<uint8_t>::New(env, buf->data, buf->length, [](Napi::Env, uint8_t *buffer) { delete[] buffer; });
#endif
    verbose("ReadableCustomIO: pushed Buffer length %lu, request remaining %ld\n", buf->length, to_read);
    push.MakeCallback(Value(), 1, &js_buffer);
    queue_size -= buf->length;
    delete buf;
  } while (!queue.empty() && to_read > 0);
}

void ReadableCustomIO::_Read(const Napi::CallbackInfo &info) {
  // When it is called without any pending data,
  // _read is an async operation and uses a worker
  class AsyncReader : public Napi::AsyncWorker {
    ReadableCustomIO &self;
    int64_t to_read;

  public:
    AsyncReader(Napi::Env env, ReadableCustomIO &io, int64_t size)
        : Napi::AsyncWorker(env, "ffmpeg_Readable_IO"), self(io), to_read(size) {}
    void Execute() override {
      // Wait for data in a background thread
      verbose("ReadableCustomIO: waiting for data in a background thread\n");
      std::unique_lock lk{self.lock};
      self.cv.wait(lk, [this] { return !self.queue.empty(); });
      verbose("ReadableCustomIO: data is available\n");
    }
    void OnOK() override {
      verbose("ReadableCustomIO: will push pending data\n");
      std::unique_lock lk{self.lock};
      self.PushPendingData(to_read);
      lk.unlock();
      self.cv.notify_one();
    }
  };

  verbose("ReadableCustomIO: JS is reading\n");
  Napi::Env env{info.Env()};

  if (!info[0].IsNumber())
    throw Napi::Error::New(env, "_read did not receive a size");

  int64_t to_read = info[0].ToNumber().Int64Value();
  verbose("ReadableCustomIO: reading %lu bytes, queue_size is %lu\n", to_read, queue_size);

  std::unique_lock lk{lock};
  if (eof)
    throw Napi::Error::New(env, "_read past EOF");
  if (queue.empty()) {
    // No pending data, return immediately and launch a read in a background thread
    (new AsyncReader(env, *this, to_read))->Queue();
  } else {
    // Pending data, send immediately
    PushPendingData(to_read);
    lk.unlock();
    cv.notify_one();
  }
}

void ReadableCustomIO::_Final(const Napi::CallbackInfo &info) {
  verbose("ReadableCustomIO: received EOF\n");

  auto *buffer = new BufferReadableItem{nullptr, 0};

  if (info[0].IsFunction()) {
    final_callback = Napi::Persistent<Napi::Function>(info[0].As<Napi::Function>());
  }

  std::unique_lock lk{lock};
  queue.push(buffer);
  lk.unlock();
  cv.notify_one();
}
