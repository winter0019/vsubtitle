
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
  onLog('Preparing virtual workspace...');
  const videoData = await fetchFile(videoFile);
  await ffmpegInstance.writeFile('input.mp4', videoData);
  
  // Clean SRT: Remove BOM, normalize line endings, and ensure it's not empty
  const cleanSrt = srtContent
    .replace(/^\uFEFF/, '') 
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim() + '\n\n';
    
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(cleanSrt));
  onLog(`SRT file written (${cleanSrt.length} bytes)`);

  // 2. Load CJK Font
  // We use Noto Sans SC to ensure Chinese characters render correctly.
  const fontUrl = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSansSC/NotoSansSC-Regular.ttf';
  
  onLog('Loading Noto Sans SC font for CJK support...');
  try {
    const fontResponse = await fetch(fontUrl);
    if (!fontResponse.ok) throw new Error('Font download failed');
    const fontBuffer = await fontResponse.arrayBuffer();
    
    // We create a specific path for the font to help libass find it
    await ffmpegInstance.writeFile('noto.ttf', new Uint8Array(fontBuffer));
    onLog('Font loaded: noto.ttf');
  } catch (e) {
    onLog(`Warning: Font loading failed: ${(e as Error).message}. CJK characters may not appear.`);
  }

  // 3. Execute Hardcoding Command
  onLog('Baking subtitles... This process is CPU intensive.');
  
  try {
    /**
     * Filter Breakdown:
     * - subtitles=subs.srt: Source SRT file.
     * - fontsdir=.: Tells libass to look in the current directory for fonts.
     * - force_style:
     *    - Fontname=Noto Sans SC: Matches the internal name of our noto.ttf.
     *    - Fontsize=24: Increased for better visibility.
     *    - Alignment=2: Bottom-center.
     */
    const filter = "subtitles=subs.srt:fontsdir=.:force_style='Fontname=Noto Sans SC,Fontsize=24,MarginV=25,Outline=1.5,Shadow=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'";
    
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', filter,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '24',           // Slightly better quality than 26
      '-c:a', 'copy',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
  } catch (err: any) {
    onLog(`FFmpeg Error: ${err.message}`);
    throw err;
  }

  onLog('Rendering complete. Preparing download...');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  // Cleanup to free up browser memory
  try {
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('subs.srt');
    await ffmpegInstance.deleteFile('noto.ttf');
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {}

  return new Blob([data], { type: 'video/mp4' });
};
