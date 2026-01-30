
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
 * Correctly escapes commas in force_style to prevent the FFmpeg parser from breaking.
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
  
  // Even if content is ASS, the user requested a filter referencing 'subs.srt'
  const cleanSubs = subtitleContent.replace(/^\uFEFF/, '').trim();
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(cleanSubs));

  // 2. Load Universal Font (Noto Sans SC)
  // Internal family name is 'NotoSansSC-Regular'
  const FONT_URL = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSansSC/NotoSansSC-Regular.ttf';
  const FONT_NAME = 'NotoSansSC-Regular.ttf';

  onLog(`Downloading font asset: ${FONT_NAME}...`);
  try {
    const fontRes = await fetch(FONT_URL);
    const fontBuffer = await fontRes.arrayBuffer();
    await ffmpegInstance.writeFile(FONT_NAME, new Uint8Array(fontBuffer));
    onLog(`Font loaded into virtual root. Targeted Name: NotoSansSC-Regular`);
  } catch (e) {
    onLog('Warning: Font asset failed. Falling back to default system fonts.');
  }

  // 3. Execute Synthesis Command
  onLog('Executing Synthesis (Hardcoding Subtitles)...');
  
  try {
    /**
     * FIX: To avoid "No such filter: FontSize", we MUST escape commas inside force_style
     * because the filtergraph parser sees commas as filter separators.
     * We use backslash escaping as requested by "removing unnecessary quotes".
     */
    const styleString = 'FontName=NotoSansSC-Regular\\,FontSize=18\\,MarginV=14\\,Outline=2\\,Shadow=1';
    const filter = `subtitles=subs.srt:fontsdir=.:force_style=${styleString}`;
    
    onLog(`Filter configured: ${filter}`);

    const exitCode = await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', filter,
      '-c:v', 'libx264',
      '-preset', 'ultrafast', 
      '-crf', '23',           
      '-c:a', 'copy',         
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4'
    ]);

    if (exitCode !== 0) {
      throw new Error(`FFmpeg exit code: ${exitCode}. Check logs for filter resolution errors.`);
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
    await ffmpegInstance.deleteFile('subs.srt');
    await ffmpegInstance.deleteFile(FONT_NAME);
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {}

  return new Blob([data], { type: 'video/mp4' });
};
