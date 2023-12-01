{
  'targets': [
    {
      'conditions': [
        ['OS == "win"', {
          'variables': {
            'conaninfo': '<!(python -m pip install --user "conan<2.0.0"'
              ' && cd ../build'
              ' && python -m conans.conan install .. -of build --build="*"'
              ' 1>&2 )'
            }
        }],
        ['OS != "win"', {
          'variables': {
            'conaninfo': '<!(python3 -m pip install --user "conan<2.0.0"'
              ' && cd ../build'
              ' && python3 -m conans.conan install .. -of build --build="*"'
              ' 1>&2 )'
            }
        }]
      ],
      'target_name': 'ffmpeg',
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
