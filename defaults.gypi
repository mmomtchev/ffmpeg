{
  'variables': {
    'enable_asan%': 'false'
  },
  'includes': [
    'except.gypi'
  ],
  'cflags_cc': [
    '-fvisibility=hidden',
    '-std=c++17'
  ],
  'conditions': [
    ['enable_asan == "true"', {
      'cflags_cc': [
        '-fsanitize=address',
        '-fsanitize-recover=address'
      ],
      'xcode_settings': {
        'OTHER_CPLUSPLUSFLAGS': [
          '-fsanitize=address'
        ]
      }
    }]
  ],
  'msvs_settings': {
    'VCCLCompilerTool': { 
      'AdditionalOptions': [ '/std:c++17', '/MP' ]
    },
    'VCLinkerTool': {
      'AdditionalOptions': [ '/NODEFAULTLIB:library' ],
    }
  },
  'xcode_settings': {
    'OTHER_CPLUSPLUSFLAGS': [
      '-fvisibility=hidden',
      '-std=c++17'
    ]
  },
  'configurations': {
    'Debug': {
      'msvs_settings': {
        'VCCLCompilerTool': {
          # 0 - MultiThreaded (/MT)
          # 1 - MultiThreadedDebug (/MTd)
          # 2 - MultiThreadedDLL (/MD)
          # 3 - MultiThreadedDebugDLL (/MDd)
          'RuntimeLibrary': 1
        }
      }
    },
    'Release': {
      'msvs_settings': {
        'VCCLCompilerTool': {
          'RuntimeLibrary': 0
        }
      }
    }
  }
}
