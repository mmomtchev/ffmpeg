const path = require('path');
const binary = require('@mapbox/node-pre-gyp');

const binding_path = binary.find(path.resolve(__dirname, '..', 'package.json'));
module.exports = require(binding_path);
