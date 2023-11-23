{
  'target_defaults': {
    'includes': [
      'except.gypi'
    ]
  },
  'targets': [
    {
      'target_name': 'node-ffmpeg-avcpp',
      'sources': [
        'src/avcpp-nobind.cc'
      ],
      'include_dirs': [
        '<!@(node -p "require(\'node-addon-api\').include")',
        '<!@(node -p "require(\'nobind17\').include")'
      ],
      'dependencies': [ 'deps/avcpp.gyp:avcpp' ]
    }
  ]
}
