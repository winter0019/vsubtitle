
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
  
  // Normalize line endings and ensure clean UTF-8 string
  const normalizedSrt = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalizedSrt || normalizedSrt.length < 10) {
    throw new Error("The subtitle content is empty or invalid.");
  }
  
  await ffmpegInstance.writeFile('subs.srt', new TextEncoder().encode(normalizedSrt));
  onLog(`SRT Ready. Length: ${normalizedSrt.length} chars.`);

  // 2. Load CJK-Compatible Font into a dedicated directory
  // We place it in /fonts to avoid libass scanning the root directory (which contains input.mp4)
  const fontUrl = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/master/hinted/ttf/NotoSansSC/NotoSansSC-Regular.ttf';
  
  onLog('Downloading Noto Sans SC (Simplified Chinese) font...');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); 
    const fontResponse = await fetch(fontUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (fontResponse.ok) {
      const fontBuffer = await fontResponse.arrayBuffer();
      
      // Create dedicated fonts directory
      await ffmpegInstance.createDir('/fonts');
      await ffmpegInstance.writeFile('/fonts/noto.ttf', new Uint8Array(fontBuffer));
      onLog('Font /fonts/noto.ttf loaded and isolated.');
    } else {
      onLog('Warning: Font download failed. Using fallbacks.');
    }
  } catch (e) {
    onLog(`Warning: Font loading error (${(e as Error).message}).`);
  }

  // 3. Execute Command
  onLog('Baking bilingual subtitles into video stream...');
  
  try {
    /**
     * libass filter in WASM configuration:
     * - 'fontsdir=/fonts': Crucial! Points libass specifically to our isolated font folder.
     * - 'FontName=Noto Sans SC': Internal metadata name for Noto Sans SC Regular.
     * - 'FontSize=22': Sized for 1080p viewing.
     */
    await ffmpegInstance.exec([
      '-i', 'input.mp4',
      '-vf', "subtitles=subs.srt:fontsdir=/fonts:force_style='FontName=Noto Sans SC,FontSize=22,MarginV=30,Outline=1,Shadow=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'",
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '26', // Higher quality than 28
      '-c:a', 'copy', // Much faster, avoids re-encoding audio
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
  } catch (err: any) {
    onLog(`FFmpeg Execution Error: ${err.message}`);
    throw err;
  }

  onLog('Processing complete. Finalizing output.');
  const data = await ffmpegInstance.readFile('output.mp4');
  
  // Cleanup virtual files to free memory
  try {
    await ffmpegInstance.deleteFile('input.mp4');
    await ffmpegInstance.deleteFile('subs.srt');
    try { 
        await ffmpegInstance.deleteFile('/fonts/noto.ttf'); 
        // Note: deleteDir might not be supported in all builds, but deleting the file is enough
    } catch (e) {}
    await ffmpegInstance.deleteFile('output.mp4');
  } catch (e) {}

  return new Blob([data], { type: 'video/mp4' });
};
