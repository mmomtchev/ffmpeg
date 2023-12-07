import * as path from 'node:path';
import binary from '@mapbox/node-pre-gyp';

const binding_path = binary.find(path.resolve(__dirname, '..', 'package.json'));
export default require(binding_path);
