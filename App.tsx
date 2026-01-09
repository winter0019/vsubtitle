
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ProcessingStatus, TranslationModel } from './types.ts';
import { translateSubtitles } from './services/geminiService.ts';
import { mergeVideoAndSubtitles } from './services/ffmpegService.ts';
import StepCard from './components/StepCard.tsx';

const App: React.FC = () => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [originalSrtContent, setOriginalSrtContent] = useState<string>('');
  const [targetLanguage, setTargetLanguage] = useState('Chinese (Simplified)');
  const [status, setStatus] = useState<ProcessingStatus>({
    step: 'idle',
    progress: 0,
    message: 'Awaiting Inputs'
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [isFetcherActive, setIsFetcherActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const lastProcessedKey = useRef<string>('');

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // AUTO-START ENGINE: Trigger processing immediately when both video and SRT are provided
  useEffect(() => {
    const currentKey = `${videoFile?.name}-${originalSrtContent.length}-${targetLanguage}`;
    
    if (
      videoFile && 
      originalSrtContent && 
      status.step === 'idle' && 
      currentKey !== lastProcessedKey.current
    ) {
      lastProcessedKey.current = currentKey;
      processWorkflow();
    }
  }, [videoFile, originalSrtContent, targetLanguage, status.step]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-100), `[${timestamp}] ${msg}`]);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
      addLog(`Attached Video: ${e.target.files[0].name}`);
      if (status.step === 'completed' || status.step === 'error') {
        setStatus({ step: 'idle', progress: 0, message: 'Ready for new synthesis' });
      }
    }
  };

  const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSrtFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setOriginalSrtContent(content);
        addLog(`Attached Subtitles: ${file.name}`);
        if (status.step === 'completed' || status.step === 'error') {
          setStatus({ step: 'idle', progress: 0, message: 'Ready for new synthesis' });
        }
      };
      reader.readAsText(file);
    }
  };

  const initDownloader = () => {
    if (!youtubeUrl.trim()) return;
    setIsFetcherActive(true);
    addLog(`Initiating capture for: ${youtubeUrl}`);
    
    if (iframeContainerRef.current) {
      iframeContainerRef.current.innerHTML = '';
      const loader = document.createElement('div');
      loader.className = 'flex flex-col items-center justify-center py-24 text-sky-400 font-bold uppercase text-xs gap-4 animate-pulse';
      loader.innerHTML = `
        <i class="fas fa-spinner fa-spin text-4xl"></i>
        <span>Loading Capture Portal...</span>
      `;
      iframeContainerRef.current.appendChild(loader);

      const apiUrl = atob("aHR0cHM6Ly9wLnNhdmVub3cudG8vYXBpL2NhcmQyLz91cmw9") + encodeURIComponent(youtubeUrl);
      const iframe = document.createElement('iframe');
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("width", "100%");
      iframe.setAttribute("height", "480px");
      iframe.setAttribute("style", "border:none; border-radius: 1.5rem; background: #000;");
      iframe.src = apiUrl;
      
      iframe.onload = () => {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
        addLog("Portal Ready. Step 1: Download 1080p MP4. Step 2: Download English SRT.");
      };

      iframeContainerRef.current.appendChild(iframe);
    }
  };

  const processWorkflow = async () => {
    if (!videoFile || !originalSrtContent) return;

    try {
      setResultVideoUrl(null);
      setLogs([]);
      setShowLogs(true);
      
      // Step 1: AI Translation
      setStatus({ step: 'translating', progress: 5, message: 'Gemini AI: Translating Subtitles...' });
      addLog(`Translating script to ${targetLanguage}...`);
      const bilingualSrt = await translateSubtitles(originalSrtContent, targetLanguage);
      addLog('Bilingual script finalized.');

      // Step 2: FFmpeg Merge
      setStatus({ step: 'merging', progress: 0, message: 'FFmpeg Core: Hardcoding Video...' });
      addLog('Starting hardware-accelerated synthesis...');
      const mergedBlob = await mergeVideoAndSubtitles(
        videoFile, 
        bilingualSrt, 
        (p) => setStatus(prev => ({ ...prev, progress: Math.max(p, 5) })),
        addLog
      );

      const url = URL.createObjectURL(mergedBlob);
      setResultVideoUrl(url);
      setStatus({ step: 'completed', progress: 100, message: 'Synthesis Complete!' });
      addLog('Export Finished. Result ready below.');
    } catch (error: any) {
      const errorMsg = error.message || 'Workflow interrupted.';
      setStatus({ step: 'error', progress: 0, message: errorMsg });
      addLog(`ERROR: ${errorMsg}`);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-10 max-w-5xl mx-auto">
      <header className="text-center mb-12">
        <h1 className="text-6xl font-black mb-4 tracking-tighter italic">
          SubMerge <span className="gradient-text">ULTRA</span>
        </h1>
        <p className="text-slate-500 text-lg font-medium">One-click YouTube subtitle synthesis engine.</p>
      </header>

      <div className="grid gap-10">
        {/* ACT 1: CAPTURE */}
        <StepCard
          number={1}
          title="Capture Assets"
          description="Enter link, download MP4 + SRT, then drop them here."
          isCompleted={!!videoFile && !!originalSrtContent}
          isActive={status.step === 'idle' || status.step === 'completed' || status.step === 'error'}
        >
          <div className="space-y-8">
            <div className="flex gap-3">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && initDownloader()}
                placeholder="YouTube URL..."
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-sky-500/50 outline-none transition-all"
              />
              <button 
                onClick={initDownloader}
                className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-8 rounded-2xl shadow-lg transition-all active:scale-95"
              >
                Fetch
              </button>
            </div>

            {isFetcherActive && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                <div ref={iframeContainerRef} className="overflow-hidden bg-black/60 rounded-3xl border border-white/10 shadow-2xl mb-8 min-h-[480px]"></div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all ${videoFile ? 'border-green-500 bg-green-500/5' : 'border-slate-800 hover:border-sky-500 hover:bg-sky-500/5'}`}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleVideoUpload} accept="video/mp4" className="hidden" />
                    <i className={`fas ${videoFile ? 'fa-check-circle text-green-500' : 'fa-video text-slate-600'} text-3xl mb-4`}></i>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{videoFile ? 'Video Loaded' : 'Upload MP4'}</p>
                    {videoFile && <p className="text-[10px] text-slate-500 mt-2 truncate">{videoFile.name}</p>}
                  </div>

                  <div 
                    onClick={() => srtInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all ${originalSrtContent ? 'border-green-500 bg-green-500/5' : 'border-slate-800 hover:border-sky-500 hover:bg-sky-500/5'}`}
                  >
                    <input type="file" ref={srtInputRef} onChange={handleSrtUpload} accept=".srt" className="hidden" />
                    <i className={`fas ${originalSrtContent ? 'fa-check-circle text-green-500' : 'fa-file-alt text-slate-600'} text-3xl mb-4`}></i>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{originalSrtContent ? 'SRT Loaded' : 'Upload SRT'}</p>
                    {srtFile && <p className="text-[10px] text-slate-500 mt-2 truncate">{srtFile.name}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </StepCard>

        {/* ACT 2: SYNTHESIS */}
        <StepCard
          number={2}
          title="Engine Synthesis"
          description="Choose target language and let AI + FFmpeg work."
          isCompleted={status.step === 'completed'}
          isActive={!!videoFile && !!originalSrtContent}
        >
          <div className="space-y-8">
            <div className="flex flex-wrap gap-2">
              {['Chinese (Simplified)', 'Japanese', 'Korean', 'Spanish', 'French'].map(lang => (
                <button
                  key={lang}
                  onClick={() => setTargetLanguage(lang)}
                  disabled={status.step !== 'idle' && status.step !== 'completed'}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${targetLanguage === lang ? 'bg-sky-500 text-white shadow-xl' : 'bg-slate-900 text-slate-500 border border-white/5'}`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>

            {status.step !== 'idle' && (
              <div className="space-y-6">
                <div className="bg-black/60 border border-white/5 rounded-3xl p-8 relative overflow-hidden shadow-2xl">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
                        <i className={`fas ${status.step === 'merging' ? 'fa-microchip' : 'fa-brain'} fa-spin`}></i>
                      </div>
                      <h4 className="font-bold text-white tracking-tight">{status.message}</h4>
                    </div>
                    <span className="text-3xl font-black text-sky-400 italic tabular-nums">{status.progress}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 transition-all duration-300 shadow-[0_0_15px_rgba(56,189,248,0.5)]" style={{ width: `${status.progress}%` }}></div>
                  </div>
                </div>

                <div className="bg-black/80 rounded-2xl p-4 h-32 overflow-y-auto font-mono text-[9px] text-sky-700/60 custom-scrollbar border border-white/5">
                  {logs.map((log, i) => <div key={i}>{log}</div>)}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </div>
        </StepCard>

        {/* ACT 3: RESULT */}
        {status.step === 'completed' && resultVideoUrl && (
          <StepCard
            number={3}
            title="Result Download"
            description="Synthesis complete. Your master is ready."
            isCompleted={true}
            isActive={true}
          >
            <div className="space-y-6 animate-in zoom-in duration-500">
              <video controls className="w-full rounded-3xl border border-white/10 shadow-2xl aspect-video bg-black">
                <source src={resultVideoUrl} type="video/mp4" />
              </video>
              <div className="flex gap-4">
                <a 
                  href={resultVideoUrl}
                  download={`SubMerge_${videoFile?.name || 'video.mp4'}`}
                  className="flex-1 bg-white text-black py-5 rounded-2xl font-black text-xs uppercase tracking-widest text-center shadow-2xl active:scale-95 transition-all"
                >
                  <i className="fas fa-download mr-2"></i> Download Master
                </a>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-8 bg-slate-900 text-slate-500 rounded-2xl border border-white/5 hover:text-white transition-all"
                >
                  <i className="fas fa-redo"></i>
                </button>
              </div>
            </div>
          </StepCard>
        )}
      </div>
    </div>
  );
};

export default App;
