
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
  onLog('Preparing virtual environment...');
  const videoData = await fetchFile(videoFile);
  await ffmpegInstance.writeFile('input.mp4', videoData);
  
  // Clean SRT: Remove BOM, normalize line endings, ensure UTF-8 encoding
  const cleanSrt = srtContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(cleanSrt));
  
  // 2. Load CJK Font (Noto Sans SC)
  // This matches the Noto Sans SC font shown in your local directory
  const fontUrl = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSansSC/NotoSansSC-Regular.ttf';
  
  onLog('Downloading Noto Sans SC (Simplified Chinese) font...');
  try {
    const fontResponse = await fetch(fontUrl);
    if (fontResponse.ok) {
      const fontBuffer = await fontResponse.arrayBuffer();
      
      // Create a dedicated fonts directory to prevent libass from scanning input.mp4 as a font
      try { await ffmpegInstance.createDir('/fonts'); } catch(e) {}
      await ffmpegInstance.writeFile('/fonts/noto.ttf', new Uint8Array(fontBuffer));
      onLog('Font correctly isolated in /fonts/noto.ttf');
    }
  } catch (e) {
    onLog(`Warning: Font error (${(e as Error).message}). Subtitles may appear as boxes.`);
  }

  // 3. Execute Command
  onLog('Hardcoding subtitles into video stream...');
  
  try {
    /**
     * Optimized Filter Configuration:
     * - 'fontsdir=/fonts': Directs libass to the isolated font folder.
     * - 'Fontname=Noto Sans SC': Internal name of the font we just saved.
     * - 'MarginV=30': Positions subtitles slightly higher for better readability.
     */
    const filter = "subtitles=subs.srt:fontsdir=/fonts:force_style='Fontname=Noto Sans SC,Fontsize=22,MarginV=30,Outline=1,Shadow=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'";
    
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', filter,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '26',
      '-c:a', 'copy', // Pass-through original audio for maximum speed
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
  } catch (err: any) {
    onLog(`FFmpeg Execution Failed: ${err.message}`);
    throw err;
  }

  onLog('Render complete. Fetching video data...');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  // Virtual FS Cleanup
  try {
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('subs.srt');
    try { await ffmpegInstance.deleteFile('/fonts/noto.ttf'); } catch(e) {}
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {}

  return new Blob([data], { type: 'video/mp4' });
};
