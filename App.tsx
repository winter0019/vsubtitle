
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ProcessingStatus, TranslationModel } from './types.ts';
import { translateSubtitles } from './services/geminiService.ts';
import { mergeVideoAndSubtitles } from './services/ffmpegService.ts';
import StepCard from './components/StepCard.tsx';

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
  const [isFetcherActive, setIsFetcherActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-100), msg]);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
      addLog(`Video asset loaded: ${e.target.files[0].name}`);
    }
  };

  const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSrtFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setSrtContent(event.target?.result as string);
        addLog(`Subtitle asset loaded: ${file.name}`);
      };
      reader.readAsText(file);
    }
  };

  const initDownloader = () => {
    if (!youtubeUrl.trim()) return;
    setIsFetcherActive(true);
    addLog(`Initializing YouTube capture for: ${youtubeUrl}`);
    
    // Logic similar to the provided snippet
    if (iframeContainerRef.current) {
      iframeContainerRef.current.innerHTML = '';
      const loader = document.createElement('div');
      loader.className = 'text-center py-4 text-sky-400 font-bold animate-pulse';
      loader.textContent = 'Extracting Video & Subtitle streams...';
      iframeContainerRef.current.appendChild(loader);

      const apiUrl = atob("aHR0cHM6Ly9wLnNhdmVub3cudG8vYXBpL2NhcmQyLz91cmw9") + encodeURIComponent(youtubeUrl);
      const iframe = document.createElement('iframe');
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("width", "100%");
      iframe.setAttribute("height", "450px"); // Standard card height
      iframe.setAttribute("style", "border:none; border-radius: 1rem; background: #0f172a;");
      iframe.src = apiUrl;
      
      iframe.onload = () => {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
        addLog("Capture portal ready. Select 1080p and English SRT to continue.");
      };

      iframeContainerRef.current.appendChild(iframe);
    }
  };

  const processWorkflow = async () => {
    if (!videoFile || !srtContent) {
      alert("Please capture and upload the MP4 and SRT files from the portal first.");
      return;
    }

    try {
      setResultVideoUrl(null);
      setLogs([]);
      setShowLogs(true);
      
      // Step 1: Gemini Translation
      setStatus({ step: 'translating', progress: 5, message: 'AI Translation: Generating Bilingual Script...' });
      addLog(`Requesting Gemini to translate into ${targetLanguage}...`);
      const bilingualSrt = await translateSubtitles(srtContent, targetLanguage);
      setSrtContent(bilingualSrt);
      addLog('Bilingual translation successful.');

      // Step 2: FFmpeg Merge
      setStatus({ step: 'merging', progress: 0, message: 'GPU/CPU Synthesis: Burning Subtitles...' });
      addLog('Starting heavy rendering process in-browser...');
      const mergedBlob = await mergeVideoAndSubtitles(
        videoFile, 
        bilingualSrt, 
        (p) => setStatus(prev => ({ ...prev, progress: p })),
        addLog
      );

      const url = URL.createObjectURL(mergedBlob);
      setResultVideoUrl(url);
      setStatus({ step: 'completed', progress: 100, message: 'Process Finished!' });
      addLog('Video finalized and ready for download.');
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message || 'Processing error.';
      setStatus({ step: 'error', progress: 0, message: errorMsg });
      addLog(`CRITICAL ERROR: ${errorMsg}`);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto pb-24">
      <header className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-sky-500/10 rounded-3xl mb-6 border border-sky-500/20 shadow-2xl shadow-sky-500/10">
          <i className="fas fa-play-circle text-sky-400 text-3xl"></i>
        </div>
        <h1 className="text-5xl md:text-7xl font-black mb-4 tracking-tighter">
          SubMerge <span className="gradient-text">ULTRA</span>
        </h1>
        <p className="text-slate-400 text-xl max-w-2xl mx-auto font-light leading-relaxed">
          The all-in-one YouTube to Bilingual Video engine.
        </p>
      </header>

      <div className="grid gap-8">
        {/* MAGIC STEP 1: CAPTURE */}
        <StepCard
          number={1}
          title="YouTube Capture"
          description="Fetch source assets directly from the link."
          isCompleted={isFetcherActive && !!videoFile && !!srtFile}
          isActive={status.step === 'idle' || status.step === 'error'}
        >
          <div className="space-y-6">
            <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 shadow-inner">
              <label className="text-[11px] font-black uppercase text-sky-500 tracking-[0.2em] mb-4 block">YouTube Video URL</label>
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && initDownloader()}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm transition-all shadow-lg"
                />
                <button 
                  onClick={initDownloader}
                  className="bg-sky-500 text-white hover:bg-sky-400 px-8 py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 shadow-xl shadow-sky-500/20 active:scale-95"
                >
                  <i className="fas fa-search"></i> Fetch
                </button>
              </div>
            </div>

            {isFetcherActive && (
              <div className="animate-in fade-in zoom-in duration-500">
                <div ref={iframeContainerRef} className="overflow-hidden bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl mb-6"></div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`group border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${videoFile ? 'border-green-500/50 bg-green-500/5' : 'border-slate-800 hover:border-sky-500 hover:bg-sky-500/10 bg-slate-900/40'}`}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleVideoUpload} accept="video/mp4" className="hidden" />
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all ${videoFile ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 group-hover:bg-sky-500/20 text-slate-400 group-hover:text-sky-400'}`}>
                      <i className={`fas ${videoFile ? 'fa-check' : 'fa-video'} text-xl`}></i>
                    </div>
                    <p className="text-sm font-black text-slate-200 uppercase tracking-widest">Attach Video</p>
                    <p className="text-xs text-slate-500 mt-2 truncate max-w-[200px] mx-auto">{videoFile ? videoFile.name : 'Select the downloaded MP4'}</p>
                  </div>

                  <div 
                    onClick={() => srtInputRef.current?.click()}
                    className={`group border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${srtFile ? 'border-green-500/50 bg-green-500/5' : 'border-slate-800 hover:border-sky-500 hover:bg-sky-500/10 bg-slate-900/40'}`}
                  >
                    <input type="file" ref={srtInputRef} onChange={handleSrtUpload} accept=".srt" className="hidden" />
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all ${srtFile ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 group-hover:bg-sky-500/20 text-slate-400 group-hover:text-sky-400'}`}>
                      <i className={`fas ${srtFile ? 'fa-check' : 'fa-closed-captioning'} text-xl`}></i>
                    </div>
                    <p className="text-sm font-black text-slate-200 uppercase tracking-widest">Attach SRT</p>
                    <p className="text-xs text-slate-500 mt-2 truncate max-w-[200px] mx-auto">{srtFile ? srtFile.name : 'Select the downloaded SRT'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </StepCard>

        {/* MAGIC STEP 2: TRANSLATE & BURN */}
        <StepCard
          number={2}
          title="Bilingual Synthesis"
          description="Gemini AI will translate and FFmpeg will hardcode."
          isCompleted={status.step === 'completed'}
          isActive={!!videoFile && !!srtContent}
        >
          <div className="space-y-8">
            <div className="flex flex-col gap-4">
              <label className="text-[11px] font-black uppercase text-slate-500 tracking-[0.2em]">Target Language Selection</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {['Chinese (Simplified)', 'Japanese', 'Korean', 'Spanish', 'French', 'German', 'Russian', 'Arabic'].map(lang => (
                  <button
                    key={lang}
                    onClick={() => setTargetLanguage(lang)}
                    disabled={status.step !== 'idle' && status.step !== 'error'}
                    className={`px-4 py-3 rounded-xl text-xs font-black transition-all border-2 ${targetLanguage === lang ? 'bg-sky-500 border-sky-400 text-white shadow-lg shadow-sky-500/20' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'}`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            {status.step === 'idle' || status.step === 'error' ? (
              <button 
                onClick={processWorkflow}
                className="group w-full bg-sky-500 hover:bg-sky-400 py-6 rounded-2xl font-black text-lg uppercase tracking-[0.3em] shadow-2xl shadow-sky-500/30 transition-all flex items-center justify-center gap-4 active:scale-95"
              >
                Synthesize Now <i className="fas fa-bolt group-hover:animate-bounce"></i>
              </button>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="bg-slate-950 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-slate-900">
                    <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${status.progress}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400">
                        <i className="fas fa-cog fa-spin"></i>
                      </div>
                      <div>
                        <span className="text-lg font-black text-slate-200 block">{status.message}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Stage: {status.step}</span>
                      </div>
                    </div>
                    <span className="text-2xl font-black font-mono text-sky-400">{status.progress}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                   <button 
                    onClick={() => setShowLogs(!showLogs)}
                    className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors uppercase font-black tracking-widest flex items-center gap-3"
                  >
                    <i className={`fas ${showLogs ? 'fa-terminal' : 'fa-terminal opacity-40'}`}></i>
                    {showLogs ? 'Hide Render Logs' : 'View Render Logs'}
                  </button>
                  {status.step === 'merging' && (
                    <span className="text-[10px] text-sky-500 font-bold flex items-center gap-2">
                       <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                      </span>
                      LOCAL GPU RENDERING
                    </span>
                  )}
                </div>

                {showLogs && (
                  <div className="bg-black/80 rounded-3xl p-6 h-48 overflow-y-auto font-mono text-[11px] text-slate-500 border border-slate-800/50 custom-scrollbar shadow-inner animate-in fade-in duration-300">
                    {logs.map((log, i) => <div key={i} className="mb-2 border-l-2 border-slate-800 pl-3 leading-relaxed">{log}</div>)}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
            )}
          </div>
        </StepCard>

        {/* MAGIC STEP 3: EXPORT */}
        {status.step === 'completed' && resultVideoUrl && (
          <StepCard
            number={3}
            title="Final Result"
            description="Your bilingual video is rendered and ready."
            isCompleted={true}
            isActive={true}
          >
            <div className="space-y-8 animate-in zoom-in duration-500">
              <div className="aspect-video rounded-3xl overflow-hidden bg-black border border-slate-800 shadow-2xl relative group">
                <video controls className="w-full h-full">
                   <source src={resultVideoUrl} type="video/mp4" />
                </video>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <a 
                  href={resultVideoUrl}
                  download={`SubMerge_${videoFile?.name || 'bilingual_video.mp4'}`}
                  className="bg-white text-black hover:bg-slate-200 py-6 rounded-2xl font-black text-sm uppercase tracking-widest text-center transition-all shadow-2xl flex items-center justify-center gap-3 active:scale-95"
                >
                  Download Output <i className="fas fa-file-video"></i>
                </a>
                <button 
                  onClick={() => window.location.reload()}
                  className="bg-slate-900 hover:bg-slate-800 py-6 rounded-2xl font-black text-sm uppercase tracking-widest text-center border border-slate-800 transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                  Process New <i className="fas fa-redo"></i>
                </button>
              </div>
            </div>
          </StepCard>
        )}
      </div>

      <footer className="mt-24 pt-12 border-t border-slate-900 text-center opacity-40">
        <p className="text-[11px] uppercase font-black tracking-[0.4em] text-slate-500 mb-6">
          SubMerge Engine v2.0 • Gemini 2.5 Pro Powered
        </p>
        <div className="flex justify-center gap-10 grayscale opacity-40">
           <i className="fab fa-google text-2xl hover:grayscale-0 transition-all"></i>
           <i className="fab fa-youtube text-2xl hover:grayscale-0 transition-all"></i>
           <i className="fas fa-atom text-2xl hover:grayscale-0 transition-all"></i>
        </div>
      </footer>
    </div>
  );
};

export default App;
