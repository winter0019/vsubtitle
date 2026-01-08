
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

  // Unified Workflow Automation: Detects when both assets are ready
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
    setLogs(prev => [...prev.slice(-150), `[${timestamp}] ${msg}`]);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
      addLog(`Attached Video: ${e.target.files[0].name}`);
      if (status.step === 'completed' || status.step === 'error') setStatus({ step: 'idle', progress: 0, message: 'New asset detected...' });
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
        if (status.step === 'completed' || status.step === 'error') setStatus({ step: 'idle', progress: 0, message: 'New asset detected...' });
      };
      reader.readAsText(file);
    }
  };

  const initDownloader = () => {
    if (!youtubeUrl.trim()) return;
    setIsFetcherActive(true);
    addLog(`Initiating Link Capture for: ${youtubeUrl}`);
    
    if (iframeContainerRef.current) {
      iframeContainerRef.current.innerHTML = '';
      const loader = document.createElement('div');
      loader.className = 'flex flex-col items-center justify-center py-24 text-sky-400 font-bold tracking-widest uppercase text-xs gap-6';
      loader.innerHTML = `
        <i class="fas fa-circle-notch fa-spin text-3xl"></i>
        <span>Connecting to YouTube Asset Server...</span>
      `;
      iframeContainerRef.current.appendChild(loader);

      // Decoding the secure portal API
      const apiUrl = atob("aHR0cHM6Ly9wLnNhdmVub3cudG8vYXBpL2NhcmQyLz91cmw9") + encodeURIComponent(youtubeUrl);
      const iframe = document.createElement('iframe');
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("width", "100%");
      iframe.setAttribute("height", "480px");
      iframe.setAttribute("style", "border:none; border-radius: 2rem; background: rgba(0,0,0,0.2);");
      iframe.src = apiUrl;
      
      iframe.onload = () => {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
        addLog("Capture Portal Online. Action Required: 1. Download 1080p MP4 2. Download English SRT.");
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
      
      // Stage 1: Gemini AI Translation
      setStatus({ step: 'translating', progress: 5, message: 'AI: Synthesizing Bilingual Script...' });
      addLog('Agent "Gemini" is translating script to ' + targetLanguage + '...');
      const bilingualSrt = await translateSubtitles(originalSrtContent, targetLanguage);
      addLog('Bilingual script finalized. Length: ' + bilingualSrt.length + ' chars.');

      // Stage 2: FFmpeg Hardware-Accelerated Merge
      setStatus({ step: 'merging', progress: 0, message: 'Engine: Hardcoding Subtitles...' });
      addLog('Initializing local rendering pipeline. Do not close this window.');
      const mergedBlob = await mergeVideoAndSubtitles(
        videoFile, 
        bilingualSrt, 
        (p) => setStatus(prev => ({ ...prev, progress: Math.max(p, 5) })),
        addLog
      );

      const url = URL.createObjectURL(mergedBlob);
      setResultVideoUrl(url);
      setStatus({ step: 'completed', progress: 100, message: 'Export Ready!' });
      addLog('Success: Bilingual Master Exported.');
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message || 'System error during synthesis.';
      setStatus({ step: 'error', progress: 0, message: errorMsg });
      addLog(`ENGINE FAILURE: ${errorMsg}`);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto pb-32">
      <header className="text-center mb-12 relative py-8">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-sky-500/5 blur-[120px] -z-10 rounded-full"></div>
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-slate-900 to-black rounded-3xl mb-6 border border-white/10 shadow-[0_0_40px_rgba(56,189,248,0.1)]">
          <i className="fas fa-closed-captioning text-sky-400 text-3xl"></i>
        </div>
        <h1 className="text-5xl md:text-7xl font-black mb-3 tracking-tighter leading-tight italic">
          SubMerge <span className="gradient-text">PRO</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-xl mx-auto font-medium tracking-tight">
          AI-Powered Bilingual Video Synthesis.
        </p>
      </header>

      <div className="grid gap-8">
        {/* ACT 1: ASSET CAPTURE */}
        <StepCard
          number={1}
          title="Capture Source"
          description="Fetch from YouTube, then drag assets into the engine below."
          isCompleted={!!videoFile && !!originalSrtContent}
          isActive={status.step === 'idle' || status.step === 'error' || status.step === 'completed'}
        >
          <div className="space-y-8">
            <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/5 shadow-2xl backdrop-blur-md">
              <label className="text-[10px] font-bold uppercase text-sky-500 tracking-[0.2em] mb-3 block opacity-80">Target YouTube URL</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && initDownloader()}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-1 bg-black border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-sm transition-all placeholder:text-slate-800"
                />
                <button 
                  onClick={initDownloader}
                  className="bg-sky-500 hover:bg-sky-400 text-white px-8 py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95"
                >
                  <i className="fas fa-rocket"></i> Launch Portal
                </button>
              </div>
            </div>

            {isFetcherActive && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                <div ref={iframeContainerRef} className="overflow-hidden bg-black/60 rounded-[2rem] border border-white/5 shadow-2xl mb-8 min-h-[420px]"></div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`group border-2 border-dashed rounded-[2rem] p-8 text-center cursor-pointer transition-all ${videoFile ? 'border-green-500/40 bg-green-500/5' : 'border-slate-800 hover:border-sky-500/40 hover:bg-sky-500/5 bg-slate-900/30'}`}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleVideoUpload} accept="video/mp4" className="hidden" />
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-700 ${videoFile ? 'bg-green-500/20 text-green-400 rotate-12' : 'bg-slate-800 group-hover:bg-sky-500/20 text-slate-500 group-hover:text-sky-400'}`}>
                      <i className={`fas ${videoFile ? 'fa-check-circle' : 'fa-film'} text-xl`}></i>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{videoFile ? 'Video Locked' : 'Drop Video (MP4)'}</p>
                    <p className="text-[10px] text-slate-600 mt-1 truncate max-w-[150px] mx-auto">{videoFile ? videoFile.name : 'Awaiting file...'}</p>
                  </div>

                  <div 
                    onClick={() => srtInputRef.current?.click()}
                    className={`group border-2 border-dashed rounded-[2rem] p-8 text-center cursor-pointer transition-all ${originalSrtContent ? 'border-green-500/40 bg-green-500/5' : 'border-slate-800 hover:border-sky-500/40 hover:bg-sky-500/5 bg-slate-900/30'}`}
                  >
                    <input type="file" ref={srtInputRef} onChange={handleSrtUpload} accept=".srt" className="hidden" />
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-700 ${originalSrtContent ? 'bg-green-500/20 text-green-400 -rotate-12' : 'bg-slate-800 group-hover:bg-sky-500/20 text-slate-500 group-hover:text-sky-400'}`}>
                      <i className={`fas ${originalSrtContent ? 'fa-check-circle' : 'fa-align-left'} text-xl`}></i>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{originalSrtContent ? 'Script Locked' : 'Drop Script (SRT)'}</p>
                    <p className="text-[10px] text-slate-600 mt-1 truncate max-w-[150px] mx-auto">{srtFile ? srtFile.name : 'Awaiting file...'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </StepCard>

        {/* ACT 2: SYNTHESIS ENGINE */}
        <StepCard
          number={2}
          title="Synthesis Core"
          description="Automatic AI translation and subtitle burning."
          isCompleted={status.step === 'completed'}
          isActive={!!videoFile && !!originalSrtContent}
        >
          <div className="space-y-8">
            <div className="bg-slate-900/20 p-6 rounded-3xl border border-white/5">
              <label className="text-[10px] font-bold uppercase text-slate-500 tracking-[0.2em] mb-4 block">Target Language</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {['Chinese (Simplified)', 'Japanese', 'Korean', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic'].map(lang => (
                  <button
                    key={lang}
                    onClick={() => setTargetLanguage(lang)}
                    disabled={status.step !== 'idle' && status.step !== 'error' && status.step !== 'completed'}
                    className={`px-3 py-3 rounded-xl text-[9px] font-black transition-all border-2 uppercase tracking-widest ${targetLanguage === lang ? 'bg-sky-500 border-sky-400 text-white shadow-xl' : 'bg-slate-900/50 border-white/5 text-slate-600 hover:text-slate-300'}`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            {status.step !== 'idle' && (
              <div className="animate-in slide-in-from-bottom-4 duration-700 space-y-6">
                <div className="bg-black/80 border border-white/10 rounded-[2rem] p-8 shadow-inner relative overflow-hidden">
                  <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5">
                    <div className="h-full bg-sky-500 transition-all duration-300 shadow-[0_0_20px_rgba(56,189,248,0.8)]" style={{ width: `${status.progress}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400 border border-sky-500/20">
                        <i className={`fas ${status.step === 'merging' ? 'fa-microchip' : 'fa-brain'} fa-spin text-xl`}></i>
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-white tracking-tight">{status.message}</h4>
                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mt-1">
                          Phase: <span className="text-sky-500">{status.step}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-4xl font-black text-sky-400 italic tabular-nums">{status.progress}%</div>
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                   <button 
                    onClick={() => setShowLogs(!showLogs)}
                    className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors uppercase font-bold tracking-[0.2em] flex items-center gap-2"
                  >
                    <i className="fas fa-terminal opacity-50"></i>
                    {showLogs ? 'Hide System Logs' : 'Show System Logs'}
                  </button>
                </div>

                {showLogs && (
                  <div className="bg-black/90 rounded-2xl p-6 h-48 overflow-y-auto font-mono text-[10px] text-sky-700/80 border border-white/5 custom-scrollbar shadow-2xl leading-relaxed animate-in fade-in slide-in-from-top-2">
                    {logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
            )}
          </div>
        </StepCard>

        {/* ACT 3: EXPORT MASTER */}
        {status.step === 'completed' && resultVideoUrl && (
          <StepCard
            number={3}
            title="Export Master"
            description="Synthesis complete. Ready for distribution."
            isCompleted={true}
            isActive={true}
          >
            <div className="space-y-8 animate-in zoom-in duration-700">
              <div className="aspect-video rounded-[2rem] overflow-hidden bg-black border border-white/10 shadow-2xl relative group">
                <video controls className="w-full h-full shadow-2xl">
                   <source src={resultVideoUrl} type="video/mp4" />
                </video>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <a 
                  href={resultVideoUrl}
                  download={`SubMerge_PRO_${videoFile?.name || 'master.mp4'}`}
                  className="bg-white text-black hover:bg-slate-200 py-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-center transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95"
                >
                  <i className="fas fa-file-export"></i> Download Master
                </a>
                <button 
                  onClick={() => window.location.reload()}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-400 py-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-center border border-white/5 transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                  <i className="fas fa-redo-alt"></i> New Session
                </button>
              </div>
            </div>
          </StepCard>
        )}
      </div>

      <footer className="mt-24 pt-12 border-t border-white/5 text-center opacity-40">
        <p className="text-[9px] uppercase font-bold tracking-[0.4em] text-slate-600 mb-6">
          SubMerge AI Engine v2.8 • Optimized for Chromium
        </p>
        <div className="flex justify-center gap-10 opacity-30">
           <i className="fab fa-google text-2xl"></i>
           <i className="fab fa-youtube text-2xl"></i>
           <i className="fas fa-shield-halved text-2xl"></i>
        </div>
      </footer>
    </div>
  );
};

export default App;
