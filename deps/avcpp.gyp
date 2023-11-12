{
  'target_defaults': {
    'includes': [
      '../except.gypi'
    ]
  },
  'targets': [
    {
      'target_name': 'avcpp',
      'dependencies': [ 'ffmpeg.gyp:ffmpeg' ],
      'type': 'static_library',
      'cflags': [
        # TODO: These should definitely be fixed in avcpp
        '-Wno-sign-compare'
      ],
      'sources': [
        'avcpp/src/codeccontext.cpp',
        'avcpp/src/audioresampler.cpp',
        'avcpp/src/filters/filter.cpp',
        'avcpp/src/filters/filtergraph.cpp',
        'avcpp/src/filters/buffersrc.cpp',
        'avcpp/src/filters/filterpad.cpp',
        'avcpp/src/filters/buffersink.cpp',
        'avcpp/src/filters/filtercontext.cpp',
        'avcpp/src/channellayout.cpp',
        'avcpp/src/rect.cpp',
        'avcpp/src/pixelformat.cpp',
        'avcpp/src/codec.cpp',
        'avcpp/src/timestamp.cpp',
        'avcpp/src/stream.cpp',
        'avcpp/src/avutils.cpp',
        'avcpp/src/format.cpp',
        'avcpp/src/packet.cpp',
        'avcpp/src/sampleformat.cpp',
        'avcpp/src/rational.cpp',
        'avcpp/src/videorescaler.cpp',
        'avcpp/src/formatcontext.cpp',
        'avcpp/src/dictionary.cpp',
        'avcpp/src/avtime.cpp',
        'avcpp/src/averror.cpp',
        'avcpp/src/frame.cpp'
      ],
      'include_dirs': [
        'avcpp/src'
      ],
      'direct_dependent_settings': {
        'cflags': [
          '-Wno-sign-compare'
        ],
        'include_dirs': [
          'avcpp/src'
        ]
      },
      'export_dependent_settings': [ 'ffmpeg.gyp:ffmpeg' ]
    }
  ]
}
