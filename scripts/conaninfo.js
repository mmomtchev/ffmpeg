const fs = require('fs');

const conaninfo = process.argv[2];
const field = process.argv[3];
const prefix = process.argv[4] || '';
const option = process.argv[5] || '';

const info = JSON.parse(fs.readFileSync(conaninfo));
const paths = info.dependencies.map((dep) => dep[field]).flat().map((p) => `${option}"${prefix}${p}"`).join(' ');

console.log(paths);
