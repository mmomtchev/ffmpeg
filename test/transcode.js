// JavaScript reimplementation of
// https://github.com/h4tr3d/avcpp/blob/master/example/api2-samples/api2-decode-encode-video.cpp
const ffmpeg = require('../build/Debug/node-ffmpeg-avcpp.node');
const {
  error_code,
  ErrorCode,
  FormatContext,
  findEncodingCodec,
  VideoDecoderContext,
  VideoEncoderContext,
  OutputFormat,
  Codec,
  Rational,
  Timestamp,
  Stream,
  Packet,
  VideoFrame,
  timestampToString
} = ffmpeg;

if (!process.argv[3]) {
  console.log('Usage: node reencode.js <input> <ouput>');
  process.exit(1);
}

function check(oc) {
  if (oc.code().isError()) {
    throw new Error(oc.code().message());
  }
}

const inp = process.argv[2];
const outp = process.argv[3];

// These probably need better handling from JS
const ec = new error_code;
const oc = new ErrorCode(ec);

//
// INPUT
//
const ictx = new FormatContext;
let videoStream = null;
let vst = null;

ictx.openInput(inp, oc);
check(oc);

ictx.findStreamInfo(oc);
check(oc);

for (let i = 0; i < ictx.streamsCount(); i++) {
  const st = ictx.stream(i);
  if (st.mediaType() == ffmpeg.AVMedia_Type_Video) {
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
vdec.openCodec(decodec, oc);
check(oc);


//
// OUTPUT
//
const ofrmt = new OutputFormat;
const octx = new FormatContext;

ofrmt.setFormat('', outp, '');
octx.setOutputFormat(ofrmt);

const ocodec = findEncodingCodec(ofrmt, true);
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

encoder.setTimeBase(new Rational(1, 1000));
encoder.setBitRate(vdec.bitRate());

const encodec = new Codec;
encoder.openCodec(encodec, oc);
check(oc);

const ost = octx.addVideoStream(encoder, oc);
check(oc);
ost.setFrameRate(vst.frameRate());

octx.openOutput(outp, oc);
check(oc);

octx.dump();
octx.writeHeader(oc);
check(oc);
octx.flush();


//
// PROCESS
//
let counter = 0;
while (true) {
  // READING
  const pkt = ictx.readPacket(oc);
  check(oc);

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
    const frame = vdec.decode(pkt, oc, true);
    check(oc);
    if (!frame.isValid()) {
      // Seems that this is something that is normal with the first few frames
      // Must read until the codec has received enough data
      // TODO: This must be fixed in the lower layers
      console.warn('Received invalid frame');
      continue;
    }

    let flushEncoder = false;
    if (frame.isNull()) {
      if (flushDecoder) {
        flushEncoder = true;
      }
    } else {
      console.log(`Decoded   frame: pts=${frame.pts()} / ${frame.pts().seconds()} / ${frame.timeBase()} / ${frame.width()}x${frame.height()}, size=${frame.size()}, ref=${frame.isReferenced()}:${frame.refCount()} / type: ${frame.pictureType()} }`);

      frame.setTimeBase(encoder.timeBase());
      frame.setStreamIndex(0);
      frame.setPictureType(ffmpeg.AVPicture_Type_None);
      frame.setPts(new Timestamp(counter, encoder.timeBase()));
      console.log(`Processed frame: pts=${frame.pts()} / ${frame.pts().seconds()} / ${frame.timeBase()} / ${frame.width()}x${frame.height()}, size=${frame.size()}, ref=${frame.isReferenced()}:${frame.refCount()} / type: ${frame.pictureType()} }`);
    }

    if (frame || flushEncoder) {
      // ENCODING
      const opkt = frame ? encoder.encode(frame, oc) : encoder.finalize(oc);
      check(oc);

      opkt.setStreamIndex(0);
      opkt.setPts(pkt.pts());
      opkt.setDts(pkt.dts());

      console.log(`Write packet: pts=${opkt.pts()}, dts=${opkt.dts()} / ${opkt.pts().seconds()} / ${opkt.timeBase()} / stream ${opkt.streamIndex()}`);

      octx.writePacket(opkt, oc);
      check(oc);
    }

    counter++;

    if (flushEncoder) break;
  } while (flushDecoder);

  if (flushDecoder) break;

  check(oc);
}

octx.writeTrailer(oc);
console.log('done');
