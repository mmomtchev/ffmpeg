#!/bin/sh

CONANHOME=`conan config home`
FFMPEG=`find ${CONANHOME} -maxdepth 3 -name ffmpeg`/6.1/_/_/source

if [ ! -d ${FFMPEG} ]; then
  echo "No ffmpeg in ${FFMPEG}"
  exit 1
fi

(
sed -nr 's/^.*\s+AV_CODEC_ID_([_A-Z0-9]+)[, ].*/AV_CODEC_ID_\1 AV_CODEC_\1/p' ${FFMPEG}/src/libavcodec/codec_id.h
sed -nr 's/^.*\s+AV_CODEC_FLAG_([_A-Z0-9]+)[, ].*/AV_CODEC_FLAG_\1 AV_CODEC_FLAG_\1/p' ${FFMPEG}/src/libavcodec/avcodec.h | sort | uniq
sed -nr 's/^.*\s+AVMEDIA_TYPE_([_A-Z0-9]+)[, ].*/AVMEDIA_TYPE_\1 AV_MEDIA_TYPE_\1/p' ${FFMPEG}/src/libavutil/avutil.h
sed -nr 's/^.*\s+AV_PICTURE_TYPE_([_A-Z0-9]+)[, ].*/AV_PICTURE_TYPE_\1 AV_PICTURE_TYPE_\1/p' ${FFMPEG}/src/libavutil/avutil.h
sed -nr 's/^.*\s+AV_CH_LAYOUT_([_A-Z0-9]+)[, ].*/AV_CH_LAYOUT_\1 AV_CH_LAYOUT_\1/p' ${FFMPEG}/src/libavutil/channel_layout.h
sed -nr 's/^.*\s+AV_PIX_FMT_([_A-Z0-9]+)[, ].*/AV_PIX_FMT_\1 AV_PIX_FMT_\1/p' ${FFMPEG}/src/libavutil/pixfmt.h | sort | uniq
sed -nr 's/^.*\s+AV_SAMPLE_FMT_([_A-Z0-9]+)[, ].*/AV_SAMPLE_FMT_\1 AV_SAMPLE_FMT_\1/p' ${FFMPEG}/src/libavutil/samplefmt.h | sort | uniq
sed -nr 's/^.*\s+AVFMT_([_A-Z0-9]+)[, ].*/AVFMT_\1 AV_FMT_\1/p' ${FFMPEG}/src/libavformat/avformat.h | sort | uniq
sed -nr 's/^.*\s+AV_LOG_([_A-Z0-9]+)[, ].*/AV_LOG_\1 AV_LOG_\1/p' ${FFMPEG}/src/libavutil/log.h | sort | uniq
sed -nr 's/^.*\s+SWS_([_A-Z0-9]+)[, ].*/SWS_\1 SWS_\1/p' ${FFMPEG}/src/libswscale/swscale.h | sort | uniq
sed -nr 's/^.*\s+SWS_([_A-Z0-9]+)[, ].*/SWS_\1 SWS_\1/p' ${FFMPEG}/src/libswresample/swresample.h | sort | uniq
) | sed -r 's/(.*)\s(.*)/REGISTER_CONSTANT(\1, "\2");/g'
