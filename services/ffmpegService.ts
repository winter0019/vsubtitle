
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
  onLog('Writing files to memory...');
  const videoData = await fetchFile(videoFile);
  await ffmpegInstance.writeFile('input.mp4', videoData);
  
  // Normalize line endings for SRT to ensure FFmpeg parses correctly
  const normalizedSrt = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(normalizedSrt));

  // 2. Load Font
  const fontUrl = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@master/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
  onLog('Preparing font environment...');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); 
    const fontResponse = await fetch(fontUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (fontResponse.ok) {
      const fontBuffer = await fontResponse.arrayBuffer();
      // We explicitly name this Arial.ttf so it maps to the FontName property
      await ffmpegInstance.writeFile('Arial.ttf', new Uint8Array(fontBuffer));
      onLog('Font environment ready.');
    }
  } catch (e) {
    onLog('Font load skipped; using internal defaults.');
  }

  // 3. Execute Command
  onLog('Starting hardcoding process... Please keep this tab active.');
  
  try {
    /**
     * Web Compatibility Flags:
     * -vf subtitles: The core filter. 
     * force_style: FontName=Arial is crucial here to match the file we wrote.
     * MarginV=30: Raised slightly for better visibility.
     */
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', "subtitles=subs.srt:fontsdir=/:force_style='FontName=Arial,FontSize=24,MarginV=30,Outline=1,Shadow=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'",
      '-c:v', 'libx264',
      '-profile:v', 'main',
      '-level', '3.1',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
  } catch (err: any) {
    onLog(`FFmpeg Execution Error: ${err.message}`);
    throw err;
  }

  onLog('Finalizing build...');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  // Clean up memory
  try {
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('subs.srt');
    // Use a safer check for deleting the font file
    try { await ffmpegInstance.deleteFile('Arial.ttf'); } catch (e) {}
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {
    console.warn('Cleanup failed, but processing succeeded.');
  }

  return new Blob([data], { type: 'video/mp4' });
};
