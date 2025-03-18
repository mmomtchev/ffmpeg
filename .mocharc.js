module.exports = {
  'spec': 'test/*.test.@(mjs|cjs|js|ts)',
  'require': [
    'ts-node/register',
    'tsconfig-paths/register',
    './test/setup.ts'
  ],
  'node-option': +process.versions.node.split('.')[0] >= 23 ? [
    'no-experimental-strip-types'
  ] : [],
  'reporter': 'tap',
  'timeout': 120000,
  'v8-expose-gc': true
};
