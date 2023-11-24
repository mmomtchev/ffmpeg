#!/bin/sh

FFMPEG=~/.conan/data/ffmpeg/6.0/_/_/source

if [ ! -d ${FFMPEG} ]; then
  echo "No ffmpeg in ${FFMPEG}"
  exit 1
fi

(
sed -nr 's/^.*\s+AV_CODEC_ID_([_A-Z0-9]+)[, ].*/AV_CODEC_ID_\1 AV_CODEC_\1/p' ${FFMPEG}/src/libavcodec/codec_id.h
sed -nr 's/^.*\s+AVMEDIA_TYPE_([_A-Z0-9]+)[, ].*/AVMEDIA_TYPE_\1 AV_MEDIA_TYPE_\1/p' ${FFMPEG}/src/libavutil/avutil.h
sed -nr 's/^.*\s+AV_PICTURE_TYPE_([_A-Z0-9]+)[, ].*/AV_PICTURE_TYPE_\1 AV_PICTURE_TYPE_\1/p' ${FFMPEG}/src/libavutil/avutil.h
sed -nr 's/^.*\s+AV_CH_LAYOUT_([_A-Z0-9]+)[, ].*/AV_CH_LAYOUT_\1 AV_CH_LAYOUT_\1/p' ${FFMPEG}/src/libavutil/channel_layout.h
sed -nr 's/^.*\s+AV_LOG_([_A-Z0-9]+)[, ].*/AV_LOG_\1 AV_LOG_\1/p' ${FFMPEG}/src/libavutil/log.h | sort | uniq
) | sed -r 's/(.*)\s(.*)/REGISTER_CONSTANT(\1, "\2");/g'
