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

template <typename T> bool True(T &) { return true; }
template <typename T> bool False(T &) { return false; }

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

  m.def<static_cast<Codec (*)(const OutputFormat &, bool)>(&findEncodingCodec)>("findEncodingCodecFormat");
  m.def<static_cast<Codec (*)(AVCodecID)>(&findEncodingCodec)>("findEncodingCodec");
  m.def<static_cast<Codec (*)(AVCodecID)>(&findDecodingCodec)>("findDecodingCodec");

  m.def<FormatContext>("FormatContext")
      .cons<>()
      // Overloaded methods must be cast to be resolved
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openInput)>(
          "openInput")
      .def<static_cast<void (FormatContext::*)(const std::string &, OptionalErrorCode)>(&FormatContext::openInput),
           Nobind::ReturnAsync>("openInputAsync")
      .def<static_cast<void (FormatContext::*)(const std::string &, Dictionary &, OptionalErrorCode)>(
          &FormatContext::openInput)>("openInputOptions")
      .def<static_cast<void (FormatContext::*)(const std::string &, Dictionary &, OptionalErrorCode)>(
               &FormatContext::openInput),
           Nobind::ReturnAsync>("openInputOptionsAsync")
      .def<static_cast<void (FormatContext::*)(CustomIO *, InputFormat, OptionalErrorCode, size_t)>(
               &FormatContext::openInput),
           Nobind::ReturnAsync>("openWritableAsync")
      .def<&FormatContext::close>("close")
      .def<&FormatContext::close, Nobind::ReturnAsync>("closeAsync")
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
      .def<static_cast<void (FormatContext::*)(const std::string &, Dictionary &, OptionalErrorCode)>(
          &FormatContext::openOutput)>("openOutputOptions")
      .def<static_cast<void (FormatContext::*)(const std::string &, Dictionary &, OptionalErrorCode)>(
               &FormatContext::openOutput),
           Nobind::ReturnAsync>("openOutputOptionsAsync")
      .def<static_cast<void (FormatContext::*)(CustomIO *, OptionalErrorCode, size_t)>(&FormatContext::openOutput),
           Nobind::ReturnAsync>("openReadableAsync")
      .def<static_cast<Stream (FormatContext::*)(const VideoEncoderContext &, OptionalErrorCode)>(
          &FormatContext::addStream)>("addVideoStream")
      .def<static_cast<Stream (FormatContext::*)(const AudioEncoderContext &, OptionalErrorCode)>(
          &FormatContext::addStream)>("addAudioStream")
      .def<static_cast<Stream (FormatContext::*)(OptionalErrorCode)>(&FormatContext::addStream)>("addStream")
      .def<&FormatContext::dump>("dump")
      .def<&FormatContext::dump, Nobind::ReturnAsync>("dumpAsync")
      .def<&FormatContext::flush>("flush")
      .def<&FormatContext::flush, Nobind::ReturnAsync>("flushAsync")
      .def<static_cast<void (FormatContext::*)(OptionalErrorCode)>(&FormatContext::writeHeader)>("writeHeader")
      .def<static_cast<void (FormatContext::*)(OptionalErrorCode)>(&FormatContext::writeHeader), Nobind::ReturnAsync>(
          "writeHeaderAsync")
      .def<static_cast<void (FormatContext::*)(av::Dictionary &, OptionalErrorCode)>(&FormatContext::writeHeader)>(
          "writeHeaderOptions")
      .def<static_cast<void (FormatContext::*)(av::Dictionary &, OptionalErrorCode)>(&FormatContext::writeHeader),
           Nobind::ReturnAsync>("writeHeaderOptionsAsync")
      .def<static_cast<Packet (FormatContext::*)(OptionalErrorCode)>(&FormatContext::readPacket)>("readPacket")
      .def<static_cast<Packet (FormatContext::*)(OptionalErrorCode)>(&FormatContext::readPacket), Nobind::ReturnAsync>(
          "readPacketAsync")
      .def<static_cast<void (FormatContext::*)(const Packet &, OptionalErrorCode)>(&FormatContext::writePacket)>(
          "writePacket")
      .def<static_cast<void (FormatContext::*)(const Packet &, OptionalErrorCode)>(&FormatContext::writePacket),
           Nobind::ReturnAsync>("writePacketAsync")
      .def<&FormatContext::writeTrailer>("writeTrailer")
      .def<&FormatContext::writeTrailer, Nobind::ReturnAsync>("writeTrailerAsync");

  m.def<VideoDecoderContext, CodecContext2>("VideoDecoderContext")
      .cons<const Stream &>()
      .def<&VideoDecoderContext::codecType>("codecType")
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
      .def<&VideoDecoderContext::stream>("stream")
      .def<&VideoDecoderContext::codec>("codec")
      .def<&VideoDecoderContext::isFlags>("isFlags")
      .def<&VideoDecoderContext::addFlags>("addFlags")
      // This an inherited overloaded method, it must be cast to its base class type
      // C++ does not allow to cast it to the inheriting class type
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&VideoDecoderContext::open)>("open")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoDecoderContext::open)>(
          "openCodec")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoDecoderContext::open),
           Nobind::ReturnAsync>("openCodecAsync")
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
          &VideoDecoderContext::open)>("openCodecOptions")
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
               &VideoDecoderContext::open),
           Nobind::ReturnAsync>("openCodecOptionsAsync")
      .def<static_cast<VideoFrame (VideoDecoderContext::*)(const Packet &, OptionalErrorCode, bool)>(
          &VideoDecoderContext::decode)>("decode")
      .def<static_cast<VideoFrame (VideoDecoderContext::*)(const Packet &, OptionalErrorCode, bool)>(
               &VideoDecoderContext::decode),
           Nobind::ReturnAsync>("decodeAsync")
      .ext<False<VideoDecoderContext>>("isAudio")
      .ext<True<VideoDecoderContext>>("isVideo");

  m.def<VideoEncoderContext, CodecContext2>("VideoEncoderContext")
      .cons<>()
      .cons<const Stream &>()
      .cons<const Codec &>()
      .def<&VideoEncoderContext::codecType>("codecType")
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
      .def<&VideoEncoderContext::stream>("stream")
      .def<&VideoEncoderContext::codec>("codec")
      .def<&VideoEncoderContext::isFlags>("isFlags")
      .def<&VideoEncoderContext::addFlags>("addFlags")
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&VideoEncoderContext::open)>("open")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoEncoderContext::open)>(
          "openCodec")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoEncoderContext::open),
           Nobind::ReturnAsync>("openCodecAsync")
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
          &VideoEncoderContext::open)>("openCodecOptions")
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
               &VideoEncoderContext::open),
           Nobind::ReturnAsync>("openCodecOptionsAsync")
      .def<static_cast<Packet (VideoEncoderContext::*)(const VideoFrame &, OptionalErrorCode)>(
          &VideoEncoderContext::encode)>("encode")
      .def<static_cast<Packet (VideoEncoderContext::*)(const VideoFrame &, OptionalErrorCode)>(
               &VideoEncoderContext::encode),
           Nobind::ReturnAsync>("encodeAsync")
      .def<static_cast<Packet (VideoEncoderContext::*)(OptionalErrorCode)>(&VideoEncoderContext::encode)>("finalize")
      .def<static_cast<Packet (VideoEncoderContext::*)(OptionalErrorCode)>(&VideoEncoderContext::encode),
           Nobind::ReturnAsync>("finalizeAsync")
      .ext<False<VideoEncoderContext>>("isAudio")
      .ext<True<VideoEncoderContext>>("isVideo");

  m.def<AudioDecoderContext, CodecContext2>("AudioDecoderContext")
      .cons<const Stream &>()
      .def<&AudioDecoderContext::codecType>("codecType")
      .def<&AudioDecoderContext::sampleRate>("sampleRate")
      .def<&AudioDecoderContext::setSampleRate>("setSampleRate")
      .def<&AudioDecoderContext::timeBase>("timeBase")
      .def<&AudioDecoderContext::setTimeBase>("setTimeBase")
      .def<&AudioDecoderContext::bitRate>("bitRate")
      .def<&AudioDecoderContext::setBitRate>("setBitRate")
      .def<&AudioDecoderContext::sampleFormat>("sampleFormat")
      .def<&AudioDecoderContext::setSampleFormat>("setSampleFormat")
      .def<&AudioDecoderContext::channelLayout2>("channelLayout")
      .def<static_cast<void (av::AudioCodecContext<AudioDecoderContext, Direction::Decoding>::*)(ChannelLayout)>(
          &AudioDecoderContext::setChannelLayout)>("setChannelLayout")
      .def<&AudioDecoderContext::isRefCountedFrames>("isRefCountedFrames")
      .def<&AudioDecoderContext::setRefCountedFrames>("setRefCountedFrames")
      .def<&AudioDecoderContext::codec>("codec")
      .def<&AudioDecoderContext::stream>("stream")
      .def<&AudioDecoderContext::isFlags>("isFlags")
      .def<&AudioDecoderContext::addFlags>("addFlags")
      .def<&AudioDecoderContext::frameSize>("frameSize")
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&AudioDecoderContext::open)>("open")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&AudioDecoderContext::open)>(
          "openCodec")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&VideoDecoderContext::open),
           Nobind::ReturnAsync>("openCodecAsync")
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
          &AudioDecoderContext::open)>("openCodecOptions")
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
               &AudioDecoderContext::open),
           Nobind::ReturnAsync>("openCodecOptionsAsync")
      .def<static_cast<AudioSamples (AudioDecoderContext::*)(const Packet &, OptionalErrorCode)>(
          &AudioDecoderContext::decode)>("decode")
      .def<static_cast<AudioSamples (AudioDecoderContext::*)(const Packet &, OptionalErrorCode)>(
               &AudioDecoderContext::decode),
           Nobind::ReturnAsync>("decodeAsync")
      .ext<True<AudioDecoderContext>>("isAudio")
      .ext<False<AudioDecoderContext>>("isVideo");

  m.def<AudioEncoderContext, CodecContext2>("AudioEncoderContext")
      .cons<>()
      .cons<const Stream &>()
      .cons<const Codec &>()
      .def<&AudioEncoderContext::codecType>("codecType")
      .def<&AudioEncoderContext::sampleRate>("sampleRate")
      .def<&AudioEncoderContext::setSampleRate>("setSampleRate")
      .def<&AudioEncoderContext::timeBase>("timeBase")
      .def<&AudioEncoderContext::setTimeBase>("setTimeBase")
      .def<&AudioEncoderContext::bitRate>("bitRate")
      .def<&AudioEncoderContext::setBitRate>("setBitRate")
      .def<&AudioEncoderContext::sampleFormat>("sampleFormat")
      .def<&AudioEncoderContext::setSampleFormat>("setSampleFormat")
      .def<&AudioEncoderContext::channelLayout2>("channelLayout")
      .def<static_cast<void (av::AudioCodecContext<AudioEncoderContext, Direction::Encoding>::*)(ChannelLayout)>(
          &AudioEncoderContext::setChannelLayout)>("setChannelLayout")
      .def<&AudioEncoderContext::codec>("codec")
      .def<&AudioEncoderContext::stream>("stream")
      .def<&AudioEncoderContext::isFlags>("isFlags")
      .def<&AudioEncoderContext::addFlags>("addFlags")
      .def<&AudioEncoderContext::frameSize>("frameSize")
      .def<static_cast<void (av::CodecContext2::*)(OptionalErrorCode)>(&AudioEncoderContext::open)>("open")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&AudioEncoderContext::open)>(
          "openCodec")
      .def<static_cast<void (av::CodecContext2::*)(const Codec &, OptionalErrorCode)>(&AudioEncoderContext::open),
           Nobind::ReturnAsync>("openCodecAsync")
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
          &AudioEncoderContext::open)>("openCodecOptions")
      .def<static_cast<void (av::CodecContext2::*)(Dictionary &, const Codec &, OptionalErrorCode)>(
               &AudioEncoderContext::open),
           Nobind::ReturnAsync>("openCodecOptionsAsync")
      .def<static_cast<Packet (AudioEncoderContext::*)(const AudioSamples &, OptionalErrorCode)>(
          &AudioEncoderContext::encode)>("encode")
      .def<static_cast<Packet (AudioEncoderContext::*)(const AudioSamples &, OptionalErrorCode)>(
               &AudioEncoderContext::encode),
           Nobind::ReturnAsync>("encodeAsync")
      .def<static_cast<Packet (AudioEncoderContext::*)(OptionalErrorCode)>(&AudioEncoderContext::encode)>("finalize")
      .def<static_cast<Packet (AudioEncoderContext::*)(OptionalErrorCode)>(&AudioEncoderContext::encode),
           Nobind::ReturnAsync>("finalizeAsync")
      .ext<True<AudioEncoderContext>>("isAudio")
      .ext<False<AudioEncoderContext>>("isVideo");

  m.def<OutputFormat>("OutputFormat")
      .cons<>()
      .def<static_cast<bool (OutputFormat::*)(const std::string &, const std::string &, const std::string &)>(
          &OutputFormat::setFormat)>("setFormat")
      .def<&OutputFormat::isFlags>("isFlags");
  m.def<InputFormat>("InputFormat")
      .cons<>()
      .def<static_cast<bool (InputFormat::*)(const std::string &)>(&InputFormat::setFormat)>("setFormat")
      .def<&InputFormat::isFlags>("isFlags");

  m.def<Codec>("Codec").cons<>().def<&Codec::name>("name").def<&Codec::id>("id");

  m.def<CodecParametersView>("CodecParametersView")
      .cons<>()
      .def<&CodecParametersView::decodingCodec>("decodingCodec")
      .def<&CodecParametersView::encodingCodec>("encodingCodec")
      .def<static_cast<uint32_t (CodecParametersView::*)() const>(&CodecParametersView::codecTag)>("codecTag")
      .def<static_cast<void (CodecParametersView::*)(uint32_t)>(&CodecParametersView::codecTag)>("setCodecTag");

  m.def<PixelFormat>("PixelFormat")
          .cons<const std::string &>()
          .cons<AVPixelFormat>()
          .def<&PixelFormat::name>("name")
          .def<&PixelFormat::planesCount>("planesCount")
          .def<&PixelFormat::bitsPerPixel>("bitsPerPixel")
          // The static cast is needed to help MSVC with the template argument deduction
          // .ext() uses three-stage deduction with an auto argument in the first stage
          // MSVC picks a function reference instead of a function pointer during this stage
          // and is unable to backtrack when it cannot deduce the second stage
          .ext<static_cast<ToString_t<PixelFormat>>(&ToString<PixelFormat>)>("toString")
          .def < &PixelFormat::operator AVPixelFormat>("get");

  m.def<SampleFormat>("SampleFormat")
          .cons<const std::string &>()
          .cons<AVSampleFormat>()
          .def<&SampleFormat::name>("name")
          .def<&SampleFormat::bytesPerSample>("bytesPerSample")
          .def<&SampleFormat::bitsPerSample>("bitsPerSample")
          .ext<static_cast<ToString_t<SampleFormat>>(&ToString<SampleFormat>)>("toString")
          .def < &SampleFormat::operator AVSampleFormat>("get");

  m.def<ChannelLayout>("ChannelLayout")
      .cons<std::bitset<64>>()
      .cons<const char *>()
      .cons<const ChannelLayoutView &>()
      .def<&ChannelLayout::channels>("channels")
      .def<&ChannelLayout::layout>("layout")
      .def<&ChannelLayout::isValid>("isValid")
      .def<static_cast<std::string (ChannelLayoutView::*)() const>(&ChannelLayoutView::describe)>("toString");

  m.def<ChannelLayoutView>("ChannelLayoutView");

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
      .def<&Stream::mediaType>("mediaType")
      .def<&Stream::codecParameters>("codecParameters")
      .def<&Stream::setCodecParameters>("setCodecParameters");

  m.def<Packet>("Packet")
      .def<&Packet::isNull>("isNull")
      .def<&Packet::isComplete>("isComplete")
      .def<&Packet::streamIndex>("streamIndex")
      .def<&Packet::setStreamIndex>("setStreamIndex")
      .def<&Packet::size>("size")
      .def<&Packet::pts>("pts")
      .def<static_cast<void (Packet::*)(const Timestamp &)>(&Packet::setPts)>("setPts")
      .def<&Packet::dts>("dts")
      .def<static_cast<void (Packet::*)(const Timestamp &)>(&Packet::setDts)>("setDts")
      .def<&Packet::timeBase, Nobind::ReturnNested>("timeBase");

  m.def<VideoFrame>("VideoFrame")
      .cons()
      .def<&VideoFrame::null>("null")
      // Every global function can also be registered as a static class method
      .def<&CreateVideoFrame>("create")
      .def<&VideoFrame::isNull>("isNull")
      .def<&VideoFrame::isComplete>("isComplete")
      .def<&VideoFrame::setComplete>("setComplete")
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
      .def<&VideoFrame::setQuality>("setQuality")
      .def<&VideoFrame::streamIndex>("streamIndex")
      .def<&VideoFrame::setStreamIndex>("setStreamIndex")
      .ext<&CopyFrameToBuffer>("data")
      .ext<static_cast<ToString_t<VideoFrame>>(&ToString<VideoFrame>)>("toString");

  m.def<AudioSamples>("AudioSamples")
      .cons<>()
      .def<&AudioSamples::null>("null")
      .def<&CreateAudioSamples>("create")
      .def<&AudioSamples::isNull>("isNull")
      .def<&AudioSamples::isComplete>("isComplete")
      .def<&AudioSamples::pts>("pts")
      .def<static_cast<void (av::Frame<av::AudioSamples>::*)(const Timestamp &)>(&AudioSamples::setPts)>("setPts")
      .def<&AudioSamples::samplesCount>("samplesCount")
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
      .ext<static_cast<Nobind::Typemap::Buffer (*)(AudioSamples &, size_t)>(&ReturnBufferPlane<AudioSamples>)>("data")
      .ext<static_cast<ToString_t<AudioSamples>>(&ToString<AudioSamples>)>("toString");

  m.def<Timestamp>("Timestamp")
      .cons<int64_t, const Rational &>()
      .def<&Timestamp::seconds>("seconds")
      .def<&Timestamp::isNoPts>("isNoPts")
      .def<&Timestamp::isValid>("isValid")
      .def<&Timestamp::operator+= >("addTo")
      .def<&Timestamp::operator-= >("subFrom")
      .def<&Timestamp::timebase>("timebase")
      .ext<static_cast<ToString_t<Timestamp>>(&ToString<Timestamp>)>("toString");

  m.def<Rational>("Rational").cons<int, int>().ext<static_cast<ToString_t<Rational>>(&ToString<Rational>)>("toString");

  m.def<VideoRescaler>("VideoRescaler")
      .cons<int, int, PixelFormat, int, int, PixelFormat, int>()
      .def<&VideoRescaler::srcWidth>("srcWidth")
      .def<&VideoRescaler::srcHeight>("srcHeight")
      .def<&VideoRescaler::srcPixelFormat>("srcPixelFormat")
      .def<&VideoRescaler::dstWidth>("dstWidth")
      .def<&VideoRescaler::dstHeight>("dstHeight")
      .def<&VideoRescaler::dstPixelFormat>("dstPixelFormat")
      .def<static_cast<VideoFrame (VideoRescaler::*)(const VideoFrame &, OptionalErrorCode)>(&VideoRescaler::rescale)>(
          "rescale")
      .def<static_cast<VideoFrame (VideoRescaler::*)(const VideoFrame &, OptionalErrorCode)>(&VideoRescaler::rescale),
           Nobind::ReturnAsync>("rescaleAsync");

  m.def<AudioResampler>("AudioResampler")
      .cons<uint64_t, int, SampleFormat, uint64_t, int, SampleFormat>()
      .def<&AudioResampler::dstChannelLayout>("dstChannelLayout")
      .def<&AudioResampler::dstChannels>("dstChannels")
      .def<&AudioResampler::dstSampleRate>("dstSampleRate")
      .def<&AudioResampler::srcSampleFormat>("srcSampleFormat")
      .def<&AudioResampler::srcChannelLayout>("srcChannelLayout")
      .def<&AudioResampler::srcChannels>("srcChannels")
      .def<&AudioResampler::srcSampleRate>("srcSampleRate")
      .def<&AudioResampler::push>("push")
      .def<&AudioResampler::push, Nobind::ReturnAsync>("pushAsync")
      .def<static_cast<AudioSamples (AudioResampler::*)(size_t, OptionalErrorCode)>(&AudioResampler::pop)>("pop")
      .def<static_cast<AudioSamples (AudioResampler::*)(size_t, OptionalErrorCode)>(&AudioResampler::pop),
           Nobind::ReturnAsync>("popAsync");

  m.def<Filter>("Filter").cons<const char *>();

  m.def<FilterGraph>("FilterGraph")
      .cons<>()
      .def<&FilterGraph::createFilter>("createFilter")
      .def<static_cast<void (FilterGraph::*)(const std::string &, OptionalErrorCode)>(&FilterGraph::parse)>("parse")
      .def<&FilterGraph::config>("config")
      .def<static_cast<FilterContext (FilterGraph::*)(const std::string &, OptionalErrorCode)>(&FilterGraph::filter)>(
          "filter");

  m.def<FilterContext>("FilterContext");

  // We only export the safer API that copies frames for now
  m.def<BufferSrcFilterContext>("BufferSrcFilterContext")
      .cons<FilterContext &>()
      .def<static_cast<void (BufferSrcFilterContext::*)(const VideoFrame &, OptionalErrorCode)>(
          &BufferSrcFilterContext::writeVideoFrame)>("writeVideoFrame")
      .def<static_cast<void (BufferSrcFilterContext::*)(const AudioSamples &, OptionalErrorCode)>(
          &BufferSrcFilterContext::writeAudioSamples)>("writeAudioSamples")
      .def<static_cast<void (BufferSrcFilterContext::*)(const VideoFrame &, OptionalErrorCode)>(
               &BufferSrcFilterContext::writeVideoFrame),
           Nobind::ReturnAsync>("writeVideoFrameAsync")
      .def<static_cast<void (BufferSrcFilterContext::*)(const AudioSamples &, OptionalErrorCode)>(
               &BufferSrcFilterContext::writeAudioSamples),
           Nobind::ReturnAsync>("writeAudioSamplesAsync")
      .def<&BufferSrcFilterContext::checkFilter>("checkFilter");

  m.def<BufferSinkFilterContext>("BufferSinkFilterContext")
      .cons<FilterContext &>()
      .ext<&GetVideoFrame, Nobind::ReturnNullAccept>("getVideoFrame")
      .ext<&GetAudioFrame, Nobind::ReturnNullAccept>("getAudioFrame")
      .def<&BufferSinkFilterContext::setFrameSize>("setFrameSize")
      .def<&BufferSinkFilterContext::frameRate>("frameRate")
      .def<&BufferSinkFilterContext::checkFilter>("checkFilter");
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
