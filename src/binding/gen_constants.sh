#!/bin/sh

FFMPEG=`npx xpm run -q conan -- cache path --folder source ffmpeg/7.1.1`

if [ -z "${SED}" ]; then
  SED=sed
fi

if [ ! -d "${FFMPEG}" ]; then
  echo "No ffmpeg in ${FFMPEG}"
  exit 1
fi

(
${SED} -nr 's/^[^\s]*\s+AV_CODEC_ID_([_A-Z0-9]+)[, ].*/AVCodecID AV_CODEC_ID_\1 AV_CODEC_\1/p' ${FFMPEG}/src/libavcodec/codec_id.h
${SED} -nr 's/^[^\s]*\s+AV_CODEC_FLAG_([_A-Z0-9]+)[, ].*/int64_t AV_CODEC_FLAG_\1 AV_CODEC_FLAG_\1/p' ${FFMPEG}/src/libavcodec/avcodec.h | sort | uniq
${SED} -nr 's/^[^\s]*\s+AVMEDIA_TYPE_([_A-Z0-9]+)[, ].*/AVMediaType AVMEDIA_TYPE_\1 AV_MEDIA_TYPE_\1/p' ${FFMPEG}/src/libavutil/avutil.h
${SED} -nr 's/^[^\s]*\s+AV_PICTURE_TYPE_([_A-Z0-9]+)[, ].*/AVPictureType AV_PICTURE_TYPE_\1 AV_PICTURE_TYPE_\1/p' ${FFMPEG}/src/libavutil/avutil.h
${SED} -nr 's/^[^\s]*\s+AV_CH_LAYOUT_([_A-Z0-9]+)[, ].*/int64_t AV_CH_LAYOUT_\1 AV_CH_LAYOUT_\1/p' ${FFMPEG}/src/libavutil/channel_layout.h
${SED} -nr 's/^[^\s]*\s+AV_PIX_FMT_([_A-Z0-9]+)[, ].*/AVPixelFormat AV_PIX_FMT_\1 AV_PIX_FMT_\1/p' ${FFMPEG}/src/libavutil/pixfmt.h | sort | uniq
${SED} -nr 's/^[^\s]*\s+AV_SAMPLE_FMT_([_A-Z0-9]+)[, ].*/AVSampleFormat AV_SAMPLE_FMT_\1 AV_SAMPLE_FMT_\1/p' ${FFMPEG}/src/libavutil/samplefmt.h | sort | uniq
${SED} -nr 's/^[^\s]*\s+AVFMT_([_A-Z0-9]+)[, ].*/int64_t AVFMT_\1 AV_FMT_\1/p' ${FFMPEG}/src/libavformat/avformat.h | sort | uniq
${SED} -nr 's/^[^\s]*\s+AV_LOG_([_A-Z0-9]+)[, ].*/int64_t AV_LOG_\1 AV_LOG_\1/p' ${FFMPEG}/src/libavutil/log.h | sort | uniq
${SED} -nr 's/^[^\s]*\s+SWS_([_A-Z0-9]+)[, ].*/int64_t SWS_\1 SWS_\1/p' ${FFMPEG}/src/libswscale/swscale.h | sort | uniq
${SED} -nr 's/^[^\s]*\s+SWS_([_A-Z0-9]+)[, ].*/int64_t SWS_\1 SWS_\1/p' ${FFMPEG}/src/libswresample/swresample.h | sort | uniq
${SED} -nr 's/^[^\s]*\s+AV_BUFFERSINK_FLAG_([_A-Z0-9]+)[, ].*/int64_t AV_BUFFERSINK_FLAG_\1 AV_BUFFERSINK_FLAG_\1/p' ${FFMPEG}/src/libavfilter/buffersink.h | sort | uniq
) | ${SED} -r 's/(.*)\s(.*)\s(.*)/REGISTER_CONSTANT(\1, \2, "\3");/g'
