import * as path from "node:path";
import ts from '@rollup/plugin-typescript';
import { dts } from 'rollup-plugin-dts';

import undebug from './src/undebug.js';

export default [
  {
    input: path.resolve(import.meta.dirname, 'src', 'lib', 'Stream.ts'),
    plugins: [ts({
      transformers: {
        after: [
          undebug
        ]
      }
    })],
    output: [
      {
        file: 'stream.js',
        format: 'es',
        sourcemap: true
      },
    ]
  },
  {
    input: path.resolve(import.meta.dirname, 'src', 'lib', 'Stream.ts'),
    plugins: [dts()],
    output: [
      {
        file: 'stream.d.ts',
        format: 'es'
      },
    ]
  },
];
