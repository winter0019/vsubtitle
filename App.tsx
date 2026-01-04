
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

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

  const downloadSrt = () => {
    if (!srtContent) return;
    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = srtFile?.name.replace('.srt', '') || 'translated';
    a.download = `${baseName}_bilingual.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog('Bilingual SRT downloaded.');
  };

  const processWorkflow = async () => {
    if (!videoFile || (!srtFile && !srtContent)) {
      alert("Please upload both a video file and its corresponding SRT file.");
      return;
    }

    try {
      setResultVideoUrl(null);
      setLogs([]);
      setShowLogs(true);
      
      setStatus({ step: 'translating', progress: 5, message: 'Translating with Gemini AI...' });
      addLog('Translating subtitles to bilingual format...');
      const bilingualSrt = await translateSubtitles(srtContent, targetLanguage);
      setSrtContent(bilingualSrt);
      addLog('Bilingual SRT content generated.');

      setStatus({ step: 'merging', progress: 0, message: 'Burning subtitles (Local Render)...' });
      const mergedBlob = await mergeVideoAndSubtitles(
        videoFile, 
        bilingualSrt, 
        (p) => setStatus(prev => ({ ...prev, progress: p })),
        addLog
      );

      const url = URL.createObjectURL(mergedBlob);
      setResultVideoUrl(url);
      setStatus({ step: 'completed', progress: 100, message: 'All steps completed successfully!' });
      addLog('Output video created successfully.');
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message || 'An error occurred during processing.';
      setStatus({ step: 'error', progress: 0, message: errorMsg });
      addLog(`ERROR: ${errorMsg}`);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto pb-20">
      <header className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-500/10 rounded-2xl mb-4 border border-sky-500/20">
          <i className="fas fa-closed-captioning text-sky-400 text-2xl"></i>
        </div>
        <h1 className="text-4xl md:text-6xl font-black mb-3 tracking-tighter">
          SubMerge <span className="gradient-text">AI</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto font-medium">
          The all-in-one bilingual subtitle hardcoder.
        </p>
      </header>

      <div className="grid gap-6">
        <StepCard
          number={1}
          title="Assets Upload"
          description="Select your video and English SRT file."
          isCompleted={!!videoFile && !!srtFile}
          isActive={status.step === 'idle' || status.step === 'error' || status.step === 'completed'}
        >
          <div className="space-y-4">
            <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-xl">
              <p className="text-[10px] text-slate-500 mb-3 font-black uppercase tracking-widest">YouTube Downloader Helper</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Paste YouTube Link..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm transition-all"
                />
                <a 
                  href={youtubeUrl ? `https://en.y2down.app/?url=${encodeURIComponent(youtubeUrl)}` : 'https://en.y2down.app/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-sky-600 hover:bg-sky-500 px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-900/20 active:scale-[0.98]"
                >
                  Get Files <i className="fas fa-external-link-alt text-[10px]"></i>
                </a>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`group border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${videoFile ? 'border-green-500/50 bg-green-500/5' : 'border-slate-700 hover:border-sky-500 hover:bg-sky-500/5 bg-slate-800/30'}`}
              >
                <input type="file" ref={fileInputRef} onChange={handleVideoUpload} accept="video/mp4" className="hidden" />
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 transition-colors ${videoFile ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 group-hover:bg-sky-500/20 text-slate-400 group-hover:text-sky-400'}`}>
                  <i className={`fas ${videoFile ? 'fa-check' : 'fa-video'} text-sm`}></i>
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Video (MP4)</p>
                <p className="text-[11px] text-slate-500 truncate max-w-full">{videoFile ? videoFile.name : 'Select File'}</p>
              </div>

              <div 
                onClick={() => srtInputRef.current?.click()}
                className={`group border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${srtFile ? 'border-green-500/50 bg-green-500/5' : 'border-slate-700 hover:border-sky-500 hover:bg-sky-500/5 bg-slate-800/30'}`}
              >
                <input type="file" ref={srtInputRef} onChange={handleSrtUpload} accept=".srt" className="hidden" />
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 transition-colors ${srtFile ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 group-hover:bg-sky-500/20 text-slate-400 group-hover:text-sky-400'}`}>
                  <i className={`fas ${srtFile ? 'fa-check' : 'fa-font'} text-sm`}></i>
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Subtitle (SRT)</p>
                <p className="text-[11px] text-slate-500 truncate max-w-full">{srtFile ? srtFile.name : 'Select File'}</p>
              </div>
            </div>
          </div>
        </StepCard>

        <StepCard
          number={2}
          title="Process & Merge"
          description="Translate and bake subtitles directly into the video."
          isCompleted={status.step === 'completed'}
          isActive={!!videoFile && !!srtFile && status.step !== 'completed'}
        >
          <div className="space-y-5">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Target Language</label>
              <select 
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                disabled={status.step !== 'idle' && status.step !== 'error'}
                className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-sky-500 outline-none text-sm cursor-pointer disabled:opacity-50"
              >
                <option>Chinese (Simplified)</option>
                <option>Chinese (Traditional)</option>
                <option>Spanish</option>
                <option>French</option>
                <option>Japanese</option>
                <option>Korean</option>
                <option>German</option>
                <option>Russian</option>
              </select>
            </div>

            {status.step === 'idle' || status.step === 'error' ? (
              <button 
                onClick={processWorkflow}
                className="w-full bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-sky-900/30 transition-all flex items-center justify-center gap-3 active:scale-[0.97]"
              >
                Start Processing <i className="fas fa-play"></i>
              </button>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-sky-400 flex items-center gap-2">
                      <i className="fas fa-sync-alt animate-spin"></i>
                      {status.message}
                    </span>
                    <span className="text-sm font-mono text-slate-300">{status.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-sky-500 transition-all duration-300 ease-out"
                      style={{ width: `${status.progress}%` }}
                    ></div>
                  </div>
                </div>

                <button 
                  onClick={() => setShowLogs(!showLogs)}
                  className="flex items-center gap-2 text-[10px] text-slate-500 hover:text-slate-300 transition-colors uppercase font-black tracking-widest"
                >
                  <i className={`fas ${showLogs ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
                  View Logs
                </button>
                {showLogs && (
                  <div className="bg-black/40 rounded-xl p-4 h-32 overflow-y-auto font-mono text-[10px] text-slate-500 border border-slate-800/50 custom-scrollbar">
                    {logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
            )}
            
            {status.step === 'error' && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-3">
                 <i className="fas fa-exclamation-triangle"></i>
                 <p>{status.message}</p>
              </div>
            )}
          </div>
        </StepCard>

        {status.step === 'completed' && resultVideoUrl && (
          <StepCard
            number={3}
            title="Download Result"
            description="Your hardcoded bilingual video is ready."
            isCompleted={true}
            isActive={true}
          >
            <div className="space-y-6">
              <div className="aspect-video rounded-xl overflow-hidden bg-black border border-slate-700 shadow-2xl relative">
                <video controls className="w-full h-full">
                   <source src={resultVideoUrl} type="video/mp4" />
                </video>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <a 
                  href={resultVideoUrl}
                  download={`SubMerge_${videoFile?.name || 'output.mp4'}`}
                  className="bg-green-600 hover:bg-green-500 py-4 rounded-xl font-black text-sm uppercase tracking-widest text-center transition-all shadow-lg shadow-green-900/20 flex items-center justify-center gap-2"
                >
                  Download Video <i className="fas fa-download"></i>
                </a>
                <button 
                  onClick={downloadSrt}
                  className="bg-indigo-600 hover:bg-indigo-500 py-4 rounded-xl font-black text-sm uppercase tracking-widest text-center transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
                >
                  Download SRT <i className="fas fa-file-alt"></i>
                </button>
              </div>
              
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-slate-800 hover:bg-slate-700 py-3 rounded-xl font-bold text-xs text-slate-400 transition-all border border-slate-700/50"
              >
                Restart with New Video
              </button>
            </div>
          </StepCard>
        )}
      </div>

      <footer className="mt-20 py-10 border-t border-slate-800/50 text-center opacity-40 hover:opacity-100 transition-opacity">
        <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Local Processing • Private • Secure</p>
      </footer>
    </div>
  );
};

export default App;
