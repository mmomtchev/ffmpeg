// JavaScript reimplementation of
// https://github.com/h4tr3d/avcpp/blob/master/example/api2-samples/api2-decode-encode-video.cpp
const ffmpeg = require('../build/Debug/node-ffmpeg-avcpp.node');
const {
  FormatContext,
  findEncodingCodec,
  AudioDecoderContext,
  AudioEncoderContext,
  ChannelLayout,
  OutputFormat,
  Codec
} = ffmpeg;

if (!process.argv[3]) {
  console.log('Usage: node transcodeAudio.js <input> <ouput>');
  process.exit(1);
}

if (process.argv[4] && process.argv[4].startsWith('v')) {
  ffmpeg.setLogLevel(ffmpeg.AV_Log_Debug);
} else {
  ffmpeg.setLogLevel(ffmpeg.AV_Log_Error);
}

const inp = process.argv[2];
const outp = process.argv[3];

//
// INPUT
//
const ictx = new FormatContext;
let audioStream = null;
let ast = null;

ictx.openInput(inp);

ictx.findStreamInfo();

for (let i = 0; i < ictx.streamsCount(); i++) {
  const st = ictx.stream(i);
  if (st.isAudio()) {
    audioStream = i;
    ast = st;
    console.log(`Stream ${i} is an audio stream`);
    break;
  }
}

if (ast === null) {
  console.error('Audio stream not found');
  process.exit(3);
}

if (!ast.isValid()) {
  console.error('Audio stream not valid');
  process.exit(4);
}

const adec = new AudioDecoderContext(ast);
const decodec = new Codec;
adec.openCodec(decodec);


//
// OUTPUT
//
const ofrmt = new OutputFormat;
const octx = new FormatContext;

ofrmt.setFormat('', outp, '');
octx.setOutputFormat(ofrmt);

const ocodec = findEncodingCodec(ofrmt, false);
console.log(`Using codec ${ocodec.name()}`);
const encoder = new AudioEncoderContext(ocodec);

// Settings
encoder.setSampleRate(adec.sampleRate());
console.log(adec.sampleFormat().toString());
if (adec.sampleFormat().get() > -1) {
  console.log(`Sample format ${adec.sampleFormat()}`);
  encoder.setSampleFormat(adec.sampleFormat());
} else {
  console.warn('Invalid sample format');
}

encoder.setTimeBase(ast.timeBase());
encoder.setBitRate(adec.bitRate());
encoder.setChannelLayout(new ChannelLayout(2));

const encodec = new Codec;
encoder.openCodec(encodec);

const ost = octx.addAudioStream(encoder);

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
    if (pkt.streamIndex() != audioStream) {
      continue;
    }
    console.log(`Read packet: pts=${pkt.pts()}, dts=${pkt.dts()} / ${pkt.pts().seconds()} / ${pkt.timeBase()} / stream ${pkt.streamIndex()}`);
  } else {
    flushDecoder = true;
  }

  do {
    // DECODING
    const samples = adec.decode(pkt);

    let flushEncoder = false;
    if (!samples.isComplete()) {
      if (flushDecoder) {
        flushEncoder = true;
      }
    } else {
      console.log(`Decoded   samples: pts=${samples.pts()} / ${samples.pts().seconds()} / ${samples.timeBase()} / ${samples.sampleFormat()}x${samples.sampleRate()}, size=${samples.size()}, ref=${samples.isReferenced()}:${samples.refCount()} / layout: ${samples.channelsLayoutString()} }`);

      samples.setTimeBase(encoder.timeBase());
      samples.setStreamIndex(0);
      console.log(`Processed samples: pts=${samples.pts()} / ${samples.pts().seconds()} / ${samples.timeBase()} / ${samples.sampleFormat()}x${samples.sampleRate()}, size=${samples.size()}, ref=${samples.isReferenced()}:${samples.refCount()} / layout: ${samples.channelsLayoutString()} }`);
    }

    if (samples.isComplete() || flushEncoder) {
      // ENCODING
      const opkt = samples.isComplete() ? encoder.encode(samples) : encoder.finalize();

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
