{
  'target_defaults': {
    'includes': [ 'defaults.gypi' ],
  },
  'targets': [
    {
      'target_name': '<(module_name)',
      'sources': [
        'src/binding/avcpp-nobind.cc',
        'src/binding/avcpp-frame.cc',
        'src/binding/avcpp-readable.cc',
        'src/binding/avcpp-writable.cc'
      ],
      'include_dirs': [
        '<!@(node -p "require(\'node-addon-api\').include")',
        '<!@(node -p "require(\'nobind17\').include")'
      ],
      'dependencies': [ 'deps/avcpp.gyp:avcpp' ],
      'configurations': {
        'Debug': {
          'conditions': [
            ["OS=='linux'", {
              'ldflags': [ '-Wl,-z,now' ],
            }],
            ["OS=='mac'", {
              'xcode_settings': {
                'OTHER_LDFLAGS': [ '-Wl,-bind_at_load' ]
              }
            }]
          ]
        }
      }
    },
    {
      'target_name': 'action_after_build',
      'type': 'none',
      'dependencies': [ '<(module_name)' ],
      'copies': [
        {
          'files': [
            '<(PRODUCT_DIR)/ffmpeg.node'
          ],
          'destination': '<(module_path)'
        }
      ],
      'actions': [
        {
          'action_name': 'rollup',
          'inputs':  [ 'src/lib/Stream.ts' ],
          'outputs': [ './stream.js' ],
          'conditions': [
            ['OS != "win"', {
              'action': [ 'npx', 'rollup', '-c', 'rollup.config.js' ]
            }],
            ['OS == "win"', {
              'action': [ 'cmd', '/c"npm run rollup"' ]
            }]
          ]
        }
      ]
    }
  ]
}
