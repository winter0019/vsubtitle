
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
  const [bilingualAss, setBilingualAss] = useState<string>('');
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

  // AUTO-START logic: Runs synthesis when assets are ready
  useEffect(() => {
    const currentKey = `${videoFile?.name}-${originalSrtContent.length}-${targetLanguage}`;
    
    if (
      videoFile && 
      originalSrtContent && 
      (status.step === 'idle' || status.step === 'error') && 
      currentKey !== lastProcessedKey.current
    ) {
      lastProcessedKey.current = currentKey;
      processWorkflow();
    }
  }, [videoFile, originalSrtContent, targetLanguage, status.step]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-400), `[${timestamp}] ${msg}`]);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      setVideoFile(target.files[0]);
      addLog(`Attached Video: ${target.files[0].name}`);
      if (status.step === 'completed' || status.step === 'error') {
        setStatus({ step: 'idle', progress: 0, message: 'Ready' });
      }
    }
  };

  const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
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
      const container = iframeContainerRef.current;
      container.innerHTML = '';
      const loader = document.createElement('div');
      loader.className = 'flex flex-col items-center justify-center py-24 text-sky-400 font-bold uppercase text-xs gap-4 animate-pulse';
      loader.innerHTML = `
        <i class="fas fa-spinner fa-spin text-4xl"></i>
        <span>Launching Retrieval Portal...</span>
      `;
      container.appendChild(loader);

      const apiUrl = atob("aHR0cHM6Ly9wLnNhdmVub3cudG8vYXBpL2NhcmQyLz91cmw9") + encodeURIComponent(youtubeUrl);
      const iframe = document.createElement('iframe');
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
      setBilingualAss('');
      setLogs([]);
      
      setStatus({ step: 'translating', progress: 5, message: 'Gemini: Generating Bilingual ASS...' });
      addLog(`Translating script to ${targetLanguage}...`);
      
      let assContent = '';
      try {
        assContent = await translateSubtitles(originalSrtContent, targetLanguage);
        setBilingualAss(assContent);
        addLog('Bilingual ASS content generated successfully.');
      } catch (geminiError: any) {
        addLog(`Gemini RPC Error: ${geminiError.message}`);
        throw geminiError;
      }

      setStatus({ step: 'merging', progress: 10, message: 'Engine: Hardcoding Subtitles...' });
      addLog('Starting FFmpeg synthesis with NotoSansSC-Regular font...');
      
      const mergedBlob = await mergeVideoAndSubtitles(
        videoFile, 
        assContent, 
        (p) => setStatus(prev => ({ ...prev, progress: Math.max(p, 10) })),
        addLog
      );

      const url = URL.createObjectURL(mergedBlob);
      setResultVideoUrl(url);
      setStatus({ step: 'completed', progress: 100, message: 'Success!' });
      addLog('Master file synthesized and ready.');
    } catch (error: any) {
      const errorMsg = error.message || 'Workflow process failed.';
      setStatus({ step: 'error', progress: 0, message: errorMsg });
      addLog(`FATAL ERROR: ${errorMsg}`);
    }
  };

  const downloadAss = () => {
    if (!bilingualAss) return;
    const blob = new Blob([bilingualAss], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SubMerge_Bilingual_${targetLanguage}.ass`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('Exported bilingual ASS file.');
  };

  const resetState = () => {
    setVideoFile(null);
    setSrtFile(null);
    setOriginalSrtContent('');
    setBilingualAss('');
    setResultVideoUrl(null);
    setStatus({ step: 'idle', progress: 0, message: 'Awaiting Inputs' });
    setLogs([]);
    lastProcessedKey.current = '';
  };

  return (
    <div className="min-h-screen p-4 md:p-12 max-w-5xl mx-auto relative">
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-500/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/20 blur-[120px] rounded-full"></div>
      </div>

      <header className="text-center mb-16 animate-in fade-in slide-in-from-top-4 duration-1000">
        <h1 className="text-7xl md:text-8xl font-black mb-4 tracking-tighter italic">
          SubMerge <span className="gradient-text">ULTRA</span>
        </h1>
        <p className="text-slate-500 text-xl font-medium tracking-wide">Automated Bilingual Subtitle Synthesis.</p>
      </header>

      <div className="grid gap-12">
        <StepCard
          number={1}
          title="Source Assets"
          description="Fetch from YouTube, then upload the MP4 and SRT files."
          isCompleted={!!videoFile && !!originalSrtContent}
          isActive={status.step === 'idle' || status.step === 'completed' || status.step === 'error'}
        >
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && initDownloader()}
                placeholder="Paste YouTube link here..."
                className="flex-1 bg-black/50 border border-white/10 rounded-2xl px-8 py-5 focus:ring-2 focus:ring-sky-500/50 outline-none transition-all placeholder:text-slate-700 font-medium"
              />
              <button 
                onClick={initDownloader}
                className="bg-sky-500 hover:bg-sky-400 text-white font-black px-12 py-5 rounded-2xl shadow-xl transition-all active:scale-95 whitespace-nowrap"
              >
                Launch Portal
              </button>
            </div>

            {isFetcherActive && (
              <div className="animate-in fade-in zoom-in-95 duration-500">
                <div ref={iframeContainerRef} className="overflow-hidden bg-black/80 rounded-[2rem] border border-white/5 shadow-2xl mb-10 min-h-[480px]"></div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-[2rem] p-12 text-center cursor-pointer transition-all duration-500 ${videoFile ? 'border-green-500 bg-green-500/5 shadow-[0_0_40px_rgba(34,197,94,0.1)]' : 'border-slate-800 hover:border-sky-500/50 hover:bg-sky-500/10 shadow-xl'}`}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleVideoUpload} accept="video/mp4" className="hidden" />
                    <div className={`w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center transition-all ${videoFile ? 'bg-green-500/20 text-green-400' : 'bg-slate-900 text-slate-600'}`}>
                      <i className={`fas ${videoFile ? 'fa-check-circle' : 'fa-film'} text-3xl`}></i>
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">{videoFile ? 'Video Ready' : 'Drop MP4 File'}</p>
                    {videoFile && <p className="text-[10px] text-slate-500 mt-2 truncate font-mono px-4">{videoFile.name}</p>}
                  </div>

                  <div 
                    onClick={() => srtInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-[2rem] p-12 text-center cursor-pointer transition-all duration-500 ${originalSrtContent ? 'border-green-500 bg-green-500/5 shadow-[0_0_40px_rgba(34,197,94,0.1)]' : 'border-slate-800 hover:border-sky-500/50 hover:bg-sky-500/10 shadow-xl'}`}
                  >
                    <input type="file" ref={srtInputRef} onChange={handleSrtUpload} accept=".srt" className="hidden" />
                    <div className={`w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center transition-all ${originalSrtContent ? 'bg-green-500/20 text-green-400' : 'bg-slate-900 text-slate-600'}`}>
                      <i className={`fas ${originalSrtContent ? 'fa-check-circle' : 'fa-file-alt'} text-3xl`}></i>
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">{originalSrtContent ? 'Script Ready' : 'Drop SRT File'}</p>
                    {srtFile && <p className="text-[10px] text-slate-500 mt-2 truncate font-mono px-4">{srtFile.name}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </StepCard>

        <StepCard
          number={2}
          title="AI Synthesis"
          description="Automated translation and subtitle hardcoding."
          isCompleted={status.step === 'completed'}
          isActive={!!videoFile && !!originalSrtContent}
        >
          <div className="space-y-10">
            <div className="flex flex-wrap gap-3">
              {['Chinese (Simplified)', 'Japanese', 'Korean', 'Spanish', 'French', 'German'].map(lang => (
                <button
                  key={lang}
                  onClick={() => setTargetLanguage(lang)}
                  disabled={status.step !== 'idle' && status.step !== 'completed' && status.step !== 'error'}
                  className={`px-6 py-3 rounded-2xl text-[10px] font-black tracking-widest transition-all ${targetLanguage === lang ? 'bg-sky-500 text-white shadow-xl scale-105' : 'bg-slate-900 text-slate-600 border border-white/5 hover:text-slate-300'}`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>

            {status.step !== 'idle' && (
              <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-700">
                <div className={`glass-card p-10 relative overflow-hidden shadow-2xl ${status.step === 'error' ? 'ring-2 ring-red-500/50' : 'ring-1 ring-white/10'}`}>
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
                    <div className="flex items-center gap-6">
                      <div className={`w-16 h-16 rounded-3xl flex items-center justify-center border ${status.step === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-sky-500/10 text-sky-400 border-sky-500/20'}`}>
                        <i className={`fas ${status.step === 'error' ? 'fa-exclamation-triangle' : (status.step === 'merging' ? 'fa-microchip' : 'fa-brain')} ${status.step === 'completed' || status.step === 'error' ? '' : 'fa-spin'} text-3xl`}></i>
                      </div>
                      <div>
                        <h4 className={`text-3xl font-black tracking-tight ${status.step === 'error' ? 'text-red-400' : 'text-white'}`}>{status.message}</h4>
                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mt-1">Status: {status.step}</p>
                      </div>
                    </div>
                    <span className={`text-6xl font-black italic tabular-nums ${status.step === 'error' ? 'text-red-500' : 'text-sky-400'}`}>{status.progress}%</span>
                  </div>
                  <div className="h-4 bg-black/50 rounded-full overflow-hidden p-1 border border-white/5">
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ease-out ${status.step === 'error' ? 'bg-red-500' : 'bg-sky-500 shadow-[0_0_20px_rgba(56,189,248,0.4)]'}`} 
                      style={{ width: `${status.progress}%` }}
                    ></div>
                  </div>
                </div>

                {bilingualAss && (
                   <div className="flex justify-end gap-4">
                      <button 
                        onClick={downloadAss}
                        className="text-[10px] font-black uppercase tracking-widest text-sky-500 hover:text-sky-400 transition-colors flex items-center gap-2 bg-sky-500/5 px-4 py-2 rounded-xl border border-sky-500/10"
                      >
                        <i className="fas fa-file-download"></i> Download Bilingual .ass
                      </button>
                   </div>
                )}

                <div className="bg-black/80 rounded-[2rem] p-8 h-64 overflow-y-auto font-mono text-[11px] text-slate-500 custom-scrollbar border border-white/5 shadow-inner">
                  {logs.map((log, i) => (
                    <div key={i} className={`mb-1.5 leading-relaxed ${log.includes('ERROR') || log.includes('failed') ? 'text-red-500 font-bold' : ''}`}>
                      {log}
                    </div>
                  ))}
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
            description="Review and download your synthesized bilingual video."
            isCompleted={true}
            isActive={true}
          >
            <div className="space-y-10 animate-in zoom-in-95 duration-1000">
              <div className="aspect-video rounded-[3rem] overflow-hidden bg-black border border-white/10 shadow-3xl">
                <video controls className="w-full h-full shadow-2xl">
                  <source src={resultVideoUrl} type="video/mp4" />
                </video>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-6">
                <a 
                  href={resultVideoUrl}
                  download={`SubMerge_Master_${videoFile?.name || 'video.mp4'}`}
                  className="flex-[3] bg-white text-black py-8 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] text-center shadow-3xl transition-all hover:bg-slate-200 active:scale-95 flex items-center justify-center gap-4"
                >
                  <i className="fas fa-file-export"></i> Download Master File
                </a>
                <button 
                  onClick={resetState}
                  className="flex-1 bg-slate-900 text-slate-500 py-8 rounded-[2rem] border border-white/5 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <i className="fas fa-redo"></i> New Project
                </button>
              </div>
            </div>
          </StepCard>
        )}
      </div>

      <footer className="mt-40 mb-20 pt-16 border-t border-white/5 text-center opacity-40">
        <p className="text-[10px] uppercase font-bold tracking-[0.6em] text-slate-600 mb-2">
          Powered by Gemini AI & FFmpeg WASM Core
        </p>
        <p className="text-[9px] text-slate-700">Client-side synthesis ensures data privacy.</p>
      </footer>
    </div>
  );
};

export default App;
