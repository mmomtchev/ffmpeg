{
  'targets': [
    {
      'target_name': 'ffmpeg',
      'conditions': [
        ['OS == "win"', {
          # On Windows all the binaries usually work very well
          'variables': {
            'conaninfo': '<!(set PKG_CONFIG_PATH='
              ' && python -m pip install --user "conan<2.0.0"'
              ' && cd ../build'
              ' && python -m conans.conan install .. -of build --build=missing'
              ' 1>&2 )'
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
                '<!@(node -p "JSON.parse(fs.readFileSync(\'../build/conanbuildinfo.json\')).dependencies.map((dep) => dep.frameworks.map((f) => \'-framework \' + f)).flat().join(\' \')")'
              ]
            }
          }
        }],
        ['OS == "linux"', {
          # On Linux libx265 has the -ffast-math problem that plagues many math-heavy packages on conan
          'variables': {
            'conaninfo': '<!(python3 -m pip install --user "conan<2.0.0"'
              ' && cd ../build'
              ' && python3 -m conans.conan install .. -of build --build=libx265 --build=missing'
              ' 1>&2 )'
          }
        }]
      ],
      'direct_dependent_settings': {
        'include_dirs': [
          '<!@(node -p "JSON.parse(fs.readFileSync(\'../build/conanbuildinfo.json\')).dependencies.map((dep) => dep.include_paths).flat().join(\' \')")'
        ],
        'defines': [
          '<!@(node -p "JSON.parse(fs.readFileSync(\'../build/conanbuildinfo.json\')).dependencies.map((dep) => dep.defines).flat().join(\' \')")'
        ],
        'libraries': [
          '<!@(node -p "JSON.parse(fs.readFileSync(\'../build/conanbuildinfo.json\')).dependencies.map((dep) => dep.libs).flat().map((path) => \'-l\' + path).join(\' \')")',
          '<!@(node -p "JSON.parse(fs.readFileSync(\'../build/conanbuildinfo.json\')).dependencies.map((dep) => dep.lib_paths).flat().map((path) => \'-L\' + path).join(\' \')")'
          '<!@(node -p "JSON.parse(fs.readFileSync(\'../build/conanbuildinfo.json\')).dependencies.map((dep) => dep.system_libs).flat().map((path) => \'-l\' + path).join(\' \')")',
        ],
        'ldflags': [
          '<!@(node -p "JSON.parse(fs.readFileSync(\'../build/conanbuildinfo.json\')).dependencies.map((dep) => dep.exelinkflags).flat().join(\' \')")'
        ]
      }
    }
  ]
}
