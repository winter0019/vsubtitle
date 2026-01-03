
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

/**
 * Initializes and returns the FFmpeg instance.
 */
export const getFFmpeg = async (onLog?: (msg: string) => void) => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  onLog?.('Initializing FFmpeg (WASM engine)...');
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
};

/**
 * Merges video and subtitles. 
 */
export const mergeVideoAndSubtitles = async (
  videoFile: File,
  srtContent: string,
  onProgress: (progress: number) => void,
  onLog: (message: string) => void
): Promise<Blob> => {
  const ffmpegInstance = await getFFmpeg(onLog);

  ffmpegInstance.on('log', ({ message }) => {
    onLog(message);
    console.debug('[FFmpeg]', message);
  });

  ffmpegInstance.on('progress', ({ progress }) => {
    onProgress(Math.round(progress * 100));
  });

  // 1. Setup Virtual File System
  onLog('Preparing files in virtual environment...');
  const videoData = await fetchFile(videoFile);
  await ffmpegInstance.writeFile('input.mp4', videoData);
  
  // Normalize line endings and ensure UTF-8
  const normalizedSrt = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(normalizedSrt));
  
  // Log beginning of SRT for debugging
  onLog(`SRT Ready: ${normalizedSrt.substring(0, 40).replace(/\n/g, ' ')}...`);

  // 2. Load CJK-Compatible Font
  // Noto Sans SC (Simplified Chinese) is required for Chinese characters
  const fontUrl = 'https://fonts.gstatic.com/s/notosanssc/v36/k3kXo84MPtRZmq-Tv33_59_3O-f3.ttf';
  onLog('Downloading Noto Sans SC (Chinese Support) font...');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); 
    const fontResponse = await fetch(fontUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (fontResponse.ok) {
      const fontBuffer = await fontResponse.arrayBuffer();
      // We write the file to the virtual root
      await ffmpegInstance.writeFile('font.ttf', new Uint8Array(fontBuffer));
      onLog('Font font.ttf (Noto Sans SC) loaded into memory.');
    } else {
      onLog('Font download failed. Subtitles might not render Chinese characters correctly.');
    }
  } catch (e) {
    onLog('Font download error, attempting with system defaults.');
  }

  // 3. Execute Command
  onLog('Hardcoding subtitles... Rendering CJK glyphs can be intensive.');
  
  try {
    /**
     * libass filter in WASM notes:
     * - 'fontsdir=/': Essential to find our uploaded .ttf
     * - 'FontName=Noto Sans SC': Must match the internal font name of the .ttf file
     * - 'FontSize=22': Adjusted for better readability on 1080p
     */
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', "subtitles=filename=subs.srt:fontsdir=/:force_style='FontName=Noto Sans SC,FontSize=22,MarginV=30,Outline=1,Shadow=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'",
      '-c:v', 'libx264',
      '-profile:v', 'main',
      '-level', '3.1',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-preset', 'ultrafast',
      '-crf', '26',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
  } catch (err: any) {
    onLog(`FFmpeg Execution Error: ${err.message}`);
    throw err;
  }

  onLog('Finalizing video container...');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  // Clean up memory
  try {
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('subs.srt');
    try { await ffmpegInstance.deleteFile('font.ttf'); } catch (e) {}
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {
    console.warn('Cleanup minor error.');
  }

  return new Blob([data], { type: 'video/mp4' });
};
