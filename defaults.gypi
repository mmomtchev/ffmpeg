{
  'includes': [
    'except.gypi'
  ],
  'cflags_cc': [
    '-fvisibility=hidden',
    '-std=c++17'
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
          'RuntimeLibrary': 0  # shared release
        }
      }
    }
  }
}
