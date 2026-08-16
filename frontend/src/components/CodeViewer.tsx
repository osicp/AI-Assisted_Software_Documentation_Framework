import React, { useState, useEffect } from 'react';
import { Code2, Folder, FileCode, Download, CheckCircle, FileText, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { ASTSymbol, UserStory } from '../lib/types';
import axios from 'axios';

interface CodeViewerProps {
  astSymbols?: ASTSymbol[];
  userStories?: UserStory[];
}

interface GroupedFiles {
  [filePath: string]: ASTSymbol[];
}

export default function CodeViewer({ astSymbols = [], userStories = [] }: CodeViewerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<{ [path: string]: boolean }>({});
  const [isDownloading, setIsDownloading] = useState(false);

  // Group AST symbols by file path
  const getGroupedFiles = (): GroupedFiles => {
    const grouped: GroupedFiles = {};
    astSymbols.forEach(sym => {
      const path = sym.path || "src/main/java/com/enterprise/Unnamed.java";
      if (!grouped[path]) {
        grouped[path] = [];
      }
      grouped[path].push(sym);
    });
    return grouped;
  };

  const groupedFiles = getGroupedFiles();
  const filePaths = Object.keys(groupedFiles);

  useEffect(() => {
    if (filePaths.length > 0 && !selectedFile) {
      setSelectedFile(filePaths[0]);
    }
  }, [astSymbols]);

  const toggleNode = (path: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/project/stubs/download`,
        {
          ast_symbols: astSymbols,
          user_stories: userStories
        },
        {
          responseType: 'blob'
        }
      );
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "scrummap_purified_skeleton.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Stub download failed", err);
      alert("Failed to download stubs project archive.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Dynamic code synthesizers
  const generatePurifiedCode = (filePath: string) => {
    const symbols = groupedFiles[filePath] || [];
    const className = filePath.split('/').pop()?.replace('.java', '') || 'Service';
    const lines = [
      `package com.enterprise;`,
      ``,
      `public class ${className} {`
    ];

    symbols.forEach(sym => {
      if (sym.kind !== 'class' && sym.name) {
        lines.push(`    public void ${sym.name}${sym.signature || '()'} {`);
        lines.push(`        // Purified implementation code stripped under ZDR policy`);
        lines.push(`    }`);
        lines.push(``);
      }
    });

    lines.push(`}`);
    return lines.join('\n');
  };

  const generateAnnotatedCode = (filePath: string) => {
    const symbols = groupedFiles[filePath] || [];
    const className = filePath.split('/').pop()?.replace('.java', '') || 'Service';
    
    // Find matching stories if methods correlate
    const matchingStory = userStories.find(story => 
      story.code_pointers && story.code_pointers.some(cp => cp.file.includes(className))
    );

    const lines = [
      `package com.enterprise;`,
      ``
    ];

    if (matchingStory) {
      lines.push(`/**`);
      lines.push(` * @Requirement ${matchingStory.id}`);
      lines.push(` * As a ${matchingStory.role}, I want to ${matchingStory.action} so that ${matchingStory.benefit}`);
      lines.push(` */`);
    }

    lines.push(`public class ${className} {`);
    lines.push(``);

    symbols.forEach(sym => {
      if (sym.kind !== 'class' && sym.name) {
        const methodStory = userStories.find(story => 
          story.code_pointers && story.code_pointers.some(cp => 
            cp.file.includes(className) && cp.symbols.includes(sym.name)
          )
        ) || matchingStory;

        if (methodStory) {
          lines.push(`    /**`);
          lines.push(`     * Mapped to requirements check: ${methodStory.id}`);
          lines.push(`     * Acceptance criteria verified: true`);
          lines.push(`     */`);
        }
        lines.push(`    public void ${sym.name}${sym.signature || '()'} {`);
        lines.push(`        // TODO: Auto-generated skeletal stub implementation`);
        lines.push(`        System.out.println("Executing static stub: ${sym.name}");`);
        lines.push(`    }`);
        lines.push(``);
      }
    });

    lines.push(`}`);
    return lines.join('\n');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-[fadeIn_0.5s_ease-out] select-none h-[calc(100vh-12rem)]">
      
      {/* 1. Left Sidebar: Traceability Tree */}
      <div className="lg:col-span-1 bg-slate-950/40 border border-borderLine rounded-xl p-5 flex flex-col justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5 border-b border-slate-900 pb-2">
            <Folder className="w-3.5 h-3.5 text-blue-400" />
            <span>Traceability Tree</span>
          </h3>

          <div className="space-y-1 overflow-y-auto max-h-[350px] pr-1">
            {filePaths.map((path) => {
              const filename = path.split('/').pop() || 'Unnamed';
              const symbols = groupedFiles[path] || [];
              const isSelected = selectedFile === path;
              const isExpanded = expandedNodes[path];

              return (
                <div key={path} className="text-xs font-mono">
                  <div 
                    onClick={() => {
                      setSelectedFile(path);
                      toggleNode(path);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-blue-600/10 text-blue-400 font-bold border border-blue-500/20' 
                        : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                    }`}
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <FileCode className="w-4 h-4 shrink-0 text-slate-500" />
                    <span className="truncate">{filename}</span>
                  </div>

                  {isExpanded && (
                    <div className="pl-6 mt-1 space-y-1 text-[10px] text-slate-500 border-l border-slate-900 ml-4 pb-2">
                      {symbols.map((sym, idx) => (
                        <div key={idx} className="flex items-center gap-1 py-1 truncate hover:text-slate-300 cursor-pointer">
                          <Code2 className="w-3 h-3 text-slate-600" />
                          <span>{sym.name}() (line {sym.line})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {filePaths.length === 0 && (
              <div className="text-slate-600 italic text-xs py-8 text-center">
                No AST codebase files mapped. Ingest codebase to generate tree.
              </div>
            )}
          </div>
        </div>

        {/* Download Action Button */}
        <button
          onClick={handleDownload}
          disabled={isDownloading || filePaths.length === 0}
          className="flex items-center justify-center gap-2 w-full mt-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-blue-600/15"
        >
          {isDownloading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          <span>Download Project Stubs</span>
        </button>
      </div>

      {/* 2. Right: Side-by-side Unified Diff Viewer */}
      <div className="lg:col-span-3 flex flex-col h-full bg-slate-950/20 border border-borderLine rounded-xl overflow-hidden">
        
        {/* Diff Viewer Title header */}
        <div className="bg-slate-950/60 px-5 py-3 border-b border-borderLine flex items-center justify-between font-mono text-[10px] text-slate-500">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-slate-300 font-semibold">{selectedFile || 'No file selected'}</span>
          </div>
          <div>Unified Diff View Mode</div>
        </div>

        {/* Diff view grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-900 overflow-hidden font-mono text-[11px] leading-relaxed">
          {/* Left panel: Purified source code */}
          <div className="flex flex-col h-full overflow-hidden">
            <div className="bg-slate-950/40 px-4 py-1.5 text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-900/60 flex items-center justify-between">
              <span>Purified Source (ZDR Compliance)</span>
              <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/15 uppercase">comments stripped</span>
            </div>
            <pre className="flex-1 p-4 overflow-auto text-slate-400 bg-slate-950/30">
              <code>{selectedFile ? generatePurifiedCode(selectedFile) : '// Select a file in the tree to preview'}</code>
            </pre>
          </div>

          {/* Right panel: Annotated code blocks */}
          <div className="flex flex-col h-full overflow-hidden bg-slate-950/5">
            <div className="bg-slate-950/40 px-4 py-1.5 text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-900/60 flex items-center justify-between">
              <span>Annotated Skeletal Stubs</span>
              <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/15 uppercase">Javadocs injected</span>
            </div>
            <pre className="flex-1 p-4 overflow-auto text-slate-300 bg-slate-950/10">
              <code>{selectedFile ? generateAnnotatedCode(selectedFile) : '// Select a file in the tree to preview'}</code>
            </pre>
          </div>
        </div>

      </div>

    </div>
  );
}
