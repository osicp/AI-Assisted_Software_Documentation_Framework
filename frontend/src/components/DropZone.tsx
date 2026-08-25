import React, { useState, useRef } from 'react';
import { Upload, Cpu, FileArchive, ShieldCheck, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { ASTSymbol } from '../lib/types';
import InfoTooltip from './InfoTooltip';

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
        <h1 className="text-2xl font-bold tracking-tight text-sfTextPrimary">
          Codebase Ingestion Hub & Stepper
        </h1>
        <p className="text-sm text-sfTextMuted mt-1">
          Upload project codebase archives to run static AST symbol extractions under Zero-Data Retention rules.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Input Form & Upload boundary */}
        <div className="md:col-span-2 space-y-6">
          {/* Version Tag Setting */}
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-widest text-sfTextMuted font-bold mb-1.5">
                Target Version Tag
              </label>
              <input
                type="text"
                value={versionTag}
                onChange={(e) => setVersionTag(e.target.value)}
                placeholder="v1.0.0"
                disabled={isUploading}
                className="w-full px-3 py-2 bg-background border border-sfBorder text-sfTextPrimary text-sm font-semibold rounded focus:outline-none focus:border-sfBlue transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Interactive Drag & Drop container */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`relative w-full h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center transition-all ${
              dragActive
                ? 'border-sfBlue bg-sfBlue/5'
                : 'border-borderLine hover:border-sfBlue hover:bg-sfBlue/5'
            } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <InfoTooltip
              text="Drop or browse for a codebase .zip archive to ingest; it is extracted and AST-indexed under Zero-Data Retention rules."
              className="absolute top-3 right-3"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="hidden"
            />
            
            <Upload className={`w-12 h-12 mb-4 transition-transform ${dragActive ? 'scale-110 text-sfBlue' : 'text-sfTextMuted'}`} />

            <h3 className="text-base font-semibold text-sfTextPrimary mb-1">
              Drag & drop your codebase ZIP archive
            </h3>
            <p className="text-xs text-sfTextMuted mb-4 max-w-sm">
              Limited to compilable code architectures. Zip files will be extracted in transient containers under compliance guidelines.
            </p>

            <button
              onClick={onButtonClick}
              type="button"
              className="px-4 py-2 bg-sfBlue hover:bg-sfBlueHover text-white rounded text-xs font-semibold shadow-sm transition-all"
            >
              Browse Local Files
            </button>
          </div>


        </div>

        {/* Right Column: Execution Stepper & Results */}
        <div className="space-y-6">
          {/* Stepper block */}
          <div className="glass rounded-xl p-6 border border-borderLine relative overflow-hidden">
            <InfoTooltip
              text="Tracks live progress through the five-stage ingestion pipeline: streaming, purification, AST indexing, context caching, and ledger registration."
              className="absolute top-3 right-3"
            />
            <h3 className="text-sm font-bold uppercase tracking-wider text-sfTextMuted mb-5 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sfBlue" />
              <span>Execution Pipeline</span>
            </h3>

            <div className="space-y-6 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-sfBorder">
              {STEPS.map((step) => {
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;
                
                return (
                  <div key={step.id} className="flex gap-4 items-start relative select-none">
                    <div className={`w-6.5 h-6.5 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-all ${
                      isCompleted
                        ? 'bg-sfSuccess text-white'
                        : isActive
                        ? 'bg-sfBlue text-white animate-pulse'
                        : 'bg-background text-sfTextMuted border border-borderLine'
                    }`}>
                      {isCompleted ? '✓' : step.id}
                    </div>
                    <div>
                      <h4 className={`text-xs font-semibold ${
                        isActive ? 'text-sfBlue' : isCompleted ? 'text-sfTextPrimary' : 'text-sfTextMuted'
                      }`}>{step.label}</h4>
                      {isActive && step.id === 1 && (
                        <div className="w-40 bg-background rounded-full h-1.5 mt-1.5 overflow-hidden">
                          <div
                            className="bg-sfBlue h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      )}
                      {isActive && step.id > 1 && (
                        <div className="flex items-center gap-1 text-[10px] text-sfBlue/80 mt-1">
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
            <div className="border border-sfError/30 bg-sfErrorBg rounded-xl p-4 flex gap-3 text-sfError">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider">Pipeline Failed</h4>
                <p className="text-xs mt-1 leading-normal">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Results Summary Card */}
          {uploadResult && (
            <div className="border border-sfSuccess/30 bg-sfSuccessBg rounded-xl p-6 relative overflow-hidden select-none animate-[fadeIn_0.5s_ease-out]">
              <InfoTooltip
                text="Summarizes the completed ingestion: version ID, zip checksum, raw vs. purified size reduction, and extracted AST symbol count."
                className="absolute top-3 right-3"
              />
              <div className="flex items-center gap-2 text-sfSuccess mb-4">
                <ShieldCheck className="w-5 h-5" />
                <h4 className="text-sm font-bold uppercase tracking-wider">Ingestion Success</h4>
              </div>

              <div className="space-y-2.5 font-mono text-[11px] text-sfTextPrimary">
                <div className="flex justify-between border-b border-sfBorder pb-1">
                  <span className="text-sfTextMuted">Version ID:</span>
                  <span>{uploadResult.versionId}</span>
                </div>
                <div className="flex justify-between border-b border-sfBorder pb-1">
                  <span className="text-sfTextMuted">Zip Checksum:</span>
                  <span className="truncate max-w-[120px]" title={uploadResult.checksum}>{uploadResult.checksum}</span>
                </div>
                <div className="flex justify-between border-b border-sfBorder pb-1">
                  <span className="text-sfTextMuted">Raw Size:</span>
                  <span>{formatBytes(uploadResult.rawSize)}</span>
                </div>
                <div className="flex justify-between border-b border-sfBorder pb-1">
                  <span className="text-sfTextMuted">Purified Size:</span>
                  <span>{formatBytes(uploadResult.purifiedSize)}</span>
                </div>
                <div className="flex justify-between border-b border-sfBorder pb-1">
                  <span className="text-sfTextMuted">Reduction:</span>
                  <span className="text-sfSuccess font-bold">{uploadResult.reduction}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-sfTextMuted">AST Symbols:</span>
                  <span className="text-sfBlue font-bold">{uploadResult.symbolsCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
