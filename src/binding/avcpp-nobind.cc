#include <audioresampler.h>
#include <av.h>
#include <avutils.h>
#include <codec.h>
#include <codeccontext.h>
#include <ffmpeg.h>
#include <filters/buffersink.h>
#include <filters/buffersrc.h>
#include <filters/filtergraph.h>
#include <format.h>
#include <formatcontext.h>
#include <packet.h>
#include <videorescaler.h>

#include <nobind.h>

#include "avcpp-customio.h"
#include "avcpp-frame.h"
#include "avcpp-types.h"
#include "instance-data.h"

using namespace av;

// A define to register constants in the global namespace of the JS module
// (these use an artificial type that holds an uint64_t and is converted to BigInt)
#define REGISTER_CONSTANT(TYPE, CONST, NAME)                                                                           \
  constexpr static TYPE __const_##CONST{static_cast<TYPE>(CONST)};                                                     \
  m.def<&__const_##CONST, Nobind::ReadOnly>(NAME);
#define REGISTER_ENUM(ENUM, ID)                                                                                        \
  constexpr static int64_t __const_##ID{static_cast<int64_t>(ENUM::ID)};                                               \
  m.def<&__const_##ID, Nobind::ReadOnly>(#ENUM "_" #ID);

// An universal toString() wrapper, to be used as a class extension
template <typename T> std::string ToString(T &v) {
  std::stringstream r;
  r << v;
  return r.str();
}
// The type of a pointer to the previous function, required for MSVC
template <typename T> using ToString_t = std::string (*)(T &v);

void SetLogLevel(int64_t loglevel) { av::setFFmpegLoggingLevel(loglevel); }

constexpr auto ReturnNullAsync = Nobind::ReturnAsync | Nobind::ReturnNullAccept;

// A helper to create both sync and async versions of a method
#define WASYNC(NAME) NAME, NAME "Async"

