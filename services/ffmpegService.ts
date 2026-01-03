
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
  if (!normalizedSrt || normalizedSrt.length < 10) {
    throw new Error("The subtitle content is empty or invalid.");
  }
  
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(normalizedSrt));
  onLog(`SRT Ready. Length: ${normalizedSrt.length} chars.`);

  // 2. Load CJK-Compatible Font
  // Using a TTF version of Noto Sans SC which is more compatible with libass in WASM
  const fontUrl = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSansSC/NotoSansSC-Regular.ttf';
  
  onLog('Downloading Noto Sans SC font (Full CJK Support)...');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); 
    const fontResponse = await fetch(fontUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (fontResponse.ok) {
      const fontBuffer = await fontResponse.arrayBuffer();
      // Write font to the same directory as the SRT
      await ffmpegInstance.writeFile('NotoSansSC-Regular.ttf', new Uint8Array(fontBuffer));
      onLog('Font NotoSansSC-Regular.ttf loaded.');
    } else {
      onLog('Warning: Font download failed. Subtitles might not render correctly.');
    }
  } catch (e) {
    onLog(`Warning: Font error (${(e as Error).message}).`);
  }

  // 3. Execute Command
  onLog('Merging subtitles... This process runs entirely in your browser.');
  
  try {
    /**
     * libass filter in WASM configuration:
     * - 'fontsdir=.': Look for font files in the current working directory
     * - 'FontName=Noto Sans SC': Internal name for Noto Sans SC Regular
     * - 'FontSize=20': Adjusted size for bilingual text
     */
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', "subtitles=subs.srt:fontsdir=.:force_style='FontName=Noto Sans SC,FontSize=20,MarginV=30,Outline=1,Shadow=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'",
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-c:a', 'copy', // Copying audio is much faster than re-encoding
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
  } catch (err: any) {
    onLog(`FFmpeg Execution Error: ${err.message}`);
    throw err;
  }

  onLog('Finalizing output...');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  // Cleanup virtual files to free memory
  try {
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('subs.srt');
    try { await ffmpegInstance.deleteFile('NotoSansSC-Regular.ttf'); } catch (e) {}
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {}

  return new Blob([data], { type: 'video/mp4' });
};
