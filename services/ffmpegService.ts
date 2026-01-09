
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
 * Merges video and subtitles with precise font rendering matching successful local command.
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
    console.debug('[FFmpeg Output]', message);
  });

  ffmpegInstance.on('progress', ({ progress }) => {
    onProgress(Math.round(progress * 100));
  });

  // 1. Setup Virtual File System
  onLog('Preparing workspace...');
  const videoData = await fetchFile(videoFile);
  await ffmpegInstance.writeFile('input.mp4', videoData);
  
  // Normalize SRT content for strict compatibility
  const cleanSrt = srtContent
    .replace(/^\uFEFF/, '') 
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim() + '\n\n';
    
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(cleanSrt));

  // 2. Load Universal Font (Noto Sans SC)
  // Renaming to match expected internal metadata for better libass resolution in WASM
  const FONT_URL = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSansSC/NotoSansSC-Regular.ttf';
  const FONT_NAME = 'NotoSansSC-Regular.ttf';

  onLog('Registering Typography Engine (Noto Sans SC)...');
  try {
    const fontRes = await fetch(FONT_URL);
    if (!fontRes.ok) throw new Error("Font fetch failed");
    const fontBuffer = await fontRes.arrayBuffer();
    await ffmpegInstance.writeFile(FONT_NAME, new Uint8Array(fontBuffer));
    onLog('Typography Engine Ready.');
  } catch (e) {
    onLog('Warning: Font failed to load. Falling back to default.');
  }

  // 3. Execute Hardcoding Command
  onLog('Executing Synthesis (Burning Subtitles)...');
  
  try {
    /**
     * User's successful local command:
     * -vf "subtitles='subs.srt':force_style='FontName=Noto Sans SC,FontSize=18,MarginV=14,Outline=2,Shadow=1'"
     */
    const style = "FontName=Noto Sans SC,FontSize=18,MarginV=14,Outline=2,Shadow=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000";
    // We use fontsdir=/ to ensure libass picks up the .ttf we just wrote
    const filter = `subtitles='subs.srt':fontsdir=/:force_style='${style}'`;
    
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', filter,
      '-c:v', 'libx264',
      '-preset', 'ultrafast', 
      '-crf', '23',           // Matched to common high-quality default
      '-c:a', 'copy',          // Preserve original audio
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
  } catch (err: any) {
    onLog(`Critical Engine Error: ${err.message}`);
    throw err;
  }

  onLog('Exporting Master Stream...');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  // Cleanup
  try {
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('subs.srt');
    await ffmpegInstance.deleteFile(FONT_NAME);
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {}

  return new Blob([data], { type: 'video/mp4' });
};
