
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
    console.debug('[FFmpeg Output]', message);
  });

  ffmpegInstance.on('progress', ({ progress }) => {
    onProgress(Math.round(progress * 100));
  });

  // 1. Setup Virtual File System in Root (/)
  onLog('Preparing virtual workspace in root directory...');
  const videoData = await fetchFile(videoFile);
  await ffmpegInstance.writeFile('input.mp4', videoData);
  
  // Normalize SRT for UTF-8 compatibility and standard line endings
  const cleanSrt = srtContent
    .replace(/^\uFEFF/, '') 
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim() + '\n\n';
    
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(cleanSrt));
  onLog(`SRT file written to virtual root.`);

  // 2. Load Universal Fonts (CJK + Latin)
  const fonts = [
    {
      name: 'noto.ttf',
      url: 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSansSC/NotoSansSC-Regular.ttf'
    },
    {
      name: 'noto_latin.ttf',
      url: 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSans/NotoSans-Regular.ttf'
    }
  ];

  for (const font of fonts) {
    onLog(`Downloading font: ${font.name}...`);
    try {
      const response = await fetch(font.url);
      if (!response.ok) throw new Error(`Failed to download ${font.name}`);
      const buffer = await response.arrayBuffer();
      await ffmpegInstance.writeFile(font.name, new Uint8Array(buffer));
    } catch (e) {
      onLog(`Warning: Font ${font.name} failed to load.`);
    }
  }

  // 3. Execute Hardcoding Command
  // Using the exact parameters from your working CLI: FontName, FontSize, MarginV
  onLog('Burning bilingual subtitles... This is a CPU-intensive local process.');
  
  try {
    /**
     * Filter Breakdown:
     * - subtitles=subs.srt: Source file in the same directory.
     * - fontsdir=/: Explicitly look in the root virtual folder for noto.ttf.
     * - force_style: Exact styles from your working Windows CLI command.
     */
    const filter = "subtitles=subs.srt:fontsdir=/:force_style='FontName=Noto Sans SC,FontSize=18,MarginV=14,Outline=1,Shadow=0,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'";
    
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', filter,
      '-map', '0:v:0',        // Select only the first video stream (ignoring thumbnails)
      '-map', '0:a?',          // Select audio if available
      '-c:v', 'libx264',
      '-preset', 'ultrafast',  // Critical for browser-based encoding speed
      '-crf', '23',           
      '-c:a', 'copy',          // Direct audio copy to save time
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
  } catch (err: any) {
    onLog(`FFmpeg Execution Error: ${err.message}`);
    throw err;
  }

  onLog('Finalizing video result...');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  // Cleanup virtual files to prevent browser memory leaks
  try {
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('subs.srt');
    await ffmpegInstance.deleteFile('noto.ttf');
    await ffmpegInstance.deleteFile('noto_latin.ttf');
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {}

  return new Blob([data], { type: 'video/mp4' });
};
