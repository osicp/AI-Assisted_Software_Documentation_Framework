import React, { useState, useEffect } from 'react';
import { Layout, CheckCircle, AlertTriangle, Play, RefreshCw, ZoomIn, ZoomOut, Maximize2, Layers, GitCommit, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { ASTSymbol } from '../lib/types';

interface UMLCanvasProps {
  astSymbols?: ASTSymbol[];
  setClassDiagramUrl?: (url: string | null) => void;
}

export default function UMLCanvas({ astSymbols = [], setClassDiagramUrl }: UMLCanvasProps) {
  // Editable text diagrams
  const [classDiagramText, setClassDiagramText] = useState('');
  const [sequenceDiagramText, setSequenceDiagramText] = useState('');

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

  // Auto-generate class diagram on mount/symbols change
  useEffect(() => {
    if (astSymbols && astSymbols.length > 0) {
      const generatedClass = generateClassDiagramMarkup(astSymbols);
      setClassDiagramText(generatedClass);
      
      // Seed a default sequence diagram containing discovered classes for testing
      const classNames = Array.from(new Set(astSymbols.filter(s => s.kind === 'class').map(s => s.name)));
      const defaultSequence = generateDefaultSequenceMarkup(classNames);
      setSequenceDiagramText(defaultSequence);
    } else {
      // Offline fallback defaults
      setClassDiagramText(
        "@startuml\nclass OrderService {\n  +processOrder(id)\n  +cancelOrder()\n}\nclass PaymentProcessor {\n  +authorizePayment(token)\n}\n@enduml"
      );
      setSequenceDiagramText(
        "@startuml\nactor User\nUser -> OrderService : processOrder(101)\nOrderService -> PaymentProcessor : authorizePayment(\"tkn_val\")\n@enduml"
      );
    }
  }, [astSymbols]);

  const generateClassDiagramMarkup = (symbols: ASTSymbol[]): string => {
    const classes: { [key: string]: { methods: string[]; filename: string } } = {};
    
    symbols.forEach(sym => {
      const path = sym.path || "";
      const filename = path.split('/').pop() || "Codebase";
      const scope = sym.scope;
      const name = sym.name;
      const kind = sym.kind;
      
      if (kind === 'class') {
        classes[name] = { methods: [], filename };
      } else if (['method', 'member', 'function'].includes(kind) && scope) {
        if (!classes[scope]) {
          classes[scope] = { methods: [], filename };
        }
        const sig = sym.signature || "()";
        classes[scope].methods.push(`+${name}${sig}`);
      }
    });
    
    const lines = ["@startuml", "skinparam classAttributeIconSize 0"];
    Object.entries(classes).forEach(([cName, cData]) => {
      lines.push(`class ${cName} << ${cData.filename} >> {`);
      cData.methods.forEach(m => lines.push(`  ${m}`));
      lines.push("}");
    });
    lines.push("@enduml");
    return lines.join('\n');
  };

  const generateDefaultSequenceMarkup = (classNames: string[]): string => {
    const lines = ["@startuml", "actor User"];
    if (classNames.length > 0) {
      lines.push(`User -> ${classNames[0]} : initializeCall()`);
      for (let i = 0; i < classNames.length - 1; i++) {
        lines.push(`${classNames[i]} -> ${classNames[i+1]} : delegateOperation()`);
      }
    } else {
      lines.push("User -> Controller : executeRequest()");
    }
    lines.push("@enduml");
    return lines.join('\n');
  };

  const handleRender = async () => {
    setIsRendering(true);
    setAuditResult(null);
    try {
      const classRes = await api.renderUml(classDiagramText);
      setClassRenderUrl(classRes.render_url);
      if (setClassDiagramUrl) {
        setClassDiagramUrl(classRes.render_url);
      }

      const seqRes = await api.renderUml(sequenceDiagramText);
      setSequenceRenderUrl(seqRes.render_url);
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
      const res = await api.verifyUml(classDiagramText, sequenceDiagramText);
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
    const classBlocks = Array.from(classDiagramText.matchAll(/(?:class|interface)\s+(\w+)(?:\s+<<[\s\S]*?>>)?\s*(?:\{([\s\S]*?)\})?/g));
    return classBlocks.map(block => {
      const className = block[1];
      const content = block[2] || "";
      const methods = Array.from(content.matchAll(/(?:[+\-#~]?\s*)(\w+)\s*\(/g)).map(m => m[1]);
      return { className, methods };
    });
  };

  const parseSequenceTrace = () => {
    return Array.from(sequenceDiagramText.matchAll(/(\w+)\s*-(?:-)?(?:>|x)\s*(\w+)\s*:\s*(.*)/g)).map(arrow => ({
      sender: arrow[1],
      receiver: arrow[2],
      message: arrow[3]
    }));
  };

  const classTree = parseClassTree();
  const sequenceTrace = parseSequenceTrace();

  return (
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
              value={classDiagramText}
              onChange={(e) => setClassDiagramText(e.target.value)}
              className="w-full h-44 p-3 bg-slate-950 border border-borderLine text-slate-300 font-mono text-[11px] rounded focus:outline-none focus:border-blue-500 transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">
              Sequence Diagram PlantUML
            </label>
            <textarea
              value={sequenceDiagramText}
              onChange={(e) => setSequenceDiagramText(e.target.value)}
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
  );
}
