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

#include <nobind.h>

#include "avcpp-frame.h"
#include "avcpp-types.h"

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

void SetLogLevel(int loglevel) { av::setFFmpegLoggingLevel(loglevel); }

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
  REGISTER_CONSTANT(AVMEDIA_TYPE_UNKNOWN, "AV_Media_Type_Unknown");
  REGISTER_CONSTANT(AVMEDIA_TYPE_AUDIO, "AV_Media_Type_Audio");
  REGISTER_CONSTANT(AVMEDIA_TYPE_VIDEO, "AV_Media_Type_Video");
  REGISTER_CONSTANT(AVMEDIA_TYPE_SUBTITLE, "AV_Media_Type_Subtitle");

  REGISTER_CONSTANT(AV_PICTURE_TYPE_NONE, "AV_Picture_Type_None"); ///< Undefined
  REGISTER_CONSTANT(AV_PICTURE_TYPE_I, "AV_Picture_Type_I");       ///< Intra
  REGISTER_CONSTANT(AV_PICTURE_TYPE_P, "AV_Picture_Type_P");       ///< Predicted
  REGISTER_CONSTANT(AV_PICTURE_TYPE_B, "AV_Picture_Type_B");       ///< Bi-dir predicted
  REGISTER_CONSTANT(AV_PICTURE_TYPE_S, "AV_Picture_Type_S");       ///< S(GMC)-VOP MPEG-4
  REGISTER_CONSTANT(AV_PICTURE_TYPE_SI, "AV_Picture_Type_SI");     ///< Switching Intra
  REGISTER_CONSTANT(AV_PICTURE_TYPE_SP, "AV_Picture_Type_SP");     ///< Switching Predicted
  REGISTER_CONSTANT(AV_PICTURE_TYPE_BI, "AV_Picture_Type_BI");     ///< BI type

  REGISTER_CONSTANT(AV_LOG_DEBUG, "AV_Log_Debug");
  REGISTER_CONSTANT(AV_LOG_INFO, "AV_Log_Info");
  REGISTER_CONSTANT(AV_LOG_WARNING, "AV_Log_Warning");
  REGISTER_CONSTANT(AV_LOG_ERROR, "AV_Log_Error");

  REGISTER_CONSTANT(AV_CH_LAYOUT_MONO, "AV_Channel_Layout_Mono");
  REGISTER_CONSTANT(AV_CH_LAYOUT_STEREO, "AV_Channel_Layout_Stereo");
  REGISTER_CONSTANT(AV_CH_LAYOUT_2POINT1, "AV_Channel_Layout_2.1");
  REGISTER_CONSTANT(AV_CH_LAYOUT_5POINT1, "AV_Channel_Layout_5.1");
  REGISTER_CONSTANT(AV_CH_LAYOUT_7POINT1, "AV_Channel_Layout_7.1");
  REGISTER_CONSTANT(AV_CH_LAYOUT_QUAD, "AV_Channel_Layout_Quad");
  REGISTER_CONSTANT(AV_CH_LAYOUT_SURROUND, "AV_Channel_Layout_Surround");

  m.def<static_cast<Codec (*)(const OutputFormat &, bool)>(&findEncodingCodec)>("findEncodingCodec");
  m.def<static_cast<Codec (*)(AVCodecID)>(&findDecodingCodec)>("findDecodingCodec");

  m.def<FormatContext>("FormatContext")
      .cons<>()
      // Overloaded methods must be cast to be resolved
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openInput)>(
          "openInput")
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openInput),
           Nobind::ReturnAsync>("openInputAsync")
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openOutput)>(
          "openOutput")
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openOutput),
           Nobind::ReturnAsync>("openOutputAsync")
      .def<static_cast<void (FormatContext::*)(OptionalErrorCode)>(&FormatContext::findStreamInfo)>("findStreamInfo")
      .def<static_cast<void (FormatContext::*)(OptionalErrorCode)>(&FormatContext::findStreamInfo)>("findStreamInfo")
      .def<static_cast<void (FormatContext::*)(OptionalErrorCode)>(&FormatContext::findStreamInfo),
           Nobind::ReturnAsync>("findStreamInfoAsync")
      .def<&FormatContext::streamsCount>("streamsCount")
      .def<static_cast<Stream (FormatContext::*)(size_t)>(&FormatContext::stream)>("stream")
      // Typical example of registering two overloaded signatures with different names in JavaScript
      .def<static_cast<void (FormatContext::*)(const InputFormat &)>(&FormatContext::setFormat)>("setInputFormat")
      .def<static_cast<void (FormatContext::*)(const OutputFormat &)>(&FormatContext::setFormat)>("setOutputFormat")
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openOutput)>(
          "openOutput")
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openOutput),
           Nobind::ReturnAsync>("openOutputAsync")
      .def<static_cast<Stream (FormatContext::*)(const VideoEncoderContext &, OptionalErrorCode)>(
          &FormatContext::addStream)>("addVideoStream")
      .def<static_cast<Stream (FormatContext::*)(const AudioEncoderContext &, OptionalErrorCode)>(
          &FormatContext::addStream)>("addAudioStream")
      .def<&FormatContext::dump>("dump")
      .def<&FormatContext::flush>("flush")
      .def<&FormatContext::flush, Nobind::ReturnAsync>("flushAsync")
      .def<static_cast<void (FormatContext::*)(OptionalErrorCode)>(&FormatContext::writeHeader)>("writeHeader")
      .def<static_cast<Packet (FormatContext::*)(OptionalErrorCode)>(&FormatContext::readPacket)>("readPacket")
      .def<static_cast<Packet (FormatContext::*)(OptionalErrorCode)>(&FormatContext::readPacket), Nobind::ReturnAsync>(
          "readPacketAsync")
      .def<static_cast<void (FormatContext::*)(const Packet &, OptionalErrorCode)>(&FormatContext::writePacket)>(
          "writePacket")
      .def<static_cast<void (FormatContext::*)(const Packet &, OptionalErrorCode)>(&FormatContext::writePacket),
           Nobind::ReturnAsync>("writePacketAsync")
      .def<&FormatContext::writeTrailer>("writeTrailer")
      .def<&FormatContext::writeTrailer, Nobind::ReturnAsync>("writeTrailerAsync");

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
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoDecoderContext::open),
           Nobind::ReturnAsync>("openCodecAsync")
      .def<static_cast<VideoFrame (VideoDecoderContext::*)(const Packet &, OptionalErrorCode, bool)>(
          &VideoDecoderContext::decode)>("decode")
      .def<static_cast<VideoFrame (VideoDecoderContext::*)(const Packet &, OptionalErrorCode, bool)>(
               &VideoDecoderContext::decode),
           Nobind::ReturnAsync>("decodeAsync");

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
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoDecoderContext::open),
           Nobind::ReturnAsync>("openCodecAsync")
      .def<static_cast<Packet (VideoEncoderContext::*)(const VideoFrame &, OptionalErrorCode)>(
          &VideoEncoderContext::encode)>("encode")
      .def<static_cast<Packet (VideoEncoderContext::*)(const VideoFrame &, OptionalErrorCode)>(
               &VideoEncoderContext::encode),
           Nobind::ReturnAsync>("encodeAsync")
      .def<static_cast<Packet (VideoEncoderContext::*)(OptionalErrorCode)>(&VideoEncoderContext::encode)>("finalize")
      .def<static_cast<Packet (VideoEncoderContext::*)(OptionalErrorCode)>(&VideoEncoderContext::encode),
           Nobind::ReturnAsync>("finalizeAsync");

  m.def<AudioDecoderContext>("AudioDecoderContext")
      .cons<const Stream &>()
      .def<&AudioDecoderContext::sampleRate>("sampleRate")
      .def<&AudioDecoderContext::setSampleRate>("setSampleRate")
      .def<&AudioDecoderContext::timeBase>("timeBase")
      .def<&AudioDecoderContext::setTimeBase>("setTimeBase")
      .def<&AudioDecoderContext::bitRate>("bitRate")
      .def<&AudioDecoderContext::setBitRate>("setBitRate")
      .def<&AudioDecoderContext::sampleFormat>("sampleFormat")
      .def<&AudioDecoderContext::setSampleFormat>("setSampleFormat")
      .def<&AudioDecoderContext::channelLayout>("channelLayout")
      .def<static_cast<void (av::AudioCodecContext<AudioDecoderContext, Direction::Decoding>::*)(ChannelLayout)>(
          &AudioDecoderContext::setChannelLayout)>("setChannelLayout")
      .def<&AudioDecoderContext::isRefCountedFrames>("isRefCountedFrames")
      .def<&AudioDecoderContext::setRefCountedFrames>("setRefCountedFrames")
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&AudioDecoderContext::open)>("open")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&AudioDecoderContext::open)>(
          "openCodec")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoDecoderContext::open),
           Nobind::ReturnAsync>("openCodecAsync")
      .def<static_cast<AudioSamples (AudioDecoderContext::*)(const Packet &, OptionalErrorCode)>(
          &AudioDecoderContext::decode)>("decode")
      .def<static_cast<AudioSamples (AudioDecoderContext::*)(const Packet &, OptionalErrorCode)>(
               &AudioDecoderContext::decode),
           Nobind::ReturnAsync>("decodeAsync");

  m.def<AudioEncoderContext>("AudioEncoderContext")
      .cons<>()
      .cons<const Stream &>()
      .cons<const Codec &>()
      .def<&AudioEncoderContext::sampleRate>("sampleRate")
      .def<&AudioEncoderContext::setSampleRate>("setSampleRate")
      .def<&AudioEncoderContext::timeBase>("timeBase")
      .def<&AudioEncoderContext::setTimeBase>("setTimeBase")
      .def<&AudioEncoderContext::setBitRate>("setBitRate")
      .def<&AudioEncoderContext::bitRate>("bitRate")
      .def<&AudioEncoderContext::setBitRate>("setBitRate")
      .def<&AudioEncoderContext::sampleFormat>("sampleFormat")
      .def<&AudioEncoderContext::setSampleFormat>("setSampleFormat")
      .def<&AudioEncoderContext::channelLayout>("channelLayout")
      .def<static_cast<void (av::AudioCodecContext<AudioEncoderContext, Direction::Encoding>::*)(ChannelLayout)>(
          &AudioEncoderContext::setChannelLayout)>("setChannelLayout")
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&AudioEncoderContext::open)>("open")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&AudioEncoderContext::open)>(
          "openCodec")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoDecoderContext::open),
           Nobind::ReturnAsync>("openCodecAsync")
      .def<static_cast<Packet (AudioEncoderContext::*)(const AudioSamples &, OptionalErrorCode)>(
          &AudioEncoderContext::encode)>("encode")
      .def<static_cast<Packet (AudioEncoderContext::*)(const AudioSamples &, OptionalErrorCode)>(
               &AudioEncoderContext::encode),
           Nobind::ReturnAsync>("encodeAsync")
      .def<static_cast<Packet (AudioEncoderContext::*)(OptionalErrorCode)>(&AudioEncoderContext::encode)>("finalize")
      .def<static_cast<Packet (AudioEncoderContext::*)(OptionalErrorCode)>(&AudioEncoderContext::encode),
           Nobind::ReturnAsync>("finalizeAsync");

  m.def<OutputFormat>("OutputFormat")
      .cons<>()
      .def<static_cast<bool (OutputFormat::*)(const std::string &, const std::string &, const std::string &)>(
          &OutputFormat::setFormat)>("setFormat");

  m.def<Codec>("Codec").cons<>().def<&Codec::name>("name");

  m.def<PixelFormat>("PixelFormat")
          .cons<const std::string &>()
          .def<&PixelFormat::name>("name")
          .def<&PixelFormat::planesCount>("planesCount")
          .def<&PixelFormat::bitsPerPixel>("bitsPerPixel")
          .ext<&ToString<PixelFormat>>("toString")
          .def < &PixelFormat::operator AVPixelFormat>("get");

  m.def<SampleFormat>("SampleFormat")
          .cons<const std::string &>()
          .def<&SampleFormat::name>("name")
          .def<&SampleFormat::bytesPerSample>("bytesPerSample")
          .def<&SampleFormat::bitsPerSample>("bitsPerSample")
          .ext<&ToString<SampleFormat>>("toString")
          .def < &SampleFormat::operator AVSampleFormat>("get");

  m.def<ChannelLayout>("ChannelLayout")
      .cons<int>()
      .cons<const char *>()
      .def<&ChannelLayout::channels>("channels")
      .def<&ChannelLayout::layout>("layout");

  m.def<Stream>("Stream")
      .def<&Stream::isNull>("isNull")
      .def<&Stream::isValid>("isValid")
      .def<&Stream::isVideo>("isVideo")
      .def<&Stream::isAudio>("isAudio")
      .def<&Stream::isSubtitle>("isSubtitle")
      .def<&Stream::isData>("isData")
      .def<&Stream::duration>("duration")
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
      // Every global function can also be registered as a static class method
      .def<&CreateVideoFrame>("create")
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
      .ext<&ReturnBuffer<VideoFrame>>("data")
      .ext<&ToString<VideoFrame>>("toString");

  m.def<AudioSamples>("AudioSamples")
      .def<&CreateAudioSamples>("create")
      .def<&AudioSamples::isNull>("isNull")
      .def<&AudioSamples::isComplete>("isComplete")
      .def<&AudioSamples::pts>("pts")
      .def<static_cast<void (av::Frame<av::AudioSamples>::*)(const Timestamp &)>(&AudioSamples::setPts)>("setPts")
      .def<&AudioSamples::timeBase>("timeBase")
      .def<&AudioSamples::setTimeBase>("setTimeBase")
      .def<&AudioSamples::sampleRate>("sampleRate")
      .def<&AudioSamples::sampleBitDepth>("sampleBitDepth")
      .def<&AudioSamples::isValid>("isValid")
      .def<&AudioSamples::sampleFormat>("sampleFormat")
      .def<&AudioSamples::channelsCount>("channelsCount")
      .def<&AudioSamples::channelsLayout>("channelsLayout")
      .def<&AudioSamples::channelsLayoutString>("channelsLayoutString")
      .def<static_cast<size_t (av::Frame<av::AudioSamples>::*)() const>(&AudioSamples::size)>("size")
      .def<&AudioSamples::isReferenced>("isReferenced")
      .def<&AudioSamples::refCount>("refCount")
      .def<&AudioSamples::streamIndex>("streamIndex")
      .def<&AudioSamples::setStreamIndex>("setStreamIndex")
      .ext<&ReturnBuffer<AudioSamples>>("data")
      .ext<&ReturnBufferPlane<AudioSamples>>("dataPlane")
      .ext<&ToString<AudioSamples>>("toString");

  m.def<Timestamp>("Timestamp")
      .cons<int64_t, const Rational &>()
      .def<&Timestamp::seconds>("seconds")
      .def<&Timestamp::isNoPts>("isNoPts")
      .def<&Timestamp::isValid>("isValid")
      .def<&Timestamp::operator+= >("addTo")
      .def<&Timestamp::operator-= >("subFrom")
      .def<&Timestamp::timebase>("timebase")
      .ext<&ToString<Timestamp>>("toString");

  m.def<Rational>("Rational").cons<int, int>().ext<&ToString<Rational>>("toString");

  m.def<&SetLogLevel>("setLogLevel");
  av::init();
#ifdef DEBUG
  av::setFFmpegLoggingLevel(AV_LOG_DEBUG);
#else
  av::setFFmpegLoggingLevel(AV_LOG_WARNING);
#endif
}
