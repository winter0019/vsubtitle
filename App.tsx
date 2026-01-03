
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ProcessingStatus, TranslationModel } from './types';
import { translateSubtitles } from './services/geminiService';
import { mergeVideoAndSubtitles, getFFmpeg } from './services/ffmpegService';
import StepCard from './components/StepCard';

const App: React.FC = () => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtContent, setSrtContent] = useState<string>('');
  const [targetLanguage, setTargetLanguage] = useState('Chinese (Simplified)');
  const [status, setStatus] = useState<ProcessingStatus>({
    step: 'idle',
    progress: 0,
    message: 'Ready to start'
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-50), msg]); // Keep last 50 lines
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
    }
  };

  const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSrtFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setSrtContent(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const processWorkflow = async () => {
    if (!videoFile || (!srtFile && !srtContent)) {
      alert("Please upload both a video file and subtitle file.");
      return;
    }

    try {
      setResultVideoUrl(null);
      setLogs([]);
      
      // Step 1: Translation
      setStatus({ step: 'translating', progress: 10, message: 'Gemini is generating bilingual subtitles...' });
      addLog('Starting Gemini translation...');
      const bilingualSrt = await translateSubtitles(srtContent, targetLanguage);
      setSrtContent(bilingualSrt);
      addLog('Translation successful.');

      // Step 2: Merging
      setStatus({ step: 'merging', progress: 0, message: 'Hardcoding subtitles into video...' });
      const mergedBlob = await mergeVideoAndSubtitles(
        videoFile, 
        bilingualSrt, 
        (p) => setStatus(prev => ({ ...prev, progress: p })),
        addLog
      );

      const url = URL.createObjectURL(mergedBlob);
      setResultVideoUrl(url);
      setStatus({ step: 'completed', progress: 100, message: 'Success! Your video is ready.' });
      addLog('Process completed successfully.');
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message || 'An unknown error occurred';
      setStatus({ step: 'error', progress: 0, message: errorMsg });
      addLog(`ERROR: ${errorMsg}`);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
      <header className="text-center mb-12">
        <h1 className="text-4xl md:text-6xl font-black mb-4 tracking-tight">
          SubMerge <span className="gradient-text">AI</span>
        </h1>
        <p className="text-slate-400 text-lg">Download, Translate with Gemini, and Hardcode Subtitles in One Flow.</p>
      </header>

      <div className="grid gap-6">
        {/* STEP 1: DOWNLOAD PREP */}
        <StepCard
          number={1}
          title="Prepare YouTube Video"
          description="Use y2down.app to download your 1080p MP4 and Auto-Generated SRT."
          isCompleted={!!videoFile && !!srtFile}
          isActive={!videoFile || !srtFile}
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="Paste YouTube Link here..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <a 
                href={youtubeUrl ? `https://en.y2down.app/?url=${encodeURIComponent(youtubeUrl)}` : 'https://en.y2down.app/'}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-sky-600 hover:bg-sky-500 px-6 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                Go to Downloader <i className="fas fa-external-link-alt text-xs"></i>
              </a>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${videoFile ? 'border-green-500 bg-green-500/10' : 'border-slate-700 hover:border-sky-500 bg-slate-800/50'}`}
              >
                <input type="file" ref={fileInputRef} onChange={handleVideoUpload} accept="video/mp4" className="hidden" />
                <i className={`fas ${videoFile ? 'fa-check-circle' : 'fa-video'} text-3xl mb-2 text-sky-400`}></i>
                <p className="text-sm font-medium">{videoFile ? videoFile.name : 'Upload 1080p MP4'}</p>
              </div>

              <div 
                onClick={() => srtInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${srtFile ? 'border-green-500 bg-green-500/10' : 'border-slate-700 hover:border-sky-500 bg-slate-800/50'}`}
              >
                <input type="file" ref={srtInputRef} onChange={handleSrtUpload} accept=".srt" className="hidden" />
                <i className={`fas ${srtFile ? 'fa-check-circle' : 'fa-closed-captioning'} text-3xl mb-2 text-sky-400`}></i>
                <p className="text-sm font-medium">{srtFile ? srtFile.name : 'Upload SRT File'}</p>
              </div>
            </div>
          </div>
        </StepCard>

        {/* STEP 2: AI TRANSLATION CONFIG */}
        <StepCard
          number={2}
          title="Bilingual AI Translation"
          description="Configure how Gemini should translate and format your subtitles."
          isCompleted={status.step === 'completed'}
          isActive={!!videoFile && !!srtFile && status.step !== 'completed'}
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase text-slate-500">Target Language</label>
              <select 
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
              >
                <option>Chinese (Simplified)</option>
                <option>Chinese (Traditional)</option>
                <option>Spanish</option>
                <option>French</option>
                <option>Japanese</option>
                <option>Korean</option>
                <option>German</option>
              </select>
            </div>

            <div className="flex items-center gap-2 p-3 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-200 text-sm">
              <i className="fas fa-magic"></i>
              <span>Gemini will create a bilingual layout (Original + Translated) automatically.</span>
            </div>

            {status.step === 'idle' || status.step === 'error' ? (
              <button 
                onClick={processWorkflow}
                className="w-full bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 py-4 rounded-xl font-bold text-lg shadow-lg shadow-sky-900/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                Start Merging Process <i className="fas fa-bolt"></i>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between text-sm mb-1 font-medium">
                  <span className="flex items-center gap-2">
                    {status.step === 'merging' && <i className="fas fa-circle-notch animate-spin text-sky-400"></i>}
                    {status.message}
                  </span>
                  <span className="text-sky-400">{status.progress}%</span>
                </div>
                <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                    style={{ width: `${status.progress}%` }}
                  ></div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={() => setShowLogs(!showLogs)}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors uppercase font-bold tracking-widest"
                  >
                    {showLogs ? 'Hide Logs' : 'Show Processing Logs'}
                  </button>
                  {showLogs && (
                    <div className="mt-2 bg-black/50 rounded-lg p-3 h-32 overflow-y-auto font-mono text-[10px] text-slate-400 border border-slate-700">
                      {logs.map((log, i) => (
                        <div key={i} className="mb-0.5 line-clamp-1">{`> ${log}`}</div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {status.step === 'error' && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-3">
                 <i className="fas fa-exclamation-triangle mt-0.5"></i>
                 <span>{status.message}</span>
              </div>
            )}
          </div>
        </StepCard>

        {/* STEP 3: RESULT */}
        {status.step === 'completed' && resultVideoUrl && (
          <StepCard
            number={3}
            title="Download Result"
            description="Your hardcoded subtitled video is ready for download."
            isCompleted={true}
            isActive={true}
          >
            <div className="space-y-6">
              <div className="aspect-video rounded-xl overflow-hidden bg-black border border-slate-700 shadow-2xl ring-1 ring-white/10">
                <video src={resultVideoUrl} controls className="w-full h-full" />
              </div>
              <a 
                href={resultVideoUrl}
                download={`subtitled_${videoFile?.name || 'video.mp4'}`}
                className="w-full bg-green-600 hover:bg-green-500 py-4 rounded-xl font-bold text-lg text-center block transition-all shadow-lg shadow-green-900/20 active:scale-[0.98]"
              >
                Download Final MP4 <i className="fas fa-download ml-2"></i>
              </a>
              <button 
                onClick={() => window.location.reload()}
                className="w-full text-slate-400 hover:text-white transition-colors text-sm font-medium"
              >
                Process another video
              </button>
            </div>
          </StepCard>
        )}
      </div>

      <footer className="mt-20 py-8 border-t border-slate-800 text-center text-slate-500 text-xs leading-relaxed">
        <p>Built with Gemini AI & FFmpeg.wasm</p>
        <p className="mt-2 text-slate-600">
          Note: Processing is done entirely in your browser. <br/>
          Requires <strong>SharedArrayBuffer</strong> support and sufficient RAM for 1080p encoding.
        </p>
      </footer>
    </div>
  );
};

export default App;