NOBIND_MODULE_DATA(ffmpeg, m, ffmpegInstanceData) {
  // This trick allows to have distinct TS types that all resolve to number in JS
  m.typescript_fragment("declare const __ffmpeg_tag_type : unique symbol;\n");

  // Forward declarations for TypeScript support
  m.decl<OutputFormat>("OutputFormat");
  m.decl<Codec>("Codec");
  m.decl<InputFormat>("InputFormat");
  m.decl<Stream>("Stream");
  m.def<CodecContext2>("CodecContext");
  m.decl<VideoEncoderContext>("VideoEncoderContext");
  m.decl<AudioEncoderContext>("AudioEncoderContext");
  m.decl<VideoDecoderContext>("VideoDecoderContext");
  m.decl<AudioDecoderContext>("AudioDecoderContext");
  m.decl<FilterContext>("FilterContext");
  m.decl<FormatContext>("FormatContext");
  m.decl<Packet>("Packet");
  m.decl<PixelFormat>("PixelFormat");
  m.decl<Rational>("Rational");
  m.decl<VideoFrame>("VideoFrame");
  m.decl<AudioSamples>("AudioSamples");
  m.decl<SampleFormat>("SampleFormat");
  m.decl<ChannelLayout>("ChannelLayout");
  m.decl<ChannelLayoutView>("ChannelLayoutView");
  m.decl<Timestamp>("Timestamp");

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

  m.typescript_fragment("export type AVPictureType = " + Nobind::Typemap::FromJS<AVPictureType>::TSType() + ";\n");
  m.typescript_fragment("export type AVCodecID = " + Nobind::Typemap::FromJS<AVCodecID>::TSType() + ";\n");
  m.typescript_fragment("export type AVMediaType = " + Nobind::Typemap::FromJS<AVMediaType>::TSType() + ";\n");
  m.typescript_fragment("export type AVPixelFormat = " + Nobind::Typemap::FromJS<AVPixelFormat>::TSType() + ";\n");
  m.typescript_fragment("export type AVSampleFormat = " + Nobind::Typemap::FromJS<AVSampleFormat>::TSType() + ";\n");

// Some important constants
#include "constants"

  m.def<static_cast<Codec (*)(const OutputFormat &, bool)>(&findEncodingCodec)>(WASYNC("findEncodingCodecFormat"));
  m.def<static_cast<Codec (*)(AVCodecID)>(&findEncodingCodec)>(WASYNC("findEncodingCodec"));
  m.def<static_cast<Codec (*)(AVCodecID)>(&findDecodingCodec)>(WASYNC("findDecodingCodec"));

  m.def<FormatContext>("FormatContext")
      .cons<>()
      // Overloaded methods must be cast to be resolved
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openInput)>(
          WASYNC("openInput"))
      .def<static_cast<void (FormatContext::*)(const std::string &, Dictionary &, OptionalErrorCode)>(
          &FormatContext::openInput)>(WASYNC("openInputOptions"))
      .def<static_cast<void (FormatContext::*)(CustomIO *, InputFormat, OptionalErrorCode, size_t)>(
               &FormatContext::openInput),
           Nobind::ReturnAsync>("openWritableAsync")
      .def<&FormatContext::close>(WASYNC("close"))
      .def<static_cast<void (FormatContext::*)(OptionalErrorCode)>(&FormatContext::findStreamInfo)>(
          WASYNC("findStreamInfo"))
      .def<&FormatContext::streamsCount>(WASYNC("streamsCount"))
      .def<static_cast<Stream (FormatContext::*)(size_t)>(&FormatContext::stream)>(WASYNC("stream"))
      // Typical example of registering two overloaded signatures with different names in JavaScript
      .def<static_cast<void (FormatContext::*)(const InputFormat &)>(&FormatContext::setFormat)>(
          WASYNC("setInputFormat"))
      .def<static_cast<void (FormatContext::*)(const OutputFormat &)>(&FormatContext::setFormat)>(
          WASYNC("setOutputFormat"))
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openOutput)>(
          WASYNC("openOutput"))
      .def<static_cast<void (FormatContext::*)(const std::string &, Dictionary &, OptionalErrorCode)>(
          &FormatContext::openOutput)>(WASYNC("openOutputOptions"))
      .def<static_cast<void (FormatContext::*)(CustomIO *, OptionalErrorCode, size_t)>(&FormatContext::openOutput),
           Nobind::ReturnAsync>("openReadableAsync")
      .def<static_cast<Stream (FormatContext::*)(const VideoEncoderContext &, OptionalErrorCode)>(
          &FormatContext::addStream)>(WASYNC("addVideoStream"))
      .def<static_cast<Stream (FormatContext::*)(const AudioEncoderContext &, OptionalErrorCode)>(
          &FormatContext::addStream)>(WASYNC("addAudioStream"))
      .def<static_cast<Stream (FormatContext::*)(OptionalErrorCode)>(&FormatContext::addStream)>(WASYNC("addStream"))
      .def<&FormatContext::dump>(WASYNC("dump"))
      .def<&FormatContext::flush>(WASYNC("flush"))
      .def<static_cast<void (FormatContext::*)(OptionalErrorCode)>(&FormatContext::writeHeader)>(WASYNC("writeHeader"))
      .def<static_cast<void (FormatContext::*)(av::Dictionary &, OptionalErrorCode)>(&FormatContext::writeHeader)>(
          WASYNC("writeHeaderOptions"))
      .def<static_cast<Packet (FormatContext::*)(OptionalErrorCode)>(&FormatContext::readPacket)>(WASYNC("readPacket"))
      .def<static_cast<void (FormatContext::*)(const Packet &, OptionalErrorCode)>(&FormatContext::writePacket)>(
          WASYNC("writePacket"))
      .def<&FormatContext::writeTrailer>(WASYNC("writeTrailer"));

  m.def<VideoDecoderContext, CodecContext2>("VideoDecoderContext")
      .cons<const Stream &>()
      .def<&VideoDecoderContext::codecType>(WASYNC("codecType"))
      .def<&VideoDecoderContext::width>(WASYNC("width"))
      .def<&VideoDecoderContext::height>(WASYNC("height"))
      .def<&VideoDecoderContext::setWidth>(WASYNC("setWidth"))
      .def<&VideoDecoderContext::setHeight>(WASYNC("setHeight"))
      .def<&VideoDecoderContext::pixelFormat>(WASYNC("pixelFormat"))
      .def<&VideoDecoderContext::setPixelFormat>(WASYNC("setPixelFormat"))
      .def<&VideoDecoderContext::timeBase>(WASYNC("timeBase"))
      .def<&VideoDecoderContext::setTimeBase>(WASYNC("setTimeBase"))
      .def<&VideoDecoderContext::bitRate>(WASYNC("bitRate"))
      .def<&VideoDecoderContext::setBitRate>(WASYNC("setBitRate"))
      .def<&VideoDecoderContext::isRefCountedFrames>(WASYNC("isRefCountedFrames"))
      .def<&VideoDecoderContext::setRefCountedFrames>(WASYNC("setRefCountedFrames"))
      .def<&VideoDecoderContext::stream>(WASYNC("stream"))
      .def<&VideoDecoderContext::codec>(WASYNC("codec"))
      .def<&VideoDecoderContext::isFlags>(WASYNC("isFlags"))
      .def<&VideoDecoderContext::addFlags>(WASYNC("addFlags"))
      // This an inherited overloaded method, it must be cast to its base class type
      // C++ does not allow to cast it to the inheriting class type
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&VideoDecoderContext::open)>(WASYNC("open"))
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoDecoderContext::open)>(
          WASYNC("openCodec"))
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
          &VideoDecoderContext::open)>(WASYNC("openCodecOptions"))
      .def<static_cast<VideoFrame (VideoDecoderContext::*)(const Packet &, OptionalErrorCode, bool)>(
          &VideoDecoderContext::decode)>(WASYNC("decode"));

  m.def<VideoEncoderContext, CodecContext2>("VideoEncoderContext")
      .cons<>()
      .cons<const Stream &>()
      .cons<const Codec &>()
      .def<&VideoEncoderContext::codecType>(WASYNC("codecType"))
      .def<&VideoEncoderContext::width>(WASYNC("width"))
      .def<&VideoEncoderContext::height>(WASYNC("height"))
      .def<&VideoEncoderContext::setWidth>(WASYNC("setWidth"))
      .def<&VideoEncoderContext::setHeight>(WASYNC("setHeight"))
      .def<&VideoEncoderContext::pixelFormat>(WASYNC("pixelFormat"))
      .def<&VideoEncoderContext::setPixelFormat>(WASYNC("setPixelFormat"))
      .def<&VideoEncoderContext::timeBase>(WASYNC("timeBase"))
      .def<&VideoEncoderContext::setTimeBase>(WASYNC("setTimeBase"))
      .def<&VideoEncoderContext::bitRate>(WASYNC("bitRate"))
      .def<&VideoEncoderContext::setBitRate>(WASYNC("setBitRate"))
      .def<&VideoEncoderContext::stream>(WASYNC("stream"))
      .def<&VideoEncoderContext::codec>(WASYNC("codec"))
      .def<&VideoEncoderContext::isFlags>(WASYNC("isFlags"))
      .def<&VideoEncoderContext::addFlags>(WASYNC("addFlags"))
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&VideoEncoderContext::open)>(WASYNC("open"))
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoEncoderContext::open)>(
          WASYNC("openCodec"))
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
          &VideoEncoderContext::open)>(WASYNC("openCodecOptions"))
      .def<static_cast<Packet (VideoEncoderContext::*)(const VideoFrame &, OptionalErrorCode)>(
          &VideoEncoderContext::encode)>(WASYNC("encode"))
      .def<static_cast<Packet (VideoEncoderContext::*)(OptionalErrorCode)>(&VideoEncoderContext::encode)>(
          WASYNC("finalize"));

  m.def<AudioDecoderContext, CodecContext2>("AudioDecoderContext")
      .cons<const Stream &>()
      .def<&AudioDecoderContext::codecType>(WASYNC("codecType"))
      .def<&AudioDecoderContext::sampleRate>(WASYNC("sampleRate"))
      .def<&AudioDecoderContext::setSampleRate>(WASYNC("setSampleRate"))
      .def<&AudioDecoderContext::timeBase>(WASYNC("timeBase"))
      .def<&AudioDecoderContext::setTimeBase>(WASYNC("setTimeBase"))
      .def<&AudioDecoderContext::bitRate>(WASYNC("bitRate"))
      .def<&AudioDecoderContext::setBitRate>(WASYNC("setBitRate"))
      .def<&AudioDecoderContext::sampleFormat>(WASYNC("sampleFormat"))
      .def<&AudioDecoderContext::setSampleFormat>(WASYNC("setSampleFormat"))
      .def<&AudioDecoderContext::channelLayout2>(WASYNC("channelLayout"))
      .def<static_cast<void (av::AudioCodecContext<AudioDecoderContext, Direction::Decoding>::*)(ChannelLayout)>(
          &AudioDecoderContext::setChannelLayout)>(WASYNC("setChannelLayout"))
      .def<&AudioDecoderContext::isRefCountedFrames>(WASYNC("isRefCountedFrames"))
      .def<&AudioDecoderContext::setRefCountedFrames>(WASYNC("setRefCountedFrames"))
      .def<&AudioDecoderContext::codec>(WASYNC("codec"))
      .def<&AudioDecoderContext::stream>(WASYNC("stream"))
      .def<&AudioDecoderContext::isFlags>(WASYNC("isFlags"))
      .def<&AudioDecoderContext::addFlags>(WASYNC("addFlags"))
      .def<&AudioDecoderContext::frameSize>(WASYNC("frameSize"))
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&AudioDecoderContext::open)>(WASYNC("open"))
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&AudioDecoderContext::open)>(
          WASYNC("openCodec"))
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
          &AudioDecoderContext::open)>(WASYNC("openCodecOptions"))
      .def<static_cast<AudioSamples (AudioDecoderContext::*)(const Packet &, OptionalErrorCode)>(
          &AudioDecoderContext::decode)>(WASYNC("decode"));

  m.def<AudioEncoderContext, CodecContext2>("AudioEncoderContext")
      .cons<>()
      .cons<const Stream &>()
      .cons<const Codec &>()
      .def<&AudioEncoderContext::codecType>(WASYNC("codecType"))
      .def<&AudioEncoderContext::sampleRate>(WASYNC("sampleRate"))
      .def<&AudioEncoderContext::setSampleRate>(WASYNC("setSampleRate"))
      .def<&AudioEncoderContext::timeBase>(WASYNC("timeBase"))
      .def<&AudioEncoderContext::setTimeBase>(WASYNC("setTimeBase"))
      .def<&AudioEncoderContext::bitRate>(WASYNC("bitRate"))
      .def<&AudioEncoderContext::setBitRate>(WASYNC("setBitRate"))
      .def<&AudioEncoderContext::sampleFormat>(WASYNC("sampleFormat"))
      .def<&AudioEncoderContext::setSampleFormat>(WASYNC("setSampleFormat"))
      .def<&AudioEncoderContext::channelLayout2>(WASYNC("channelLayout"))
      .def<static_cast<void (av::AudioCodecContext<AudioEncoderContext, Direction::Encoding>::*)(ChannelLayout)>(
          &AudioEncoderContext::setChannelLayout)>(WASYNC("setChannelLayout"))
      .def<&AudioEncoderContext::codec>(WASYNC("codec"))
      .def<&AudioEncoderContext::stream>(WASYNC("stream"))
      .def<&AudioEncoderContext::isFlags>(WASYNC("isFlags"))
      .def<&AudioEncoderContext::addFlags>(WASYNC("addFlags"))
      .def<&AudioEncoderContext::frameSize>(WASYNC("frameSize"))
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&AudioEncoderContext::open)>(WASYNC("open"))
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&AudioEncoderContext::open)>(
          WASYNC("openCodec"))
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
          &AudioEncoderContext::open)>(WASYNC("openCodecOptions"))
      .def<static_cast<Packet (AudioEncoderContext::*)(const AudioSamples &, OptionalErrorCode)>(
          &AudioEncoderContext::encode)>(WASYNC("encode"))
      .def<static_cast<Packet (AudioEncoderContext::*)(OptionalErrorCode)>(&AudioEncoderContext::encode)>(
          WASYNC("finalize"));

  m.def<OutputFormat>("OutputFormat")
      .cons<>()
      .def<static_cast<bool (OutputFormat::*)(const std::string &, const std::string &, const std::string &)>(
          &OutputFormat::setFormat)>(WASYNC("setFormat"))
      .def<&OutputFormat::isFlags>(WASYNC("isFlags"));
  m.def<InputFormat>("InputFormat")
      .cons<>()
      .def<static_cast<bool (InputFormat::*)(const std::string &)>(&InputFormat::setFormat)>(WASYNC("setFormat"))
      .def<&InputFormat::isFlags>(WASYNC("isFlags"));

  m.def<Codec>("Codec").cons<>().def<&Codec::name>(WASYNC("name")).def<&Codec::id>(WASYNC("id"));

  m.def<CodecParametersView>("CodecParametersView")
      .cons<>()
      .def<&CodecParametersView::decodingCodec>(WASYNC("decodingCodec"))
      .def<&CodecParametersView::encodingCodec>(WASYNC("encodingCodec"))
      .def<static_cast<uint32_t (CodecParametersView::*)() const>(&CodecParametersView::codecTag)>(WASYNC("codecTag"))
      .def<static_cast<void (CodecParametersView::*)(uint32_t)>(&CodecParametersView::codecTag)>(WASYNC("setCodecTag"));

  m.def<PixelFormat>("PixelFormat")
          .cons<const std::string &>()
          .cons<AVPixelFormat>()
          .def<&PixelFormat::name>(WASYNC("name"))
          .def<&PixelFormat::planesCount>(WASYNC("planesCount"))
          .def<&PixelFormat::bitsPerPixel>(WASYNC("bitsPerPixel"))
          // The static cast is needed to help MSVC with the template argument deduction
          // .ext() uses three-stage deduction with an auto argument in the first stage
          // MSVC picks a function reference instead of a function pointer during this stage
          // and is unable to backtrack when it cannot deduce the second stage
          .ext<static_cast<ToString_t<PixelFormat>>(&ToString<PixelFormat>)>("toString")
          .def < &PixelFormat::operator AVPixelFormat>(WASYNC("get"));

  m.def<SampleFormat>("SampleFormat")
          .cons<const std::string &>()
          .cons<AVSampleFormat>()
          .def<&SampleFormat::name>(WASYNC("name"))
          .def<&SampleFormat::bytesPerSample>(WASYNC("bytesPerSample"))
          .def<&SampleFormat::bitsPerSample>(WASYNC("bitsPerSample"))
          .ext<static_cast<ToString_t<SampleFormat>>(&ToString<SampleFormat>)>("toString")
          .def < &SampleFormat::operator AVSampleFormat>(WASYNC("get"));

  m.def<ChannelLayout>("ChannelLayout")
      .cons<std::bitset<64>>()
      .cons<const char *>()
      .cons<const ChannelLayoutView &>()
      .def<&ChannelLayout::channels>(WASYNC("channels"))
      .def<&ChannelLayout::layout>(WASYNC("layout"))
      .def<&ChannelLayout::isValid>(WASYNC("isValid"))
      .def<static_cast<std::string (ChannelLayoutView::*)() const>(&ChannelLayoutView::describe)>(WASYNC("toString"));

  m.def<ChannelLayoutView>("ChannelLayoutView");

  m.def<Stream>("Stream")
      .def<&Stream::isNull>(WASYNC("isNull"))
      .def<&Stream::isValid>(WASYNC("isValid"))
      .def<&Stream::isVideo>(WASYNC("isVideo"))
      .def<&Stream::isAudio>(WASYNC("isAudio"))
      .def<&Stream::isSubtitle>(WASYNC("isSubtitle"))
      .def<&Stream::isData>(WASYNC("isData"))
      .def<&Stream::duration>(WASYNC("duration"))
      .def<&Stream::frameRate>(WASYNC("frameRate"))
      .def<&Stream::setFrameRate>(WASYNC("setFrameRate"))
      .def<&Stream::timeBase>(WASYNC("timeBase"))
      .def<&Stream::setTimeBase>(WASYNC("setTimeBase"))
      .def<&Stream::mediaType>(WASYNC("mediaType"))
      .def<&Stream::codecParameters>(WASYNC("codecParameters"))
      .def<&Stream::setCodecParameters>(WASYNC("setCodecParameters"));

  m.def<Packet>("Packet")
      .def<&Packet::isNull>(WASYNC("isNull"))
      .def<&Packet::isComplete>(WASYNC("isComplete"))
      .def<&Packet::streamIndex>(WASYNC("streamIndex"))
      .def<&Packet::setStreamIndex>(WASYNC("setStreamIndex"))
      .def<&Packet::size>(WASYNC("size"))
      .def<&Packet::pts>(WASYNC("pts"))
      .def<static_cast<void (Packet::*)(const Timestamp &)>(&Packet::setPts)>(WASYNC("setPts"))
      .def<&Packet::dts>(WASYNC("dts"))
      .def<static_cast<void (Packet::*)(const Timestamp &)>(&Packet::setDts)>(WASYNC("setDts"))
      .def<&Packet::timeBase, Nobind::ReturnNested>(WASYNC("timeBase"));

  m.def<VideoFrame>("VideoFrame")
      .cons()
      .def<&VideoFrame::null>("null")
      // Every global function can also be registered as a static class method
      .def<&CreateVideoFrame>(WASYNC("create"))
      .def<&VideoFrame::isNull>(WASYNC("isNull"))
      .def<&VideoFrame::isComplete>(WASYNC("isComplete"))
      .def<&VideoFrame::setComplete>(WASYNC("setComplete"))
      .def<&VideoFrame::pts>(WASYNC("pts"))
      .def<static_cast<void (av::Frame<av::VideoFrame>::*)(const Timestamp &)>(&VideoFrame::setPts)>(WASYNC("setPts"))
      .def<&VideoFrame::timeBase>(WASYNC("timeBase"))
      .def<&VideoFrame::setTimeBase>(WASYNC("setTimeBase"))
      .def<&VideoFrame::width>(WASYNC("width"))
      .def<&VideoFrame::height>(WASYNC("height"))
      .def<&VideoFrame::isValid>(WASYNC("isValid"))
      .def<&VideoFrame::pixelFormat>(WASYNC("pixelFormat"))
      .def<static_cast<size_t (av::Frame<av::VideoFrame>::*)() const>(&VideoFrame::size)>(WASYNC("size"))
      .def<&VideoFrame::isReferenced>(WASYNC("isReferenced"))
      .def<&VideoFrame::isKeyFrame>(WASYNC("isKeyFrame"))
      .def<&VideoFrame::setKeyFrame>(WASYNC("setKeyFrame"))
      .def<&VideoFrame::refCount>(WASYNC("refCount"))
      .def<&VideoFrame::pictureType>(WASYNC("pictureType"))
      .def<&VideoFrame::setPictureType>(WASYNC("setPictureType"))
      .def<&VideoFrame::setQuality>(WASYNC("setQuality"))
      .def<&VideoFrame::streamIndex>(WASYNC("streamIndex"))
      .def<&VideoFrame::setStreamIndex>(WASYNC("setStreamIndex"))
      .ext<&CopyFrameToBuffer>("data")
      .ext<static_cast<ToString_t<VideoFrame>>(&ToString<VideoFrame>)>("toString");

  m.def<AudioSamples>("AudioSamples")
      .cons<>()
      .def<&AudioSamples::null>("null")
      .def<&CreateAudioSamples>(WASYNC("create"))
      .def<&AudioSamples::isNull>(WASYNC("isNull"))
      .def<&AudioSamples::isComplete>(WASYNC("isComplete"))
      .def<&AudioSamples::pts>(WASYNC("pts"))
      .def<static_cast<void (av::Frame<av::AudioSamples>::*)(const Timestamp &)>(&AudioSamples::setPts)>(
          WASYNC("setPts"))
      .def<&AudioSamples::samplesCount>(WASYNC("samplesCount"))
      .def<&AudioSamples::timeBase>(WASYNC("timeBase"))
      .def<&AudioSamples::setTimeBase>(WASYNC("setTimeBase"))
      .def<&AudioSamples::sampleRate>(WASYNC("sampleRate"))
      .def<&AudioSamples::sampleBitDepth>(WASYNC("sampleBitDepth"))
      .def<&AudioSamples::isValid>(WASYNC("isValid"))
      .def<&AudioSamples::sampleFormat>(WASYNC("sampleFormat"))
      .def<&AudioSamples::channelsCount>(WASYNC("channelsCount"))
      .def<&AudioSamples::channelsLayout>(WASYNC("channelsLayout"))
      .def<&AudioSamples::channelsLayoutString>(WASYNC("channelsLayoutString"))
      .def<static_cast<size_t (av::Frame<av::AudioSamples>::*)() const>(&AudioSamples::size)>(WASYNC("size"))
      .def<&AudioSamples::isReferenced>(WASYNC("isReferenced"))
      .def<&AudioSamples::refCount>(WASYNC("refCount"))
      .def<&AudioSamples::streamIndex>(WASYNC("streamIndex"))
      .def<&AudioSamples::setStreamIndex>(WASYNC("setStreamIndex"))
      .ext<static_cast<Nobind::Typemap::Buffer (*)(AudioSamples &, size_t)>(&ReturnBufferPlane<AudioSamples>)>("data")
      .ext<static_cast<ToString_t<AudioSamples>>(&ToString<AudioSamples>)>("toString");

  m.def<Timestamp>("Timestamp")
      .cons<int64_t, const Rational &>()
      .def<&Timestamp::seconds>(WASYNC("seconds"))
      .def<&Timestamp::isNoPts>(WASYNC("isNoPts"))
      .def<&Timestamp::isValid>(WASYNC("isValid"))
      .def<&Timestamp::operator+= >(WASYNC("addTo"))
      .def<&Timestamp::operator-= >(WASYNC("subFrom"))
      .def<&Timestamp::timebase>(WASYNC("timebase"))
      .ext<static_cast<ToString_t<Timestamp>>(&ToString<Timestamp>)>("toString");

  m.def<Rational>("Rational").cons<int, int>().ext<static_cast<ToString_t<Rational>>(&ToString<Rational>)>("toString");

  m.def<VideoRescaler>("VideoRescaler")
      .cons<int, int, PixelFormat, int, int, PixelFormat, int>()
      .def<&VideoRescaler::srcWidth>(WASYNC("srcWidth"))
      .def<&VideoRescaler::srcHeight>(WASYNC("srcHeight"))
      .def<&VideoRescaler::srcPixelFormat>(WASYNC("srcPixelFormat"))
      .def<&VideoRescaler::dstWidth>(WASYNC("dstWidth"))
      .def<&VideoRescaler::dstHeight>(WASYNC("dstHeight"))
      .def<&VideoRescaler::dstPixelFormat>(WASYNC("dstPixelFormat"))
      .def<static_cast<VideoFrame (VideoRescaler::*)(const VideoFrame &, OptionalErrorCode)>(&VideoRescaler::rescale)>(
          WASYNC("rescale"));

  m.def<AudioResampler>("AudioResampler")
      .cons<uint64_t, int, SampleFormat, uint64_t, int, SampleFormat>()
      .def<&AudioResampler::dstChannelLayout>(WASYNC("dstChannelLayout"))
      .def<&AudioResampler::dstChannels>(WASYNC("dstChannels"))
      .def<&AudioResampler::dstSampleRate>(WASYNC("dstSampleRate"))
      .def<&AudioResampler::srcSampleFormat>(WASYNC("srcSampleFormat"))
      .def<&AudioResampler::srcChannelLayout>(WASYNC("srcChannelLayout"))
      .def<&AudioResampler::srcChannels>(WASYNC("srcChannels"))
      .def<&AudioResampler::srcSampleRate>(WASYNC("srcSampleRate"))
      .def<&AudioResampler::push>(WASYNC("push"))
      .def<static_cast<AudioSamples (AudioResampler::*)(size_t, OptionalErrorCode)>(&AudioResampler::pop)>(
          WASYNC("pop"));

  m.def<Filter>("Filter").cons<const char *>();

  m.def<FilterGraph>("FilterGraph")
      .cons<>()
      .def<&FilterGraph::createFilter>(WASYNC("createFilter"))
      .def<static_cast<void (FilterGraph::*)(const std::string &, OptionalErrorCode)>(&FilterGraph::parse)>(
          WASYNC("parse"))
      .def<&FilterGraph::config>(WASYNC("config"))
      .def<static_cast<FilterContext (FilterGraph::*)(const std::string &, OptionalErrorCode)>(&FilterGraph::filter)>(
          WASYNC("filter"));

  m.def<FilterContext>("FilterContext");

  // We only export the safer API that copies frames for now
  m.def<BufferSrcFilterContext>("BufferSrcFilterContext")
      .cons<FilterContext &>()
      .def<static_cast<void (BufferSrcFilterContext::*)(const VideoFrame &, OptionalErrorCode)>(
          &BufferSrcFilterContext::writeVideoFrame)>(WASYNC("writeVideoFrame"))
      .def<static_cast<void (BufferSrcFilterContext::*)(const AudioSamples &, OptionalErrorCode)>(
          &BufferSrcFilterContext::writeAudioSamples)>(WASYNC("writeAudioSamples"))
      .def<static_cast<void (BufferSrcFilterContext::*)(const VideoFrame &, OptionalErrorCode)>(
          &BufferSrcFilterContext::writeVideoFrame)>(WASYNC("writeVideoFrame"))
      .def<static_cast<void (BufferSrcFilterContext::*)(const AudioSamples &, OptionalErrorCode)>(
          &BufferSrcFilterContext::writeAudioSamples)>(WASYNC("writeAudioSamples"))
      .def<&BufferSrcFilterContext::checkFilter>(WASYNC("checkFilter"));

  m.def<BufferSinkFilterContext>("BufferSinkFilterContext")
      .cons<FilterContext &>()
      .ext<&GetVideoFrame, Nobind::ReturnNullAccept>("getVideoFrame")
      .ext<&GetAudioFrame, Nobind::ReturnNullAccept>("getAudioFrame")
      .def<&BufferSinkFilterContext::setFrameSize>(WASYNC("setFrameSize"))
      .def<&BufferSinkFilterContext::frameRate>(WASYNC("frameRate"))
      .def<&BufferSinkFilterContext::checkFilter>(WASYNC("checkFilter"))
      .typescript_fragment("  getAudioFrameAsync(): Promise<AudioSamples | null>;\n")
      .typescript_fragment("  getVideoFrameAsync(): Promise<VideoFrame | null>;\n");
  // These are the async versions of the BufferSink functions
  // which are global because of the limitations of Nobind
  // we patch them at runtime in JS
  m.def<&GetAudioFrame, ReturnNullAsync>("_getAudioFrameAsync");
  m.def<&GetVideoFrame, ReturnNullAsync>("_getVideoFrameAsync");

  REGISTER_ENUM(FilterMediaType, Unknown);
  REGISTER_ENUM(FilterMediaType, Audio);
  REGISTER_ENUM(FilterMediaType, Video);

  m.Exports().Set("WritableCustomIO", WritableCustomIO::GetClass(m.Env()));
  m.Exports().Set("ReadableCustomIO", ReadableCustomIO::GetClass(m.Env()));

  m.Env().GetInstanceData<Nobind::EnvInstanceData<ffmpegInstanceData>>()->v8_main_thread = std::this_thread::get_id();

  m.def<&SetLogLevel>("setLogLevel");
  av::init();
#ifdef DEBUG
  av::setFFmpegLoggingLevel(AV_LOG_DEBUG);
#else
  av::setFFmpegLoggingLevel(AV_LOG_WARNING);
#endif
}
