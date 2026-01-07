
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

  // Automatic Trigger Logic: Starts processing as soon as assets are ready
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
    setLogs(prev => [...prev.slice(-100), msg]);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
      addLog(`Asset acquired: Video (${e.target.files[0].name})`);
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
        setSrtContent(content);
        addLog(`Asset acquired: Subtitles (${file.name})`);
        if (status.step === 'completed' || status.step === 'error') setStatus({ step: 'idle', progress: 0, message: 'New asset detected...' });
      };
      reader.readAsText(file);
    }
  };

  const initDownloader = () => {
    if (!youtubeUrl.trim()) return;
    setIsFetcherActive(true);
    addLog(`Connecting to Capture Engine for: ${youtubeUrl}`);
    
    if (iframeContainerRef.current) {
      iframeContainerRef.current.innerHTML = '';
      const loader = document.createElement('div');
      loader.className = 'flex flex-col items-center justify-center py-12 text-sky-400 font-black tracking-widest uppercase text-xs gap-4';
      loader.innerHTML = `
        <i class="fas fa-circle-notch fa-spin text-2xl"></i>
        <span>Handshaking with Stream Servers...</span>
      `;
      iframeContainerRef.current.appendChild(loader);

      const apiUrl = atob("aHR0cHM6Ly9wLnNhdmVub3cudG8vYXBpL2NhcmQyLz91cmw9") + encodeURIComponent(youtubeUrl);
      const iframe = document.createElement('iframe');
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("width", "100%");
      iframe.setAttribute("height", "480px");
      iframe.setAttribute("style", "border:none; border-radius: 1.5rem; background: transparent;");
      iframe.src = apiUrl;
      
      iframe.onload = () => {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
        addLog("Capture Portal Live. Step: 1. Download MP4 (1080p) 2. Download SRT (English).");
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
      
      // Step 1: Gemini Translation
      setStatus({ step: 'translating', progress: 10, message: 'Gemini 3 Pro: Synthesizing Bilingual Script...' });
      addLog(`Auto-starting translation for ${targetLanguage}...`);
      const bilingualSrt = await translateSubtitles(originalSrtContent, targetLanguage);
      setSrtContent(bilingualSrt);
      addLog('Bilingual script generated successfully.');

      // Step 2: FFmpeg Merge
      setStatus({ step: 'merging', progress: 0, message: 'FFmpeg Core: Hardcoding Subtitles...' });
      addLog('Initiating local video rendering. Stay on this tab.');
      const mergedBlob = await mergeVideoAndSubtitles(
        videoFile, 
        bilingualSrt, 
        (p) => setStatus(prev => ({ ...prev, progress: p })),
        addLog
      );

      const url = URL.createObjectURL(mergedBlob);
      setResultVideoUrl(url);
      setStatus({ step: 'completed', progress: 100, message: 'Synthesis Successful!' });
      addLog('Bilingual video ready.');
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message || 'Error during synthesis.';
      setStatus({ step: 'error', progress: 0, message: errorMsg });
      addLog(`SYSTEM ERROR: ${errorMsg}`);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto pb-32">
      <header className="text-center mb-16 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-sky-500/10 blur-[100px] -z-10 rounded-full"></div>
        <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-slate-800 to-slate-950 rounded-[2rem] mb-8 border border-white/5 shadow-[0_0_50px_rgba(56,189,248,0.15)] ring-1 ring-white/10">
          <i className="fas fa-bolt text-sky-400 text-4xl"></i>
        </div>
        <h1 className="text-6xl md:text-8xl font-black mb-4 tracking-tighter leading-none">
          SubMerge <span className="gradient-text">AUTO</span>
        </h1>
        <p className="text-slate-500 text-lg md:text-xl max-w-xl mx-auto font-medium tracking-tight">
          Bilingual Video Synthesis. Zero Clicks Needed.
        </p>
      </header>

      <div className="grid gap-10">
        {/* PHASE 1: CAPTURE & ASSET ACQUISITION */}
        <StepCard
          number={1}
          title="Source Capture"
          description="Fetch assets from YouTube and drop them below."
          isCompleted={!!videoFile && !!srtFile}
          isActive={status.step === 'idle' || status.step === 'error' || status.step === 'completed'}
        >
          <div className="space-y-8">
            <div className="bg-slate-900/50 p-6 rounded-[2rem] border border-white/5 shadow-2xl">
              <label className="text-[10px] font-black uppercase text-sky-500 tracking-[0.3em] mb-4 block">1. YouTube Link</label>
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && initDownloader()}
                  placeholder="Paste URL here..."
                  className="flex-1 bg-black border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm transition-all placeholder:text-slate-700"
                />
                <button 
                  onClick={initDownloader}
                  className="bg-white text-black hover:bg-slate-200 px-10 py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-3 shadow-2xl active:scale-95"
                >
                  <i className="fas fa-cloud-download-alt"></i> Fetch
                </button>
              </div>
            </div>

            {isFetcherActive && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                <div ref={iframeContainerRef} className="overflow-hidden bg-slate-950/50 rounded-[2.5rem] border border-white/5 shadow-inner mb-8 min-h-[400px]"></div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`group border-2 border-dashed rounded-[2.5rem] p-10 text-center cursor-pointer transition-all ${videoFile ? 'border-green-500/50 bg-green-500/5' : 'border-slate-800 hover:border-sky-500/50 hover:bg-sky-500/5 bg-slate-900/40'}`}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleVideoUpload} accept="video/mp4" className="hidden" />
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-all duration-500 ${videoFile ? 'bg-green-500/20 text-green-400 rotate-[360deg]' : 'bg-slate-800 group-hover:bg-sky-500/20 text-slate-500 group-hover:text-sky-400'}`}>
                      <i className={`fas ${videoFile ? 'fa-check' : 'fa-video'} text-2xl`}></i>
                    </div>
                    <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">Drop MP4</p>
                    <p className="text-[10px] text-slate-600 mt-2 truncate max-w-[180px] mx-auto font-medium">{videoFile ? videoFile.name : 'Select video'}</p>
                  </div>

                  <div 
                    onClick={() => srtInputRef.current?.click()}
                    className={`group border-2 border-dashed rounded-[2.5rem] p-10 text-center cursor-pointer transition-all ${srtFile ? 'border-green-500/50 bg-green-500/5' : 'border-slate-800 hover:border-sky-500/50 hover:bg-sky-500/5 bg-slate-900/40'}`}
                  >
                    <input type="file" ref={srtInputRef} onChange={handleSrtUpload} accept=".srt" className="hidden" />
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-all duration-500 ${srtFile ? 'bg-green-500/20 text-green-400 rotate-[360deg]' : 'bg-slate-800 group-hover:bg-sky-500/20 text-slate-500 group-hover:text-sky-400'}`}>
                      <i className={`fas ${srtFile ? 'fa-check' : 'fa-closed-captioning'} text-2xl`}></i>
                    </div>
                    <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">Drop SRT</p>
                    <p className="text-[10px] text-slate-600 mt-2 truncate max-w-[180px] mx-auto font-medium">{srtFile ? srtFile.name : 'Select script'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </StepCard>

        {/* PHASE 2: AUTOMATED ENGINE */}
        <StepCard
          number={2}
          title="Engine Status"
          description="Config and live synthesis tracking."
          isCompleted={status.step === 'completed'}
          isActive={!!videoFile && !!originalSrtContent}
        >
          <div className="space-y-10">
            <div className="flex flex-col gap-5">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em]">Translation Language</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {['Chinese (Simplified)', 'Japanese', 'Korean', 'Spanish', 'French', 'German', 'Russian', 'Arabic'].map(lang => (
                  <button
                    key={lang}
                    onClick={() => {
                      setTargetLanguage(lang);
                      if (status.step === 'completed' || status.step === 'error') {
                        setStatus({ step: 'idle', progress: 0, message: 'Language updated...' });
                      }
                    }}
                    disabled={status.step !== 'idle' && status.step !== 'error' && status.step !== 'completed'}
                    className={`px-4 py-4 rounded-2xl text-[10px] font-black transition-all border-2 uppercase tracking-widest ${targetLanguage === lang ? 'bg-sky-500 border-sky-400 text-white shadow-xl shadow-sky-500/20 scale-[1.05]' : 'bg-slate-900/50 border-white/5 text-slate-500 hover:border-slate-700 hover:text-slate-300'}`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            {status.step === 'idle' ? (
              <div className="flex flex-col items-center justify-center p-12 bg-slate-900/30 rounded-[2.5rem] border border-white/5">
                <i className="fas fa-hourglass-half text-slate-700 text-3xl mb-4 animate-pulse"></i>
                <p className="text-[10px] uppercase font-black tracking-[0.4em] text-slate-500 text-center">
                  {(!videoFile || !originalSrtContent) ? 'Awaiting Assets for Auto-Start' : 'Ready to Launch'}
                </p>
              </div>
            ) : (
              <div className="space-y-8 animate-in slide-in-from-bottom-6 duration-700">
                <div className="bg-black/50 border border-white/5 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden backdrop-blur-xl">
                  <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
                    <div className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500 shadow-[0_0_15px_rgba(56,189,248,0.5)]" style={{ width: `${status.progress}%` }}></div>
                  </div>
                  <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-[1.2rem] bg-sky-500/10 flex items-center justify-center text-sky-400 border border-sky-500/20">
                        <i className={`fas ${status.step === 'translating' ? 'fa-language' : 'fa-atom'} fa-spin text-2xl`}></i>
                      </div>
                      <div>
                        <span className="text-2xl font-black text-white block tracking-tighter">{status.message}</span>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">Automated Workflow</span>
                          <span className="h-1 w-1 rounded-full bg-sky-500 animate-pulse"></span>
                          <span className="text-[10px] uppercase font-black text-sky-500/70 tracking-[0.2em]">{status.step}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-5xl font-black font-mono text-sky-400 tabular-nums">{status.progress}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between px-4">
                   <button 
                    onClick={() => setShowLogs(!showLogs)}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors uppercase font-black tracking-[0.3em] flex items-center gap-4"
                  >
                    <i className={`fas ${showLogs ? 'fa-terminal' : 'fa-terminal opacity-30'}`}></i>
                    {showLogs ? 'Hide Engine Logs' : 'View Engine Logs'}
                  </button>
                  {status.step === 'merging' && (
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-sky-500 font-black uppercase tracking-widest">Rendering Locally...</span>
                    </div>
                  )}
                </div>

                {showLogs && (
                  <div className="bg-black rounded-[2.5rem] p-8 h-56 overflow-y-auto font-mono text-[11px] text-slate-600 border border-white/5 custom-scrollbar shadow-inner animate-in fade-in zoom-in duration-500 leading-loose">
                    {logs.map((log, i) => <div key={i} className="mb-2 border-l border-slate-900 pl-4">{log}</div>)}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
            )}
          </div>
        </StepCard>

        {/* PHASE 3: FINAL EXPORT */}
        {status.step === 'completed' && resultVideoUrl && (
          <StepCard
            number={3}
            title="Export Master"
            description="Synthesis complete. Assets ready for use."
            isCompleted={true}
            isActive={true}
          >
            <div className="space-y-10 animate-in zoom-in slide-in-from-bottom-10 duration-1000">
              <div className="aspect-video rounded-[3rem] overflow-hidden bg-black border border-white/5 shadow-[0_50px_100px_rgba(0,0,0,0.8)] relative group ring-1 ring-white/10">
                <video controls className="w-full h-full shadow-2xl">
                   <source src={resultVideoUrl} type="video/mp4" />
                </video>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <a 
                  href={resultVideoUrl}
                  download={`SubMerge_${videoFile?.name || 'bilingual.mp4'}`}
                  className="bg-white text-black hover:bg-slate-200 py-7 rounded-3xl font-black text-sm uppercase tracking-[0.3em] text-center transition-all shadow-2xl flex items-center justify-center gap-4 active:scale-95"
                >
                  Download Master <i className="fas fa-file-video text-lg"></i>
                </a>
                <button 
                  onClick={() => window.location.reload()}
                  className="bg-slate-950 hover:bg-slate-800 py-7 rounded-3xl font-black text-sm uppercase tracking-[0.3em] text-center border border-white/5 transition-all flex items-center justify-center gap-4 active:scale-95"
                >
                  Clear & Restart <i className="fas fa-redo text-lg"></i>
                </button>
              </div>
            </div>
          </StepCard>
        )}
      </div>

      <footer className="mt-32 pt-16 border-t border-white/5 text-center opacity-30 group hover:opacity-100 transition-opacity duration-500">
        <p className="text-[10px] uppercase font-black tracking-[0.5em] text-slate-500 mb-8">
          SubMerge Engine v2.5 • Full Auto-Synthesis Mode
        </p>
        <div className="flex justify-center gap-14 grayscale hover:grayscale-0 transition-all duration-700">
           <i className="fab fa-google text-3xl"></i>
           <i className="fab fa-youtube text-3xl"></i>
           <i className="fas fa-shield-alt text-3xl"></i>
        </div>
      </footer>
    </div>
  );
};

export default App;
