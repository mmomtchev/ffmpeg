{
  'target_defaults': {
    'includes': [
      'except.gypi'
    ],
    'cflags_cc': [
      '-fvisibility=hidden',
      '-std=c++17'
    ],
    'msvs_settings': {
      'VCCLCompilerTool': { 
        'AdditionalOptions': [ '/std:c++17' ]
      }
    },
    'xcode_settings': {
      'OTHER_CPLUSPLUSFLAGS': [
        '-fvisibility=hidden',
        '-std=c++17'
      ]
    }
  },
  'targets': [
    {
      'target_name': 'node-ffmpeg',
      'sources': [
        'src/avcpp-nobind.cc',
        'src/avcpp-frame.cc'
      ],
      'include_dirs': [
        '<!@(node -p "require(\'node-addon-api\').include")',
        '<!@(node -p "require(\'nobind17\').include")'
      ],
      'dependencies': [ 'deps/avcpp.gyp:avcpp' ]
    },
    {
      'target_name': 'action_after_build',
      'type': 'none',
      'dependencies': [ '<(module_name)' ],
      'copies': [
        {
          'files': [
            '<(PRODUCT_DIR)/node-ffmpeg.node'
          ],
          'destination': '<(module_path)'
        }
      ]
    }
  ]
}
