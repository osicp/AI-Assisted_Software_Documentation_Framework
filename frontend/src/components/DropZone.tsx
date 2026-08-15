import React, { useState, useRef } from 'react';
import { Upload, Folder, Cpu, FileArchive, ShieldCheck, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { ASTSymbol } from '../lib/types';

interface DropZoneProps {
  projectId?: string;
  onUploadSuccess?: (symbols: ASTSymbol[], versionId: string) => void;
}

const STEPS = [
  { id: 1, label: 'Ingesting Stream' },
  { id: 2, label: 'Structural Noise Purifying' },
  { id: 3, label: 'AST Symbol Indexing' },
  { id: 4, label: 'Context Caching' },
  { id: 5, label: 'Ledger Audit Registration' }
];

export default function DropZone({ projectId, onUploadSuccess }: DropZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [versionTag, setVersionTag] = useState('v1.0.0');
  const [directoryPath, setDirectoryPath] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0); // 0 = idle, 1 to 5 = active steps
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Result stats
  const [uploadResult, setUploadResult] = useState<{
    versionId: string;
    checksum: string;
    rawSize: number;
    purifiedSize: number;
    reduction: string;
    symbolsCount: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.zip')) {
        await uploadFile(file);
      } else {
        setErrorMsg("Invalid archive format: Codebase uploads must be packaged in a '.zip' format.");
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const uploadFile = async (file: File) => {
    if (!projectId) {
      setErrorMsg("Please select or create a project in the header before uploading a codebase.");
      return;
    }

    setErrorMsg(null);
    setUploadResult(null);
    setIsUploading(true);
    setUploadProgress(0);
    setCurrentStep(1); // Ingesting Stream

    try {
      const res = await api.uploadCodebase(
        projectId,
        versionTag,
        file,
        (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
          if (percentCompleted >= 100) {
            // Upload complete, backend starting extraction / purification
            setCurrentStep(2); // Structural Noise Purifying
          }
        }
      );

      // Transition stepper rapidly for the remaining backend processing steps
      setCurrentStep(3); // AST Symbol Indexing
      await new Promise(r => setTimeout(r, 600));
      
      setCurrentStep(4); // Context Caching
      await new Promise(r => setTimeout(r, 600));
      
      setCurrentStep(5); // Ledger Audit Registration
      await new Promise(r => setTimeout(r, 600));

      setUploadResult({
        versionId: res.version_id,
        checksum: res.zip_checksum,
        rawSize: res.raw_size_bytes,
        purifiedSize: res.purified_size_bytes,
        reduction: res.reduction_percentage,
        symbolsCount: res.ast_symbols?.length || 0
      });

      if (onUploadSuccess && res.ast_symbols) {
        onUploadSuccess(res.ast_symbols, res.version_id);
      }

    } catch (e: any) {
      console.error(e);
      const backendErr = e.response?.data?.detail || e.message || "Failed to process codebase.";
      setErrorMsg(backendErr);
      setCurrentStep(0);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directoryPath.trim()) return;
    setErrorMsg("Direct host drive scanning is isolated for security. Please package your codebase into a '.zip' file and upload it above.");
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-[fadeIn_0.5s_ease-out]">
      {/* View Title */}
      <div className="border-b border-borderLine pb-4">
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
          Codebase Ingestion Hub & Stepper
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Upload project codebase archives to run static AST symbol extractions under Zero-Data Retention rules.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Input Form & Upload boundary */}
        <div className="md:col-span-2 space-y-6">
          {/* Version Tag Setting */}
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">
                Target Version Tag
              </label>
              <input
                type="text"
                value={versionTag}
                onChange={(e) => setVersionTag(e.target.value)}
                placeholder="v1.0.0"
                disabled={isUploading}
                className="w-full px-3 py-2 bg-slate-950/80 border border-borderLine text-slate-300 text-sm font-semibold rounded focus:outline-none focus:border-blue-500 transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Interactive Drag & Drop container */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`w-full h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center transition-all ${
              dragActive 
                ? 'border-blue-500 bg-blue-500/5' 
                : 'border-borderLine hover:border-slate-500 hover:bg-slate-900/10'
            } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="hidden"
            />
            
            <Upload className={`w-12 h-12 mb-4 transition-transform ${dragActive ? 'scale-110 text-blue-400' : 'text-slate-500'}`} />
            
            <h3 className="text-base font-semibold text-slate-200 mb-1">
              Drag & drop your codebase ZIP archive
            </h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm">
              Limited to compilable code architectures. Zip files will be extracted in transient containers under compliance guidelines.
            </p>

            <button
              onClick={onButtonClick}
              type="button"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
            >
              Browse Local Files
            </button>
          </div>

          {/* Absolute Directory path scanner */}
          <form onSubmit={handlePathSubmit} className="glass rounded-xl p-5 border border-borderLine">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-slate-500" />
              <span>Absolute Directory Path Scanner</span>
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={directoryPath}
                onChange={(e) => setDirectoryPath(e.target.value)}
                placeholder="/Users/username/workspace/target-repo"
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-borderLine text-slate-300 text-xs font-mono rounded focus:outline-none focus:border-blue-500 transition-all"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold border border-borderLine hover:text-slate-100 transition-all"
              >
                Scan Path
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Provides direct workspace AST extraction for local directories on this host machine.
            </p>
          </form>
        </div>

        {/* Right Column: Execution Stepper & Results */}
        <div className="space-y-6">
          {/* Stepper block */}
          <div className="glass rounded-xl p-6 border border-borderLine relative overflow-hidden">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-5 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-500" />
              <span>Execution Pipeline</span>
            </h3>

            <div className="space-y-6 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-800">
              {STEPS.map((step) => {
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;
                
                return (
                  <div key={step.id} className="flex gap-4 items-start relative select-none">
                    <div className={`w-6.5 h-6.5 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-all ${
                      isCompleted 
                        ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_#10b981]' 
                        : isActive 
                        ? 'bg-blue-600 text-white animate-pulse shadow-[0_0_10px_#3b82f6]' 
                        : 'bg-slate-900 text-slate-500 border border-borderLine'
                    }`}>
                      {isCompleted ? '✓' : step.id}
                    </div>
                    <div>
                      <h4 className={`text-xs font-semibold ${
                        isActive ? 'text-blue-400' : isCompleted ? 'text-slate-300' : 'text-slate-500'
                      }`}>{step.label}</h4>
                      {isActive && step.id === 1 && (
                        <div className="w-40 bg-slate-900 rounded-full h-1.5 mt-1.5 overflow-hidden">
                          <div 
                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      )}
                      {isActive && step.id > 1 && (
                        <div className="flex items-center gap-1 text-[10px] text-blue-400/80 mt-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Processing on backend...</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status Message block */}
          {errorMsg && (
            <div className="border border-rose-500/20 bg-rose-500/10 rounded-xl p-4 flex gap-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider">Pipeline Failed</h4>
                <p className="text-xs mt-1 leading-normal">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Results Summary Card */}
          {uploadResult && (
            <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-6 relative overflow-hidden select-none animate-[fadeIn_0.5s_ease-out]">
              <div className="flex items-center gap-2 text-emerald-400 mb-4">
                <ShieldCheck className="w-5 h-5" />
                <h4 className="text-sm font-bold uppercase tracking-wider">Ingestion Success</h4>
              </div>

              <div className="space-y-2.5 font-mono text-[11px] text-slate-300">
                <div className="flex justify-between border-b border-slate-900 pb-1">
                  <span className="text-slate-500">Version ID:</span>
                  <span>{uploadResult.versionId}</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1">
                  <span className="text-slate-500">Zip Checksum:</span>
                  <span className="truncate max-w-[120px]" title={uploadResult.checksum}>{uploadResult.checksum}</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1">
                  <span className="text-slate-500">Raw Size:</span>
                  <span>{formatBytes(uploadResult.rawSize)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1">
                  <span className="text-slate-500">Purified Size:</span>
                  <span>{formatBytes(uploadResult.purifiedSize)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1">
                  <span className="text-slate-500">Reduction:</span>
                  <span className="text-emerald-400 font-bold">{uploadResult.reduction}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">AST Symbols:</span>
                  <span className="text-blue-400 font-bold">{uploadResult.symbolsCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
