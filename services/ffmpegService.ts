
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
  
  onLog?.('Initializing FFmpeg Engine (WASM)...');
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
};

/**
 * Merges video and subtitles using the subtitles filter.
 */
export const mergeVideoAndSubtitles = async (
  videoFile: File,
  subtitleContent: string,
  onProgress: (progress: number) => void,
  onLog: (message: string) => void
): Promise<Blob> => {
  const ffmpegInstance = await getFFmpeg(onLog);

  ffmpegInstance.on('log', ({ message }) => {
    onLog(message);
    console.debug('[FFmpeg Output]', message);
  });

  ffmpegInstance.on('progress', ({ progress }) => {
    onProgress(Math.round(progress * 100));
  });

  // 1. Setup Virtual File System
  onLog('Preparing workspace...');
  const videoData = await fetchFile(videoFile);
  await ffmpegInstance.writeFile('input.mp4', videoData);
  
  // Use .ass extension for bilingual content
  const cleanSubs = subtitleContent.replace(/^\uFEFF/, '').trim();
  await ffmpegInstance.writeFile('subtitles.ass', new TextEncoder().encode(cleanSubs));

  // 2. Load Universal Font (Noto Sans SC)
  const FONT_URL = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSansSC/NotoSansSC-Regular.ttf';
  const FONT_NAME = 'NotoSansSC-Regular.ttf';

  onLog(`Fetching font: ${FONT_NAME}...`);
  try {
    const fontRes = await fetch(FONT_URL);
    if (!fontRes.ok) throw new Error("Font download failed");
    const fontBuffer = await fontRes.arrayBuffer();
    await ffmpegInstance.writeFile(FONT_NAME, new Uint8Array(fontBuffer));
    onLog(`Font registered successfully.`);
  } catch (e) {
    onLog('Warning: Font failed to load. Subtitles might not render or use fallback fonts.');
  }

  // 3. Execute Synthesis Command
  onLog('Executing Synthesis (Burning Subtitles)...');
  
  try {
    // We point to the current directory for fonts.
    // We use the 'subtitles' filter which is standard for both srt and ass in ffmpeg.
    // force_style is used as a fallback if the ASS file styles are missing.
    const filter = `subtitles=subtitles.ass:fontsdir=.:force_style='Fontname=NotoSansSC-Regular,FontSize=20'`;
    
    onLog(`Filter: ${filter}`);

    const exitCode = await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', filter,
      '-c:v', 'libx264',
      '-preset', 'ultrafast', 
      '-crf', '22',           
      '-c:a', 'copy',         
      '-pix_fmt', 'yuv420p',
      'output.mp4'
    ]);

    if (exitCode !== 0) {
      throw new Error(`FFmpeg error (Code ${exitCode}). The subtitle filter might have failed.`);
    }
  } catch (err: any) {
    onLog(`Synthesis Failed: ${err.message}`);
    throw err;
  }

  onLog('Exporting Final Master...');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  if (!data || (data instanceof Uint8Array && data.length === 0)) {
     throw new Error("Synthesis produced an empty file.");
  }

  // Cleanup
  try {
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('subtitles.ass');
    await ffmpegInstance.deleteFile(FONT_NAME);
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {}

  return new Blob([data], { type: 'video/mp4' });
};
