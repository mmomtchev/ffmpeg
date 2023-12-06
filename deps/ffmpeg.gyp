{
  'targets': [
    {
      'target_name': 'ffmpeg',
      'type': 'none',
      'conditions': [
        ['OS == "win"', {
          # On Windows all the binaries usually work very well
          'variables': {
            'conaninfo': '<!(python -m pip install --user "conan<2.0.0"'
              ' && cd ../build'
              ' && python -m conans.conan install .. -of build --build=missing'
              ' 1>&2 )'
          },
          'direct_dependent_settings': {
            'msvs_settings': {
              'VCLinkerTool': {
                'AdditionalLibraryDirectories': [
                  '<!@(node ../scripts/conaninfo.js ../build/conanbuildinfo.json lib_paths)'
                ]
              }
            }
          }
        }],
        ['OS == "mac"', {
          # On macOS, there is the special frameworks link setting
          'variables': {
            'conaninfo': '<!(python3 -m pip install --user "conan<2.0.0"'
              ' && cd ../build'
              ' && python3 -m conans.conan install .. -of build --build=missing'
              ' 1>&2 )'
          },
          'direct_dependent_settings': {
            'xcode_settings': {
              'OTHER_LDFLAGS': [
                '<!@(node ../scripts/conaninfo.js ../build/conanbuildinfo.json frameworks "" "-framework ")'
              ]
            },
            'libraries': [
              '<!@(node ../scripts/conaninfo.js ../build/conanbuildinfo.json lib_paths -L)',
            ]
          }
        }],
        ['OS == "linux"', {
          # On Linux libx265 has the -ffast-math problem that plagues many math-heavy packages on conan
          'variables': {
            'conaninfo': '<!(python3 -m pip install --user "conan<2.0.0"'
              ' && cd ../build'
              ' && python3 -m conans.conan install .. -of build --build=libx265 --build=missing'
              ' 1>&2 )'
          },
          'direct_dependent_settings': {
            'libraries': [
              '<!@(node ../scripts/conaninfo.js ../build/conanbuildinfo.json lib_paths -L)',
            ]
          }
        }]
      ],
      'direct_dependent_settings': {
        'include_dirs': [
          '<!@(node ../scripts/conaninfo.js ../build/conanbuildinfo.json include_paths)'
        ],
        'defines': [
          '<!@(node ../scripts/conaninfo.js ../build/conanbuildinfo.json defines)'
        ],
        'libraries': [
          '<!@(node ../scripts/conaninfo.js ../build/conanbuildinfo.json libs -l)',
          '<!@(node ../scripts/conaninfo.js ../build/conanbuildinfo.json system_libs -l)'
        ],
        'ldflags': [
          '<!@(node ../scripts/conaninfo.js ../build/conanbuildinfo.json exelinkflags)'
        ]
      }
    }
  ]
}
