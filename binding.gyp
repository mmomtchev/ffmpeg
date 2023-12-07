{
  'target_defaults': {
    'includes': [ 'defaults.gypi' ],
  },
  'targets': [
    {
      'target_name': '<(module_name)',
      'sources': [
        'src/binding/avcpp-nobind.cc',
        'src/binding/avcpp-frame.cc'
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
      ],
      "actions": [
        {
          "action_name": "tsc",
          "inputs":  [ "src/lib/index.ts" ],
          "outputs": [ "lib/index.js" ],
          "action": [ "npx", "tsc" ]
        }
      ]
    }
  ]
}
