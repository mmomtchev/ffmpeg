#include <system_error>

#include <audioresampler.h>
#include <av.h>
#include <avutils.h>
#include <codec.h>
#include <ffmpeg.h>
#include <packet.h>
#include <videorescaler.h>

// API2
#include <codec.h>
#include <codeccontext.h>
#include <format.h>
#include <formatcontext.h>

#include "avcpp-types.h"

#include <nobind.h>

using namespace av;

// A define to register constants in the global namespace of the JS module
#define REGISTER_CONSTANT(CONST, NAME)                                                                                 \
  constexpr static int __const_##CONST = CONST;                                                                        \
  m.def<&__const_##CONST, Nobind::ReadOnly>(NAME);

// An universal toString() wrapper, to be used as a class extension
template <typename T> std::string ToString(T &v) {
  std::stringstream r;
  r << v;
  return r.str();
}

NOBIND_MODULE(ffmpeg, m) {
  // These two probably need better handling from JS
  // This a wrapper around std::error_code extensively used by avcpp
  m.def<std::error_code>("error_code").cons<>().def <
      &std::error_code::operator bool>("isError").def<&std::error_code::value>("value").def<&std::error_code::message>(
          "message");
  // avcpp's own wrapper
  m.def<OptionalErrorCode>("ErrorCode")
          .cons<std::error_code &>()
          .def<&OptionalErrorCode::null, Nobind::ReturnShared>("null")
          .def < &OptionalErrorCode::operator bool>("notEmpty").def<&OptionalErrorCode::operator*>("code");

  // Some important constants
  REGISTER_CONSTANT(AVMEDIA_TYPE_UNKNOWN, "AVMedia_Type_Unknown");
  REGISTER_CONSTANT(AVMEDIA_TYPE_AUDIO, "AVMedia_Type_Audio");
  REGISTER_CONSTANT(AVMEDIA_TYPE_VIDEO, "AVMedia_Type_Video");
  REGISTER_CONSTANT(AVMEDIA_TYPE_SUBTITLE, "AVMedia_Type_Subtitle");

  REGISTER_CONSTANT(AV_PICTURE_TYPE_NONE, "AVPicture_Type_None"); ///< Undefined
  REGISTER_CONSTANT(AV_PICTURE_TYPE_I, "AVPicture_Type_I");       ///< Intra
  REGISTER_CONSTANT(AV_PICTURE_TYPE_P, "AVPicture_Type_P");       ///< Predicted
  REGISTER_CONSTANT(AV_PICTURE_TYPE_B, "AVPicture_Type_B");       ///< Bi-dir predicted
  REGISTER_CONSTANT(AV_PICTURE_TYPE_S, "AVPicture_Type_S");       ///< S(GMC)-VOP MPEG-4
  REGISTER_CONSTANT(AV_PICTURE_TYPE_SI, "AVPicture_Type_SI");     ///< Switching Intra
  REGISTER_CONSTANT(AV_PICTURE_TYPE_SP, "AVPicture_Type_SP");     ///< Switching Predicted
  REGISTER_CONSTANT(AV_PICTURE_TYPE_BI, "AVPicture_Type_BI");     ///< BI type

  m.def<static_cast<Codec (*)(const OutputFormat &, bool)>(&findEncodingCodec)>("findEncodingCodec");
  m.def<static_cast<Codec (*)(AVCodecID)>(&findDecodingCodec)>("findDecodingCodec");

  m.def<FormatContext>("FormatContext")
      .cons<>()
      // Overloaded methods must be cast to be resolved
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openInput)>(
          "openInput")
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openOutput)>(
          "openOutput")
      .def<static_cast<void (FormatContext::*)(OptionalErrorCode)>(&FormatContext::findStreamInfo)>("findStreamInfo")
      .def<&FormatContext::streamsCount>("streamsCount")
      .def<static_cast<Stream (FormatContext::*)(size_t)>(&FormatContext::stream)>("stream")
      // Typical example of registering two overloaded signatures with different names in JavaScript
      .def<static_cast<void (FormatContext::*)(const InputFormat &)>(&FormatContext::setFormat)>("setInputFormat")
      .def<static_cast<void (FormatContext::*)(const OutputFormat &)>(&FormatContext::setFormat)>("setOutputFormat")
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openOutput)>(
          "openOutput")
      .def<static_cast<Stream (FormatContext::*)(const VideoEncoderContext &, OptionalErrorCode)>(
          &FormatContext::addStream)>("addVideoStream")
      .def<&FormatContext::dump>("dump")
      .def<&FormatContext::flush>("flush")
      .def<static_cast<void (FormatContext::*)(OptionalErrorCode)>(&FormatContext::writeHeader)>("writeHeader")
      .def<static_cast<Packet (FormatContext::*)(OptionalErrorCode)>(&FormatContext::readPacket)>("readPacket")
      .def<static_cast<void (FormatContext::*)(const Packet &, OptionalErrorCode)>(&FormatContext::writePacket)>(
          "writePacket")
      .def<&FormatContext::writeTrailer>("writeTrailer");

  m.def<VideoDecoderContext>("VideoDecoderContext")
      .cons<const Stream &>()
      .def<&VideoDecoderContext::width>("width")
      .def<&VideoDecoderContext::height>("height")
      .def<&VideoDecoderContext::setWidth>("setWidth")
      .def<&VideoDecoderContext::setHeight>("setHeight")
      .def<&VideoDecoderContext::pixelFormat>("pixelFormat")
      .def<&VideoDecoderContext::setPixelFormat>("setPixelFormat")
      .def<&VideoDecoderContext::timeBase>("timeBase")
      .def<&VideoDecoderContext::setTimeBase>("setTimeBase")
      .def<&VideoDecoderContext::bitRate>("bitRate")
      .def<&VideoDecoderContext::setBitRate>("setBitRate")
      .def<&VideoDecoderContext::isRefCountedFrames>("isRefCountedFrames")
      .def<&VideoDecoderContext::setRefCountedFrames>("setRefCountedFrames")
      // This an inherited overloaded method, it must be cast to its base class type
      // C++ does not allow to cast it to the inheriting class type
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&VideoDecoderContext::open)>("open")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoDecoderContext::open)>(
          "openCodec")
      .def<static_cast<VideoFrame (VideoDecoderContext::*)(const Packet &, OptionalErrorCode, bool)>(
          &VideoDecoderContext::decode)>("decode");

  m.def<VideoEncoderContext>("VideoEncoderContext")
      .cons<>()
      .cons<const Stream &>()
      .cons<const Codec &>()
      .def<&VideoEncoderContext::width>("width")
      .def<&VideoEncoderContext::height>("height")
      .def<&VideoEncoderContext::setWidth>("setWidth")
      .def<&VideoEncoderContext::setHeight>("setHeight")
      .def<&VideoEncoderContext::pixelFormat>("pixelFormat")
      .def<&VideoEncoderContext::setPixelFormat>("setPixelFormat")
      .def<&VideoEncoderContext::timeBase>("timeBase")
      .def<&VideoEncoderContext::setTimeBase>("setTimeBase")
      .def<&VideoEncoderContext::bitRate>("bitRate")
      .def<&VideoEncoderContext::setBitRate>("setBitRate")
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&VideoEncoderContext::open)>("open")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoEncoderContext::open)>(
          "openCodec")
      .def<static_cast<Packet (VideoEncoderContext::*)(const VideoFrame &, OptionalErrorCode)>(
          &VideoEncoderContext::encode)>("encode")
      .def<static_cast<Packet (VideoEncoderContext::*)(OptionalErrorCode)>(&VideoEncoderContext::encode)>("finalize");

  m.def<OutputFormat>("OutputFormat")
      .cons<>()
      .def<static_cast<bool (OutputFormat::*)(const std::string &, const std::string &, const std::string &)>(
          &OutputFormat::setFormat)>("setFormat");

  m.def<Codec>("Codec").cons<>().def<&Codec::name>("name");

  m.def<PixelFormat>("PixelFormat").def <
      &PixelFormat::operator AVPixelFormat>("get").ext<&ToString<PixelFormat>>("toString");

  m.def<Stream>("Stream")
      .def<&Stream::isNull>("isNull")
      .def<&Stream::isValid>("isValid")
      .def<&Stream::isVideo>("isVideo")
      .def<&Stream::isAudio>("isAudio")
      .def<&Stream::frameRate>("frameRate")
      .def<&Stream::setFrameRate>("setFrameRate")
      .def<&Stream::timeBase>("timeBase")
      .def<&Stream::setTimeBase>("setTimeBase")
      .def<&Stream::mediaType>("mediaType");

  m.def<Packet>("Packet")
      .def<&Packet::isNull>("isNull")
      .def<&Packet::isComplete>("isComplete")
      .def<&Packet::streamIndex>("streamIndex")
      .def<&Packet::setStreamIndex>("setStreamIndex")
      .def<&Packet::pts>("pts")
      .def<static_cast<void (Packet::*)(const Timestamp &)>(&Packet::setPts)>("setPts")
      .def<&Packet::dts>("dts")
      .def<static_cast<void (Packet::*)(const Timestamp &)>(&Packet::setDts)>("setDts")
      .def<&Packet::timeBase, Nobind::ReturnShared>("timeBase");

  m.def<VideoFrame>("VideoFrame")
      .def<&VideoFrame::isNull>("isNull")
      .def<&VideoFrame::isComplete>("isComplete")
      .def<&VideoFrame::pts>("pts")
      .def<static_cast<void (av::Frame<av::VideoFrame>::*)(const Timestamp &)>(&VideoFrame::setPts)>("setPts")
      .def<&VideoFrame::timeBase>("timeBase")
      .def<&VideoFrame::setTimeBase>("setTimeBase")
      .def<&VideoFrame::width>("width")
      .def<&VideoFrame::height>("height")
      .def<&VideoFrame::isValid>("isValid")
      .def<&VideoFrame::pixelFormat>("pixelFormat")
      .def<static_cast<size_t (av::Frame<av::VideoFrame>::*)() const>(&VideoFrame::size)>("size")
      .def<&VideoFrame::isReferenced>("isReferenced")
      .def<&VideoFrame::isKeyFrame>("isKeyFrame")
      .def<&VideoFrame::setKeyFrame>("setKeyFrame")
      .def<&VideoFrame::refCount>("refCount")
      .def<&VideoFrame::pictureType>("pictureType")
      .def<&VideoFrame::setPictureType>("setPictureType")
      .def<&VideoFrame::setKeyFrame>("setKeyFrame")
      .def<&VideoFrame::setQuality>("setQuality")
      .def<&VideoFrame::streamIndex>("streamIndex")
      .def<&VideoFrame::setStreamIndex>("setStreamIndex")
      .ext<&ToString<VideoFrame>>("toString");

  m.def<Timestamp>("Timestamp")
      .cons<int64_t, const Rational &>()
      .def<&Timestamp::seconds>("seconds")
      .def<&Timestamp::isNoPts>("isNoPts")
      .def<&Timestamp::isValid>("isValid")
      .def<&Timestamp::operator+= >("addTo")
      .def<&Timestamp::timebase>("timebase")
      .ext<&ToString<Timestamp>>("toString");
  m.def<Rational>("Rational").cons<int, int>().ext<&ToString<Rational>>("toString");

  av::init();
#ifdef DEBUG
  av::setFFmpegLoggingLevel(AV_LOG_DEBUG);
#else
  av::setFFmpegLoggingLevel(AV_LOG_INFO);
#endif
}
