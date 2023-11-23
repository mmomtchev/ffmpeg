#include "avcpp-frame.h"

template <typename T> Nobind::Typemap::Buffer ReturnBuffer(T &object) {
  return Nobind::Typemap::Buffer{object.data(), object.size()};
}

template <typename T> Nobind::Typemap::Buffer ReturnBufferPlane(T &object, size_t plane) {
  return Nobind::Typemap::Buffer{object.data(plane), object.size(plane)};
}
