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
      'dependencies': [ 'deps/avcpp.gyp:avcpp' ]
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
          'action_name': 'tsc',
          'inputs':  [ 'src/lib/Stream.ts' ],
          'outputs': [ 'lib/Stream.js' ],
          'conditions': [
            ['OS != "win"', {
              'action': [ 'npx', 'tsc' ]
            }],
            ['OS == "win"', {
              'action': [ 'cmd', '/c"npx tsc"' ]
            }]
          ]
        }
      ]
    }
  ]
}
