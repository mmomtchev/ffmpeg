import ffmpeg from '@mmomtchev/ffmpeg';

exports.mochaHooks = {
  afterEach: global.gc,
  beforeAll: () => {
    ffmpeg.setLogLevel(process.env.DEBUG_FFMPEG ? ffmpeg.AV_LOG_DEBUG : ffmpeg.AV_LOG_QUIET);
  }
};
