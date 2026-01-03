
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
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(srtContent));

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
     * -c:v libx264: Explicitly use H.264
     * -profile:v main -level 3.1: Standard profile for web playback.
     * -c:a aac: Re-encode audio to ensure timing compatibility with the new video stream.
     * -pix_fmt yuv420p: Standard 8-bit color space.
     * -movflags +faststart: Moves metadata to the start.
     */
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', "subtitles=subs.srt:fontsdir=/:force_style='FontSize=24,MarginV=20,Outline=1,Shadow=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'",
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
    if (await ffmpegInstance.readFile('Arial.ttf')) await ffmpegInstance.deleteFile('Arial.ttf');
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {
    console.warn('Cleanup failed, but processing succeeded.');
  }

  // Return a fresh blob with correct MIME type
  return new Blob([data], { type: 'video/mp4' });
};
