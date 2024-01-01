const wtf = require('wtfnode');

exports.mochaHooks = {
  afterEach: global.gc,
  afterAll: () => {
    wtf.dump();
    setTimeout(() => wtf.dump(), 2000);
  }
};
