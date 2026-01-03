
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export const getFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
};

/**
 * Merges video and subtitles using FFmpeg.wasm.
 * Includes fetching a font file to ensure the 'subtitles' filter works correctly.
 */
export const mergeVideoAndSubtitles = async (
  videoFile: File,
  srtContent: string,
  onProgress: (progress: number) => void,
  onLog: (message: string) => void
): Promise<Blob> => {
  const ffmpegInstance = await getFFmpeg();

  ffmpegInstance.on('log', ({ message }) => {
    onLog(message);
    console.log('[FFmpeg]', message);
  });

  ffmpegInstance.on('progress', ({ progress }) => {
    // FFmpeg.wasm progress is 0-1
    onProgress(Math.round(progress * 100));
  });

  // 1. Load Font (Required for 'subtitles' filter to render text)
  // Using a compact Noto Sans SC font from a reliable CDN
  const fontUrl = 'https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/Variable/OTC/NotoSansCJKsc-VF.otf';
  onLog('Loading font assets...');
  try {
    const fontData = await fetchFile(fontUrl);
    await ffmpegInstance.writeFile('font.otf', fontData);
  } catch (e) {
    onLog('Warning: Could not load external font, falling back to system defaults.');
  }

  // 2. Write files to virtual FS
  onLog('Preparing files for processing...');
  await ffmpegInstance.writeFile('video.mp4', await fetchFile(videoFile));
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(srtContent));

  // 3. Execute FFmpeg command
  // Following the user's specific request: 
  // subtitles='subs.srt':force_style='FontName=Noto Sans SC,FontSize=18,MarginV=14,Outline=2,Shadow=1'
  // Note: We map our loaded font file 'font.otf' via a fontconfig-like mechanism in FFmpeg.wasm if possible, 
  // but usually just providing the path in the filter is safer if fontconfig isn't fully initialized.
  
  onLog('Starting hardcoding process. This may take a while depending on video length...');
  
  // We use the 'subtitles' filter. 
  // To ensure the font is found, we can try to point to it, though standard FFmpeg.wasm 
  // builds use internal fonts if provided or fall back.
  await ffmpegInstance.exec([
    '-i', 'video.mp4',
    '-vf', "subtitles=subs.srt:fontsdir=/:force_style='FontName=Noto Sans CJK SC,FontSize=18,MarginV=14,Outline=2,Shadow=1'",
    '-c:a', 'copy',
    '-preset', 'veryfast', // Optimization for browser execution
    'output.mp4'
  ]);

  onLog('Reading final output...');
  const data = await ffmpegInstance.readFile('output.mp4');
  return new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });
};
