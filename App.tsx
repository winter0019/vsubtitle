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
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [isFetcherActive, setIsFetcherActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const lastProcessedKey = useRef<string>('');

  useEffect(() => {
    if (logEndRef.current) {
      (logEndRef.current as any).scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // AUTO-START: Detects when both assets are dropped after capture
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
    const target = e.target as any;
    if (target.files && target.files[0]) {
      setVideoFile(target.files[0]);
      addLog(`Attached Video: ${target.files[0].name}`);
      if (status.step === 'completed' || status.step === 'error') {
        setStatus({ step: 'idle', progress: 0, message: 'Ready' });
      }
    }
  };

  const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target as any;
    if (target.files && target.files[0]) {
      const file = target.files[0];
      setSrtFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setOriginalSrtContent(content);
        addLog(`Attached Subtitles: ${file.name}`);
        if (status.step === 'completed' || status.step === 'error') {
          setStatus({ step: 'idle', progress: 0, message: 'Ready' });
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
      const container = iframeContainerRef.current as any;
      container.innerHTML = '';
      const loader = (window as any).document.createElement('div');
      loader.className = 'flex flex-col items-center justify-center py-24 text-sky-400 font-bold uppercase text-xs gap-4 animate-pulse';
      loader.innerHTML = `
        <i class="fas fa-spinner fa-spin text-4xl"></i>
        <span>Launching Retrieval Portal...</span>
      `;
      container.appendChild(loader);

      const apiUrl = atob("aHR0cHM6Ly9wLnNhdmVub3cudG8vYXBpL2NhcmQyLz91cmw9") + encodeURIComponent(youtubeUrl);
      const iframe = (window as any).document.createElement('iframe');
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("width", "100%");
      iframe.setAttribute("height", "480px");
      iframe.setAttribute("style", "border:none; border-radius: 1.5rem; background: #000;");
      iframe.src = apiUrl;
      
      iframe.onload = () => {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
        addLog("Portal Online. Download MP4 and English SRT, then upload them below.");
      };

      container.appendChild(iframe);
    }
  };

  const processWorkflow = async () => {
    if (!videoFile || !originalSrtContent) return;

    try {
      setResultVideoUrl(null);
      setLogs([]);
      
      setStatus({ step: 'translating', progress: 5, message: 'AI: Translating Scripts...' });
      addLog(`Translating script to ${targetLanguage}...`);
      const bilingualSrt = await translateSubtitles(originalSrtContent, targetLanguage);
      addLog('Bilingual translation ready.');

      setStatus({ step: 'merging', progress: 0, message: 'Engine: Synthesizing Master...' });
      addLog('Starting burning process with Noto Sans SC Regular...');
      const mergedBlob = await mergeVideoAndSubtitles(
        videoFile, 
        bilingualSrt, 
        (p) => setStatus(prev => ({ ...prev, progress: Math.max(p, 5) })),
        addLog
      );

      const url = URL.createObjectURL(mergedBlob);
      setResultVideoUrl(url);
      setStatus({ step: 'completed', progress: 100, message: 'Success!' });
      addLog('Synthesis complete. Master file ready.');
    } catch (error: any) {
      const errorMsg = error.message || 'Processing failed.';
      setStatus({ step: 'error', progress: 0, message: errorMsg });
      addLog(`FATAL: ${errorMsg}`);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-12 max-w-5xl mx-auto">
      <header className="text-center mb-16">
        <h1 className="text-7xl font-black mb-4 tracking-tighter italic">
          SubMerge <span className="gradient-text">ULTRA</span>
        </h1>
        <p className="text-slate-500 text-xl font-medium">Bilingual subtitle synthesis, automated.</p>
      </header>

      <div className="grid gap-12">
        <StepCard
          number={1}
          title="Source Assets"
          description="Fetch from YouTube, then drop the MP4 and SRT here."
          isCompleted={!!videoFile && !!originalSrtContent}
          isActive={status.step === 'idle' || status.step === 'completed' || status.step === 'error'}
        >
          <div className="space-y-8">
            <div className="flex gap-4">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl((e.target as any).value)}
                onKeyDown={(e) => e.key === 'Enter' && initDownloader()}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 bg-black/50 border border-white/10 rounded-2xl px-8 py-5 focus:ring-2 focus:ring-sky-500/50 outline-none transition-all placeholder:text-slate-700"
              />
              <button 
                onClick={initDownloader}
                className="bg-sky-500 hover:bg-sky-400 text-white font-black px-10 rounded-2xl shadow-xl transition-all active:scale-95"
              >
                Launch
              </button>
            </div>

            {isFetcherActive && (
              <div className="animate-in fade-in slide-in-from-top-6 duration-700">
                <div ref={iframeContainerRef} className="overflow-hidden bg-black/80 rounded-[2rem] border border-white/5 shadow-2xl mb-10 min-h-[480px]"></div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div 
                    onClick={() => (fileInputRef.current as any)?.click()}
                    className={`border-2 border-dashed rounded-[2rem] p-12 text-center cursor-pointer transition-all duration-500 ${videoFile ? 'border-green-500 bg-green-500/5 shadow-[0_0_40px_rgba(34,197,94,0.1)]' : 'border-slate-800 hover:border-sky-500/50 hover:bg-sky-500/10 animate-pulse-subtle shadow-xl'}`}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleVideoUpload} accept="video/mp4" className="hidden" />
                    <div className={`w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center transition-all ${videoFile ? 'bg-green-500/20 text-green-400' : 'bg-slate-900 text-slate-600'}`}>
                      <i className={`fas ${videoFile ? 'fa-check-circle' : 'fa-film'} text-3xl`}></i>
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">{videoFile ? 'Video Ready' : 'Drop Video MP4'}</p>
                    {videoFile && <p className="text-[10px] text-slate-500 mt-2 truncate font-mono">{videoFile.name}</p>}
                  </div>

                  <div 
                    onClick={() => (srtInputRef.current as any)?.click()}
                    className={`border-2 border-dashed rounded-[2rem] p-12 text-center cursor-pointer transition-all duration-500 ${originalSrtContent ? 'border-green-500 bg-green-500/5 shadow-[0_0_40px_rgba(34,197,94,0.1)]' : 'border-slate-800 hover:border-sky-500/50 hover:bg-sky-500/10 animate-pulse-subtle shadow-xl'}`}
                  >
                    <input type="file" ref={srtInputRef} onChange={handleSrtUpload} accept=".srt" className="hidden" />
                    <div className={`w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center transition-all ${originalSrtContent ? 'bg-green-500/20 text-green-400' : 'bg-slate-900 text-slate-600'}`}>
                      <i className={`fas ${originalSrtContent ? 'fa-check-circle' : 'fa-file-alt'} text-3xl`}></i>
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">{originalSrtContent ? 'SRT Ready' : 'Drop Script SRT'}</p>
                    {srtFile && <p className="text-[10px] text-slate-500 mt-2 truncate font-mono">{srtFile.name}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </StepCard>

        <StepCard
          number={2}
          title="AI Synthesis"
          description="Synthesis begins automatically once assets are loaded."
          isCompleted={status.step === 'completed'}
          isActive={!!videoFile && !!originalSrtContent}
        >
          <div className="space-y-10">
            <div className="flex flex-wrap gap-3">
              {['Chinese (Simplified)', 'Japanese', 'Korean', 'Spanish', 'French', 'German'].map(lang => (
                <button
                  key={lang}
                  onClick={() => setTargetLanguage(lang)}
                  disabled={status.step !== 'idle' && status.step !== 'completed'}
                  className={`px-6 py-3 rounded-2xl text-[10px] font-black tracking-widest transition-all ${targetLanguage === lang ? 'bg-sky-500 text-white shadow-2xl scale-110' : 'bg-slate-900 text-slate-600 border border-white/5 hover:text-slate-300'}`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>

            {status.step !== 'idle' && (
              <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-700">
                <div className="glass-card p-10 relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-400 border border-sky-500/20">
                        <i className={`fas ${status.step === 'merging' ? 'fa-microchip' : 'fa-brain'} fa-spin text-2xl`}></i>
                      </div>
                      <div>
                        <h4 className="text-2xl font-black text-white tracking-tight">{status.message}</h4>
                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mt-1">
                          Processing: <span className="text-sky-500">{status.step}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-5xl font-black text-sky-400 italic tabular-nums">{status.progress}%</span>
                  </div>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 transition-all duration-300 shadow-[0_0_20px_rgba(56,189,248,0.8)]" style={{ width: `${status.progress}%` }}></div>
                  </div>
                </div>

                <div className="bg-black/90 rounded-3xl p-6 h-48 overflow-y-auto font-mono text-[10px] text-sky-800 custom-scrollbar border border-white/5 shadow-inner">
                  {logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </div>
        </StepCard>

        {status.step === 'completed' && resultVideoUrl && (
          <StepCard
            number={3}
            title="Final Master"
            description="Synthesis successful. Your mastered video is ready."
            isCompleted={true}
            isActive={true}
          >
            <div className="space-y-8 animate-in zoom-in duration-700">
              <div className="aspect-video rounded-[2.5rem] overflow-hidden bg-black border border-white/10 shadow-3xl">
                <video controls className="w-full h-full shadow-2xl">
                  <source src={resultVideoUrl} type="video/mp4" />
                </video>
              </div>
              
              <div className="flex gap-6">
                <a 
                  href={resultVideoUrl}
                  download={`SubMerge_Master_${videoFile?.name || 'video.mp4'}`}
                  className="flex-1 bg-white text-black py-7 rounded-3xl font-black text-xs uppercase tracking-widest text-center shadow-3xl transition-all hover:bg-slate-200 active:scale-95 flex items-center justify-center gap-3"
                >
                  <i className="fas fa-file-export"></i> Download Master
                </a>
                <button 
                  onClick={() => (window as any).location.reload()}
                  className="px-10 bg-slate-900 text-slate-500 rounded-3xl border border-white/5 hover:text-white transition-all active:scale-95"
                >
                  <i className="fas fa-redo-alt"></i>
                </button>
              </div>
            </div>
          </StepCard>
        )}
      </div>

      <footer className="mt-32 pt-16 border-t border-white/5 text-center opacity-40">
        <p className="text-[10px] uppercase font-bold tracking-[0.5em] text-slate-600">
          Powered by Gemini AI & FFmpeg WASM Core
        </p>
      </footer>
    </div>
  );
};

export default App;