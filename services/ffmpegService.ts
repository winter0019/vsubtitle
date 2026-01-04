
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
 * Merges video and subtitles with universal font support.
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
  onLog('Preparing virtual workspace...');
  const videoData = await fetchFile(videoFile);
  await ffmpegInstance.writeFile('input.mp4', videoData);
  
  // Normalize SRT for UTF-8 compatibility
  const cleanSrt = srtContent
    .replace(/^\uFEFF/, '') 
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim() + '\n\n';
    
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(cleanSrt));

  // 2. Load Universal Fonts (CJK + Latin)
  const fontFiles = [
    { 
      name: 'noto.ttf', 
      url: 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSansSC/NotoSansSC-Regular.ttf' 
    },
    { 
      name: 'noto_latin.ttf', 
      url: 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSans/NotoSans-Regular.ttf' 
    }
  ];

  for (const font of fontFiles) {
    onLog(`Loading font: ${font.name}...`);
    try {
      const response = await fetch(font.url);
      if (!response.ok) throw new Error(`Failed to download ${font.name}`);
      const buffer = await response.arrayBuffer();
      await ffmpegInstance.writeFile(font.name, new Uint8Array(buffer));
    } catch (e) {
      onLog(`Warning: Font ${font.name} loading failed. Falling back to default.`);
    }
  }

  // 3. Execute Hardcoding Command
  onLog('Burning bilingual subtitles... This is a high-load process.');
  
  try {
    /**
     * Filter Breakdown:
     * - subtitles=subs.srt: Source SRT.
     * - fontsdir=/: Look in the root for ttf files.
     * - force_style: Exact styles for Noto Sans SC (covers English and Chinese).
     */
    const filter = "subtitles=subs.srt:fontsdir=/:force_style='FontName=Noto Sans SC,FontSize=18,MarginV=14,Outline=1,Shadow=0,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'";
    
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', filter,
      '-map', '0:v:0',        // Select primary video stream
      '-map', '0:a?',          // Copy audio if it exists
      '-c:v', 'libx264',
      '-preset', 'ultrafast',  // Faster browser encoding
      '-crf', '23',           
      '-c:a', 'copy',          // No audio re-encoding
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
  } catch (err: any) {
    onLog(`FFmpeg Error: ${err.message}`);
    throw err;
  }

  onLog('Success! Finalizing video blob...');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  // Cleanup
  try {
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('subs.srt');
    await ffmpegInstance.deleteFile('noto.ttf');
    await ffmpegInstance.deleteFile('noto_latin.ttf');
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {}

  return new Blob([data], { type: 'video/mp4' });
};
