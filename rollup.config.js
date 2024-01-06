const ts = require('@rollup/plugin-typescript');
const dts = require('rollup-plugin-dts').dts;

module.exports = [
  {
    input: 'src/lib/Stream.ts',
    plugins: [ts({
      transformers: {
        after: [
          require('./src/undebug.js')
        ]
      }
    })],
    output: [
      {
        file: 'stream.js',
        format: 'cjs',
        sourcemap: true
      },
    ]
  },
  {
    input: 'src/lib/Stream.ts',
    plugins: [dts()],
    output: [
      {
        file: 'stream.d.ts',
        format: 'es'
      },
    ]
  },
];
