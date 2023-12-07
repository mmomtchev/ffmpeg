export const StreamTypes = {
  'Audio': 'Audio',
  'Video': 'Video',
  'Subtitle': 'Subtitle',
  'Data': 'Data'
} as const;

export type StreamType = keyof typeof StreamTypes;

export interface MediaStreamDefinition {
  type: StreamType;
  bitRate: number;
  codec: number;
  timeBase?: any;
}

export interface VideoStreamDefinition extends MediaStreamDefinition {
  type: 'Video';
  width: number;
  height: number;
  frameRate: number;
  pixelFormat: any;
}

export interface AudioStreamDefinition extends MediaStreamDefinition {
  type: 'Audio';
  channelLayout: any;
  sampleFormat: any;
  sampleRate: any;
}

export function isVideoDefinition(def: MediaStreamDefinition): def is VideoStreamDefinition {
  return def.type === 'Video';
}

export function isAudioDefinition(def: MediaStreamDefinition): def is AudioStreamDefinition {
  return def.type === 'Audio';
}

export interface MediaStream {
  definition(): MediaStreamDefinition
}
