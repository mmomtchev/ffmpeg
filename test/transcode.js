// JavaScript reimplementation of
// https://github.com/h4tr3d/avcpp/blob/master/example/api2-samples/api2-decode-encode-video.cpp
const ffmpeg = require('../build/Debug/node-ffmpeg-avcpp.node');
const {
  FormatContext,
  findEncodingCodecFormat,
  VideoDecoderContext,
  VideoEncoderContext,
  OutputFormat,
  Codec
} = ffmpeg;

if (!process.argv[3]) {
  console.log('Usage: node transcode.js <input> <ouput>');
  process.exit(1);
}

if (process.argv[4] && process.argv[4].startsWith('v')) {
  ffmpeg.setLogLevel(ffmpeg.AV_LOG_DEBUG);
} else {
  ffmpeg.setLogLevel(ffmpeg.AV_LOG_ERROR);
}

const inp = process.argv[2];
const outp = process.argv[3];

//
// INPUT
//
const ictx = new FormatContext;
let videoStream = null;
let vst = null;

ictx.openInput(inp);

ictx.findStreamInfo();

for (let i = 0; i < ictx.streamsCount(); i++) {
  const st = ictx.stream(i);
  if (st.mediaType() == ffmpeg.AV_MEDIA_TYPE_VIDEO) {
    videoStream = i;
    vst = st;
    console.log(`Stream ${i} is a video stream`);
    break;
  }
}

if (vst === null) {
  console.error('Video stream not found');
  process.exit(3);
}

if (!vst.isValid()) {
  console.error('Video stream not valid');
  process.exit(4);
}

const vdec = new VideoDecoderContext(vst);
vdec.setRefCountedFrames(true);
const decodec = new Codec;
vdec.openCodec(decodec);


//
// OUTPUT
//
const ofrmt = new OutputFormat;
const octx = new FormatContext;

ofrmt.setFormat('', outp, '');
octx.setOutputFormat(ofrmt);

const ocodec = findEncodingCodecFormat(ofrmt, true);
console.log(`Using codec ${ocodec.name()}`);
const encoder = new VideoEncoderContext(ocodec);

// Settings
encoder.setWidth(vdec.width());
encoder.setHeight(vdec.height());
if (vdec.pixelFormat().get() > -1) {
  console.log(`Pixel format ${vdec.pixelFormat()}`);
  encoder.setPixelFormat(vdec.pixelFormat());
  console.log(`Pixel format ${encoder.pixelFormat()}`);
} else {
  console.warn('Invalid pixel format');
}

encoder.setTimeBase(vst.timeBase());
encoder.setBitRate(vdec.bitRate());

const encodec = new Codec;
encoder.openCodec(encodec);

const ost = octx.addVideoStream(encoder);
ost.setFrameRate(vst.frameRate());

octx.openOutput(outp);

octx.dump();
octx.writeHeader();
octx.flush();


//
// PROCESS
//
let counter = 0;
while (true) {
  // READING
  const pkt = ictx.readPacket();

  let flushDecoder = false;
  if (!pkt.isNull()) {
    if (pkt.streamIndex() != videoStream) {
      continue;
    }
    console.log(`Read packet: pts=${pkt.pts()}, dts=${pkt.dts()} / ${pkt.pts().seconds()} / ${pkt.timeBase()} / stream ${pkt.streamIndex()}`);
  } else {
    flushDecoder = true;
  }

  do {
    // DECODING
    const frame = vdec.decode(pkt, true);

    let flushEncoder = false;
    if (!frame.isComplete()) {
      if (flushDecoder) {
        flushEncoder = true;
      }
    } else {
      console.log(`Decoded   frame: pts=${frame.pts()} / ${frame.pts().seconds()} / ${frame.timeBase()} / ${frame.width()}x${frame.height()}, size=${frame.size()}, ref=${frame.isReferenced()}:${frame.refCount()} / type: ${frame.pictureType()} }`);

      frame.setTimeBase(encoder.timeBase());
      frame.setStreamIndex(0);
      frame.setPictureType(ffmpeg.AV_PICTURE_TYPE_NONE);
      // data is in frame.data()
      console.log(`Processed frame: pts=${frame.pts()} / ${frame.pts().seconds()} / ${frame.timeBase()} / ${frame.width()}x${frame.height()}, size=${frame.size()}, ref=${frame.isReferenced()}:${frame.refCount()} / type: ${frame.pictureType()} }`);
    }

    if (frame.isComplete() || flushEncoder) {
      // ENCODING
      const opkt = frame.isComplete() ? encoder.encode(frame) : encoder.finalize();

      opkt.setStreamIndex(0);

      console.log(`Write packet: pts=${opkt.pts()}, dts=${opkt.dts()} / ${opkt.pts().seconds()} / ${opkt.timeBase()} / stream ${opkt.streamIndex()}`);

      octx.writePacket(opkt);
    }

    counter++;

    if (flushEncoder) break;
  } while (flushDecoder);

  if (flushDecoder) break;
}

octx.writeTrailer();
console.log('done');
