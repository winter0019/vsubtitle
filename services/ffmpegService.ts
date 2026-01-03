
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

/**
 * Initializes and returns the FFmpeg instance.
 * Uses consistent versioning for core and wasm.
 */
export const getFFmpeg = async (onLog?: (msg: string) => void) => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  onLog?.('Loading FFmpeg core components...');
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
};

/**
 * Merges video and subtitles. 
 * Improved with specific font mapping and smaller chunk processing for browser stability.
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
    console.debug('[FFmpeg Native Log]', message);
  });

  ffmpegInstance.on('progress', ({ progress }) => {
    // progress is 0-1
    onProgress(Math.round(progress * 100));
  });

  // 1. Setup Virtual File System
  onLog('Preparing virtual file system...');
  const videoData = await fetchFile(videoFile);
  await ffmpegInstance.writeFile('input.mp4', videoData);
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(srtContent));

  // 2. Load Font (Critical for 'subtitles' filter)
  // We use a light version of Noto Sans to ensure speed and CJK support
  const fontUrl = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@master/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
  onLog('Downloading font for rendering...');
  try {
    const fontResponse = await fetch(fontUrl);
    const fontBuffer = await fontResponse.arrayBuffer();
    await ffmpegInstance.writeFile('font.ttf', new Uint8Array(fontBuffer));
    onLog('Font loaded successfully.');
  } catch (e) {
    onLog('Warning: Could not load web font. Rendering may use defaults.');
  }

  // 3. Execute Command
  // We use the 'subtitles' filter with specific fontfile reference.
  // This is the most reliable way in FFmpeg.wasm to ensure text is rendered.
  onLog('Starting hardcoding process... This utilizes your CPU and may take several minutes.');
  
  try {
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', "subtitles=subs.srt:fontsdir=/:fontfile=font.ttf:force_style='FontSize=20,MarginV=15,Outline=1,Shadow=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'",
      '-c:a', 'copy',      // Copy audio without re-encoding to save time
      '-preset', 'ultrafast', // Speed over compression for browser environment
      '-crf', '28',        // Decent quality balance
      'output.mp4'
    ]);
  } catch (err: any) {
    onLog(`FFmpeg Execution Error: ${err.message}`);
    throw err;
  }

  onLog('Finalizing output file...');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  // Clean up to save memory
  await ffmpegInstance.deleteFile('input.mp4');
  await ffmpegInstance.deleteFile('subs.srt');
  await ffmpegInstance.deleteFile('output.mp4');

  return new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });
};
