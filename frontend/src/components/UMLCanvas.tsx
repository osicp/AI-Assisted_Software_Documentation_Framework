import React, { useState, useEffect } from 'react';
import { Layout, CheckCircle, AlertTriangle, Play, RefreshCw, ZoomIn, ZoomOut, Maximize2, Layers, GitCommit, Loader2, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { ASTSymbol } from '../lib/types';

interface UMLCanvasProps {
  astSymbols?: ASTSymbol[];
  setClassDiagramUrl?: (url: string | null) => void;
  setSequenceDiagramUrl?: (url: string | null) => void;
  classDiagramText: string;
  setClassDiagramText: (val: string) => void;
  sequenceDiagramText: string;
  setSequenceDiagramText: (val: string) => void;
  tobeClassText: string;
  setTobeClassText: (val: string) => void;
  tobeSeqText: string;
  setTobeSeqText: (val: string) => void;
  activeMode: 'asis' | 'tobe';
  setActiveMode: (mode: 'asis' | 'tobe') => void;
  backupTobeClassText?: string | null;
  setBackupTobeClassText?: (val: string | null) => void;
  backupTobeSeqText?: string | null;
  setBackupTobeSeqText?: (val: string | null) => void;
}

export default function UMLCanvas({ 
  astSymbols = [], 
  setClassDiagramUrl, 
  setSequenceDiagramUrl,
  classDiagramText,
  setClassDiagramText,
  sequenceDiagramText,
  setSequenceDiagramText,
  tobeClassText,
  setTobeClassText,
  tobeSeqText,
  setTobeSeqText,
  activeMode,
  setActiveMode,
  backupTobeClassText = null,
  setBackupTobeClassText,
  backupTobeSeqText = null,
  setBackupTobeSeqText
}: UMLCanvasProps) {

  // Reconciliation report states
  const [reconciliationReport, setReconciliationReport] = useState<{
    reconciled: string[];
    pending: string[];
  } | null>(null);
  const [showReconciliation, setShowReconciliation] = useState(false);

  // Render states
  const [classRenderUrl, setClassRenderUrl] = useState<string | null>(null);
  const [sequenceRenderUrl, setSequenceRenderUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // Zoom control
  const [zoomScale, setZoomScale] = useState(1);

  // Auditing consistency state
  const [auditResult, setAuditResult] = useState<{
    status: string;
    compromised_blocks: { type: string; detail: string }[];
    scanned_classes: number;
    scanned_messages: number;
  } | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const getActiveClassText = () => activeMode === 'asis' ? classDiagramText : tobeClassText;
  const setActiveClassText = (val: string) => activeMode === 'asis' ? setClassDiagramText(val) : setTobeClassText(val);
  
  const handleUndoProposed = () => {
    if (backupTobeClassText !== null && setTobeClassText) {
      setTobeClassText(backupTobeClassText);
    }
    if (backupTobeSeqText !== null && setTobeSeqText) {
      setTobeSeqText(backupTobeSeqText);
    }
    if (setBackupTobeClassText) setBackupTobeClassText(null);
    if (setBackupTobeSeqText) setBackupTobeSeqText(null);
    alert("Reverted proposed backlog additions from To-Be diagrams.");
  };

  const getActiveSeqText = () => activeMode === 'asis' ? sequenceDiagramText : tobeSeqText;
  const setActiveSeqText = (val: string) => activeMode === 'asis' ? setSequenceDiagramText(val) : setTobeSeqText(val);

  const handleRender = async () => {
    setIsRendering(true);
    setAuditResult(null);
    try {
      const activeClass = getActiveClassText();
      const activeSeq = getActiveSeqText();

      const classRes = await api.renderUml(activeClass);
      setClassRenderUrl(classRes.render_url);
      if (setClassDiagramUrl) {
        setClassDiagramUrl(classRes.render_url);
      }

      const seqRes = await api.renderUml(activeSeq);
      setSequenceRenderUrl(seqRes.render_url);
      if (setSequenceDiagramUrl) {
        setSequenceDiagramUrl(seqRes.render_url);
      }
    } catch (e) {
      console.error(e);
      alert("PlantUML render server communication failure.");
    } finally {
      setIsRendering(false);
    }
  };

  const handleVerify = async () => {
    setIsAuditing(true);
    try {
      const activeClass = getActiveClassText();
      const activeSeq = getActiveSeqText();
      const res = await api.verifyUml(activeClass, activeSeq);
      setAuditResult(res);
    } catch (e) {
      console.error(e);
      alert("Model consistency verification audit failed.");
    } finally {
      setIsAuditing(false);
    }
  };

  // Local parser helpers to display class tree and sequence messages list
  const parseClassTree = () => {
    const activeText = getActiveClassText();
    const classBlocks = Array.from(activeText.matchAll(/(?:class|interface)\s+(\w+)(?:\s+<<[\s\S]*?>>)?\s*(?:\{([\s\S]*?)\})?/g));
    return classBlocks.map(block => {
      const className = block[1];
      const content = block[2] || "";
      const methods = Array.from(content.matchAll(/(?:[+\-#~]?\s*)(\w+)\s*\(/g)).map(m => m[1]);
      return { className, methods };
    });
  };

  const parseSequenceTrace = () => {
    const activeSeq = getActiveSeqText();
    return Array.from(activeSeq.matchAll(/(\w+)\s*-(?:-)?(?:>|x)\s*(\w+)\s*:\s*(.*)/g)).map(arrow => ({
      sender: arrow[1],
      receiver: arrow[2],
      message: arrow[3]
    }));
  };

  const runReconciliation = () => {
    // Parse tobeClassText to find all class ClassName <<Planned>>
    const plannedRegex = /(?:class|interface)\s+(\w+)\s+<<\s*Planned\s*>>/gi;
    const foundPlannedClasses: string[] = [];
    let match;
    while ((match = plannedRegex.exec(tobeClassText)) !== null) {
      foundPlannedClasses.push(match[1]);
    }

    // Also look for: participant ParticipantName <<Planned>>
    const plannedSeqRegex = /(?:participant|actor|boundary|control|entity|database)\s+(\w+)\s+<<\s*Planned\s*>>/gi;
    while ((match = plannedSeqRegex.exec(tobeSeqText)) !== null) {
      if (!foundPlannedClasses.includes(match[1])) {
        foundPlannedClasses.push(match[1]);
      }
    }

    const activeClassNames = new Set(
      astSymbols
        .filter(sym => sym.kind === 'class' || sym.kind === 'interface')
        .map(sym => sym.name)
    );

    const reconciled: string[] = [];
    const pending: string[] = [];

    foundPlannedClasses.forEach(cls => {
      if (activeClassNames.has(cls)) {
        reconciled.push(cls);
      } else {
        pending.push(cls);
      }
    });

    setReconciliationReport({ reconciled, pending });
    setShowReconciliation(true);
  };

  if (!astSymbols || astSymbols.length === 0) {
    return (
      <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] select-none">
        <div className="border-b border-borderLine pb-4">
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
            UML Canvas & Consistency Auditor
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Generate UML structural and behavioral diagrams directly from your codebase AST symbols and audit their consistency.
          </p>
        </div>

        <div className="glass rounded-xl p-8 border border-borderLine flex flex-col items-center justify-center text-center space-y-4 h-96">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-sm font-bold text-slate-200">No Codebase Ingested</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Please go to the <strong>Ingestion Hub</strong> tab, upload and index a codebase ZIP archive to compile AST symbols before rendering design diagrams or auditing architectural consistency.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const classTree = parseClassTree();
  const sequenceTrace = parseSequenceTrace();

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-[fadeIn_0.5s_ease-out]">
      
      {/* 1. Left Column: Text Editors & Class Navigator */}
      <div className="lg:col-span-1 space-y-6">
        
        {/* Class Navigator Tree */}
        <div className="glass rounded-xl p-5 border border-borderLine">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Class Navigator</span>
          </h3>
          <div className="space-y-3 font-mono text-xs max-h-52 overflow-y-auto pr-2">
            {classTree.map((c, idx) => (
              <div key={idx} className="border-l border-slate-800 pl-2 ml-1">
                <span className="text-blue-300 font-semibold">{c.className}</span>
                <div className="pl-3 mt-1 space-y-1 text-slate-400 text-[10px]">
                  {c.methods.map((m, mIdx) => (
                    <div key={mIdx} className="truncate">+{m}()</div>
                  ))}
                  {c.methods.length === 0 && <div className="italic text-slate-600">no methods</div>}
                </div>
              </div>
            ))}
            {classTree.length === 0 && <div className="text-slate-600 italic">No classes detected.</div>}
          </div>
        </div>

        {/* Message sequence interactions trace */}
        <div className="glass rounded-xl p-5 border border-borderLine">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sequence Trace</span>
          </h3>
          <div className="space-y-2 font-mono text-[10px] max-h-52 overflow-y-auto pr-2">
            {sequenceTrace.map((msg, idx) => (
              <div key={idx} className="p-2 bg-slate-900/60 border border-slate-900 rounded">
                <div className="flex justify-between text-slate-500 mb-1">
                  <span>{msg.sender}</span>
                  <span>➔ {msg.receiver}</span>
                </div>
                <div className="text-cyan-300 truncate">{msg.message}</div>
              </div>
            ))}
            {sequenceTrace.length === 0 && <div className="text-slate-600 italic">No lifelines communication trace.</div>}
          </div>
        </div>

      </div>

      {/* 2. Middle Column: Diagram editors & SVG views */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Architecture Mode Selector */}
        <div className="flex justify-between items-center bg-slate-900 border border-borderLine rounded-xl p-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveMode('asis')}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                activeMode === 'asis'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              As-Is Architecture (Codebase)
            </button>
            <button
              onClick={() => setActiveMode('tobe')}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                activeMode === 'tobe'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              To-Be Architecture (Proposed)
            </button>
          </div>

          {activeMode === 'tobe' && (
            <button
              onClick={runReconciliation}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-purple-500/30 text-purple-400 hover:text-purple-200 hover:bg-purple-900/10 rounded text-xs font-bold transition-all"
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>Run Reconciliation</span>
            </button>
          )}
        </div>

        {/* Editor controls */}
        <div className="flex justify-between items-center bg-slate-950/40 p-4 border border-borderLine rounded-xl">
          <div className="flex gap-2">
            <button
              onClick={handleRender}
              disabled={isRendering}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold shadow transition-all disabled:opacity-50"
            >
              {isRendering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>Render Diagrams</span>
            </button>
            <button
              onClick={handleVerify}
              disabled={isAuditing}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 border border-borderLine text-slate-300 hover:text-slate-100 rounded text-xs font-bold transition-all disabled:opacity-50"
            >
              {isAuditing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
              <span>Audit Consistency</span>
            </button>
            {(backupTobeClassText !== null || backupTobeSeqText !== null) && (
              <button
                onClick={handleUndoProposed}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-950/40 border border-rose-800 text-rose-300 hover:text-rose-100 hover:bg-rose-900 rounded text-xs font-bold transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Undo Proposed Changes</span>
              </button>
            )}
          </div>
          
          <div className="flex gap-1 border border-borderLine rounded p-1 bg-slate-900">
            <button 
              onClick={() => setZoomScale(s => Math.max(0.5, s - 0.1))} 
              className="p-1 text-slate-400 hover:text-slate-200"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setZoomScale(1)} 
              className="p-1 text-slate-400 hover:text-slate-200 text-[10px] font-bold font-mono px-1.5"
              title="Reset Zoom"
            >
              100%
            </button>
            <button 
              onClick={() => setZoomScale(s => Math.min(2.0, s + 0.1))} 
              className="p-1 text-slate-400 hover:text-slate-200"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Source markup editors (editable) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">
              Class Diagram PlantUML
            </label>
            <textarea
              value={getActiveClassText()}
              onChange={(e) => setActiveClassText(e.target.value)}
              className="w-full h-44 p-3 bg-slate-950 border border-borderLine text-slate-300 font-mono text-[11px] rounded focus:outline-none focus:border-blue-500 transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">
              Sequence Diagram PlantUML
            </label>
            <textarea
              value={getActiveSeqText()}
              onChange={(e) => setActiveSeqText(e.target.value)}
              className="w-full h-44 p-3 bg-slate-950 border border-borderLine text-slate-300 font-mono text-[11px] rounded focus:outline-none focus:border-cyan-500 transition-all resize-none"
            />
          </div>
        </div>

        {/* High resolution SVG viewports */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none">
          <div className="glass rounded-xl border border-borderLine p-4 h-96 flex flex-col justify-between">
            <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-slate-900 pb-2">
              Class Architecture View
            </h4>
            <div className="flex-1 flex items-center justify-center overflow-auto p-4 relative bg-slate-950/20 rounded mt-2">
              {classRenderUrl ? (
                <img
                  src={classRenderUrl}
                  alt="Class Diagram"
                  style={{ transform: `scale(${zoomScale})` }}
                  className="max-h-full max-w-full object-contain transition-transform duration-200"
                />
              ) : (
                <span className="text-xs text-slate-600 italic">Click Render to generate class layout</span>
              )}
            </div>
          </div>

          <div className="glass rounded-xl border border-borderLine p-4 h-96 flex flex-col justify-between">
            <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-slate-900 pb-2">
              Behavioral Sequence View
            </h4>
            <div className="flex-1 flex items-center justify-center overflow-auto p-4 relative bg-slate-950/20 rounded mt-2">
              {sequenceRenderUrl ? (
                <img
                  src={sequenceRenderUrl}
                  alt="Sequence Diagram"
                  style={{ transform: `scale(${zoomScale})` }}
                  className="max-h-full max-w-full object-contain transition-transform duration-200"
                />
              ) : (
                <span className="text-xs text-slate-600 italic">Click Render to generate sequence layout</span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* 3. Right Column: Model Consistency Audit Card */}
      <div className="lg:col-span-1">
        <div className="glass rounded-xl border border-borderLine p-5 sticky top-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
            <Layout className="w-3.5 h-3.5 text-emerald-400" />
            <span>Consistency Audit</span>
          </h3>

          {!auditResult ? (
            <div className="text-center py-10 border border-dashed border-slate-800 rounded-lg">
              <RefreshCw className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-500 max-w-[160px] mx-auto leading-normal">
                Click Audit Consistency above to verify class-behavior mapping.
              </p>
            </div>
          ) : (
            <div className="space-y-4 animate-[fadeIn_0.3s_ease-out]">
              {/* Status Header badge */}
              <div className={`p-3 rounded-lg border flex items-center gap-3 ${
                auditResult.status === 'SUCCESS' 
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' 
                  : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
              }`}>
                {auditResult.status === 'SUCCESS' ? (
                  <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
                )}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    {auditResult.status === 'SUCCESS' ? 'Diagrams Solid' : 'Conflicts Found'}
                  </h4>
                  <span className="text-[10px] opacity-80">
                    Checked {auditResult.scanned_classes} classes, {auditResult.scanned_messages} messages
                  </span>
                </div>
              </div>

              {/* Conflict lists */}
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {auditResult.compromised_blocks.map((conflict, idx) => (
                  <div key={idx} className="p-3 bg-slate-950 border border-slate-900 rounded-lg text-xs leading-normal">
                    <span className="font-bold text-[9px] uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      {conflict.type}
                    </span>
                    <p className="text-slate-300 mt-2 font-mono text-[10px]">{conflict.detail}</p>
                  </div>
                ))}

                {auditResult.compromised_blocks.length === 0 && (
                  <div className="text-center py-6 text-xs text-slate-500 font-medium">
                    No structural/behavioral discrepancies discovered. Models are perfectly consistent!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>

      {/* Post-Sprint Reconciliation Modal overlay */}
      {showReconciliation && reconciliationReport && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="glass border border-borderLine rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-borderLine pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 font-sans">
                <GitCommit className="w-4 h-4 text-purple-400 animate-pulse" />
                <span>Post-Sprint Reconciliation Report</span>
              </h3>
              <button 
                onClick={() => setShowReconciliation(false)}
                className="text-slate-400 hover:text-slate-200 text-xs font-semibold"
              >
                Close
              </button>
            </div>
            
            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              This analyzer maps planned class stereotypes (<code className="text-emerald-400">&lt;&lt;Planned&gt;&gt;</code>) from your To-Be model against actual classes in your active codebase snapshot.
            </p>

            <div className="space-y-3">
              {/* Reconciled list */}
              <div>
                <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 flex items-center gap-1 font-sans">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>Reconciled Classes ({reconciliationReport.reconciled.length})</span>
                </h4>
                {reconciliationReport.reconciled.length > 0 ? (
                  <div className="bg-emerald-950/20 border border-emerald-500/20 rounded p-2 max-h-24 overflow-y-auto space-y-1">
                    {reconciliationReport.reconciled.map(cls => (
                      <div key={cls} className="text-xs text-emerald-400 font-mono flex items-center justify-between">
                        <span>{cls}</span>
                        <span className="text-[9px] uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold text-emerald-300">Coded</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-600 italic font-sans">No planned classes have been implemented yet.</p>
                )}
              </div>

              {/* Pending list */}
              <div>
                <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 flex items-center gap-1 font-sans">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Pending Implementation ({reconciliationReport.pending.length})</span>
                </h4>
                {reconciliationReport.pending.length > 0 ? (
                  <div className="bg-amber-950/20 border border-amber-500/20 rounded p-2 max-h-24 overflow-y-auto space-y-1">
                    {reconciliationReport.pending.map(cls => (
                      <div key={cls} className="text-xs text-amber-400 font-mono flex items-center justify-between">
                        <span>{cls}</span>
                        <span className="text-[9px] uppercase bg-amber-500/10 px-1.5 py-0.5 rounded font-bold text-amber-300">Planned</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-600 italic font-sans">No pending planned classes.</p>
                )}
              </div>
            </div>

            {reconciliationReport.reconciled.length === 0 && reconciliationReport.pending.length === 0 && (
              <div className="bg-slate-900 border border-borderLine rounded p-4 text-center text-xs text-slate-500 font-sans">
                ⚠️ No planned classes (using stereotype <code className="text-slate-400">&lt;&lt;Planned&gt;&gt;</code>) were detected in your To-Be diagrams.
              </div>
            )}

            <div className="text-[10px] text-slate-500 border-t border-borderLine/50 pt-3 flex justify-between items-center font-mono">
              <span>Overall Coverage:</span>
              <span className="font-bold text-slate-300">
                {reconciliationReport.reconciled.length + reconciliationReport.pending.length > 0
                  ? `${Math.round((reconciliationReport.reconciled.length / (reconciliationReport.reconciled.length + reconciliationReport.pending.length)) * 100)}%`
                  : '0%'
                }
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
