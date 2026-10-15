/**
 * Single source of truth for which video files the editor accepts.
 * Shared by the in-editor dropzone and the projects-page drop catcher
 * so both agree on the format list and the rejection message.
 */
export const ACCEPTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

export const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/webm'];
export const MEDIA_FILE_ACCEPT = 'video/mp4,video/webm,video/quicktime,audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac';
export const isAudioFile = (file: File): boolean => ACCEPTED_AUDIO_TYPES.includes(file.type) || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);
export const isAcceptedMediaFile = (file: File): boolean => ACCEPTED_VIDEO_TYPES.includes(file.type) || isAudioFile(file);

export const ACCEPTED_VIDEO_LABEL = 'Video or audio · MP4 · WEBM · MOV · MP3 · WAV · M4A';

export const VIDEO_UNSUPPORTED_MESSAGE =
  'Please use a video (MP4, WebM, MOV) or audio (MP3, WAV, M4A, AAC, OGG, FLAC) file.';

/** Video-only entry point used by the project library. */
export const VIDEO_FILE_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';
export const isAcceptedVideoFile = (file: File): boolean => ACCEPTED_VIDEO_TYPES.includes(file.type) || (!file.type && /\.(mp4|webm|mov)$/i.test(file.name));
export const VIDEO_ONLY_LABEL = 'Video · MP4 · WebM · MOV';
export const VIDEO_ONLY_UNSUPPORTED_MESSAGE = 'Please upload a video in MP4, WebM or MOV format.';
