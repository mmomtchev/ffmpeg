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
      'AdditionalOptions': [ '/std:c++17' ]
    }
  },
  'xcode_settings': {
    'OTHER_CPLUSPLUSFLAGS': [
      '-fvisibility=hidden',
      '-std=c++17'
    ]
  }
}
