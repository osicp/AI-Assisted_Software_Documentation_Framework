import React, { useState, useEffect } from 'react';
import { Code2, Folder, FileCode, Download, CheckCircle, FileText, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { ASTSymbol, UserStory } from '../lib/types';
import axios from 'axios';
import InfoTooltip from './InfoTooltip';

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

  // Helper to extract file extension and clean class/struct names
  const getFileMetadata = (filePath: string) => {
    const filename = filePath.split('/').pop() || 'Service';
    const parts = filename.split('.');
    const ext = parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
    const baseName = parts.join('.');
    
    // Capitalize class name
    const className = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    
    return {
      className: className || 'Service',
      ext,
      filename
    };
  };

  // Dynamic code synthesizers
  const generatePurifiedCode = (filePath: string) => {
    const symbols = groupedFiles[filePath] || [];
    const { className, ext } = getFileMetadata(filePath);
    const isTSorJS = ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx';
    const isPython = ext === 'py';
    const isGo = ext === 'go';

    const lines: string[] = [];

    if (isTSorJS) {
      lines.push(`export class ${className} {`);
    } else if (isPython) {
      lines.push(`class ${className}:`);
    } else if (isGo) {
      lines.push(`package main`);
      lines.push(``);
      lines.push(`type ${className} struct {}`);
      lines.push(``);
    } else {
      // Java / fallback
      lines.push(`package com.enterprise;`);
      lines.push(``);
      lines.push(`public class ${className} {`);
    }

    symbols.forEach(sym => {
      if (sym.kind !== 'class' && sym.name) {
        if (isTSorJS) {
          lines.push(`    public ${sym.name}${sym.signature || '()'} {`);
          lines.push(`        // Purified implementation code stripped under ZDR policy`);
          lines.push(`    }`);
        } else if (isPython) {
          let sig = sym.signature || '()';
          if (sig.startsWith('(')) {
            sig = sig === '()' ? '(self)' : `(self, ${sig.slice(1)}`;
          } else {
            sig = '(self)';
          }
          lines.push(`    def ${sym.name}${sig}:`);
          lines.push(`        # Purified implementation code stripped under ZDR policy`);
          lines.push(`        pass`);
        } else if (isGo) {
          const capitalizedMethodName = sym.name.charAt(0).toUpperCase() + sym.name.slice(1);
          lines.push(`func (c *${className}) ${capitalizedMethodName}${sym.signature || '()'} {`);
          lines.push(`    // Purified implementation code stripped under ZDR policy`);
          lines.push(`}`);
        } else {
          lines.push(`    public void ${sym.name}${sym.signature || '()'} {`);
          lines.push(`        // Purified implementation code stripped under ZDR policy`);
          lines.push(`    }`);
        }
        lines.push(``);
      }
    });

    if (!isPython && !isGo) {
      lines.push(`}`);
    }
    return lines.join('\n');
  };

  const generateAnnotatedCode = (filePath: string) => {
    const symbols = groupedFiles[filePath] || [];
    const { className, ext } = getFileMetadata(filePath);
    const isTSorJS = ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx';
    const isPython = ext === 'py';
    const isGo = ext === 'go';
    
    // Find matching stories if methods correlate
    const matchingStory = userStories.find(story => 
      story.code_pointers && story.code_pointers.some(cp => cp.file.toLowerCase().includes(className.toLowerCase()))
    );

    const lines: string[] = [];

    if (matchingStory) {
      if (isPython) {
        lines.push(`"""`);
        lines.push(`Requirement: ${matchingStory.id}`);
        lines.push(`As a ${matchingStory.role}, I want to ${matchingStory.action} so that ${matchingStory.benefit}`);
        lines.push(`"""`);
      } else {
        lines.push(`/**`);
        lines.push(` * @Requirement ${matchingStory.id}`);
        lines.push(` * As a ${matchingStory.role}, I want to ${matchingStory.action} so that ${matchingStory.benefit}`);
        lines.push(` */`);
      }
    }

    if (isTSorJS) {
      lines.push(`export class ${className} {`);
    } else if (isPython) {
      lines.push(`class ${className}:`);
    } else if (isGo) {
      lines.push(`package main`);
      lines.push(``);
      lines.push(`type ${className} struct {}`);
      lines.push(``);
    } else {
      lines.push(`package com.enterprise;`);
      lines.push(``);
      lines.push(`public class ${className} {`);
    }
    lines.push(``);

    symbols.forEach(sym => {
      if (sym.kind !== 'class' && sym.name) {
        const methodStory = userStories.find(story => 
          story.code_pointers && story.code_pointers.some(cp => 
            cp.file.toLowerCase().includes(className.toLowerCase()) && cp.symbols.includes(sym.name)
          )
        ) || matchingStory;

        if (isTSorJS) {
          if (methodStory) {
            lines.push(`    /**`);
            lines.push(`     * Mapped to requirements check: ${methodStory.id}`);
            lines.push(`     * Acceptance criteria verified: true`);
            lines.push(`     */`);
          }
          lines.push(`    public ${sym.name}${sym.signature || '()'} {`);
          lines.push(`        // TODO: Auto-generated skeletal stub implementation`);
          lines.push(`        console.log("Executing static stub: ${sym.name}");`);
          lines.push(`    }`);
        } else if (isPython) {
          let sig = sym.signature || '()';
          if (sig.startsWith('(')) {
            sig = sig === '()' ? '(self)' : `(self, ${sig.slice(1)}`;
          } else {
            sig = '(self)';
          }
          lines.push(`    def ${sym.name}${sig}:`);
          if (methodStory) {
            lines.push(`        """`);
            lines.push(`        Mapped to requirements check: ${methodStory.id}`);
            lines.push(`        Acceptance criteria verified: true`);
            lines.push(`        """`);
          }
          lines.push(`        # TODO: Auto-generated skeletal stub implementation`);
          lines.push(`        print("Executing static stub: ${sym.name}")`);
        } else if (isGo) {
          const capitalizedMethodName = sym.name.charAt(0).toUpperCase() + sym.name.slice(1);
          if (methodStory) {
            lines.push(`// Mapped to requirements check: ${methodStory.id}`);
            lines.push(`// Acceptance criteria verified: true`);
          }
          lines.push(`func (c *${className}) ${capitalizedMethodName}${sym.signature || '()'} {`);
          lines.push(`    // TODO: Auto-generated skeletal stub implementation`);
          lines.push(`    println("Executing static stub: ${sym.name}")`);
          lines.push(`}`);
        } else {
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
        }
        lines.push(``);
      }
    });

    if (!isPython && !isGo) {
      lines.push(`}`);
    }
    return lines.join('\n');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-[fadeIn_0.5s_ease-out] select-none h-[calc(100vh-12rem)]">
      
      {/* 1. Left Sidebar: Traceability Tree */}
      <div className="relative lg:col-span-1 bg-white border border-sfBorder rounded-xl p-5 flex flex-col justify-between">
        <InfoTooltip text="Browse files and symbols extracted from AST parsing; select one to preview its purified and annotated code." className="absolute top-3 right-3" />
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-sfTextMuted mb-4 flex items-center gap-1.5 border-b border-sfBorder pb-2">
            <Folder className="w-3.5 h-3.5 text-sfBlue" />
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
                        ? 'bg-sfBlue/10 text-sfBlue font-bold border border-sfBlue/20'
                        : 'text-sfTextMuted hover:bg-background hover:text-sfTextPrimary'
                    }`}
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <FileCode className="w-4 h-4 shrink-0 text-sfTextMuted" />
                    <span className="truncate">{filename}</span>
                  </div>

                  {isExpanded && (
                    <div className="pl-6 mt-1 space-y-1 text-[10px] text-sfTextMuted border-l border-sfBorder ml-4 pb-2">
                      {symbols.map((sym, idx) => (
                        <div key={idx} className="flex items-center gap-1 py-1 truncate hover:text-sfTextPrimary cursor-pointer">
                          <Code2 className="w-3 h-3 text-sfTextMuted" />
                          <span>{sym.name}() (line {sym.line})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {filePaths.length === 0 && (
              <div className="text-sfTextMuted italic text-xs py-8 text-center">
                No AST codebase files mapped. Ingest codebase to generate tree.
              </div>
            )}
          </div>
        </div>

        {/* Download Action Button */}
        <button
          onClick={handleDownload}
          disabled={isDownloading || filePaths.length === 0}
          className="flex items-center justify-center gap-2 w-full mt-4 py-2 bg-sfBlue hover:bg-sfBlueHover text-white rounded text-xs font-bold transition-all disabled:opacity-50 shadow-sm"
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
      <div className="lg:col-span-3 flex flex-col h-full bg-white border border-sfBorder rounded-xl overflow-hidden">

        {/* Diff Viewer Title header */}
        <div className="bg-background px-5 py-3 border-b border-sfBorder flex items-center justify-between font-mono text-[10px] text-sfTextMuted">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-sfBlue" />
            <span className="text-sfTextPrimary font-semibold">{selectedFile || 'No file selected'}</span>
          </div>
          <div>Unified Diff View Mode</div>
        </div>

        {/* Diff view grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-sfBorder overflow-hidden font-mono text-[11px] leading-relaxed">
          {/* Left panel: Purified source code */}
          <div className="flex flex-col h-full overflow-hidden">
            <div className="bg-background px-4 py-1.5 text-[9px] uppercase tracking-wider text-sfTextMuted border-b border-sfBorder flex items-center justify-between">
              <span>Purified Source (ZDR Compliance)</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sfError font-bold bg-sfErrorBg px-2 py-0.5 rounded border border-sfError/20 uppercase">comments stripped</span>
                <InfoTooltip text="Shows source code with implementation comments stripped out to satisfy Zero Data Retention compliance requirements." />
              </div>
            </div>
            <pre className="flex-1 p-4 overflow-auto text-sfTextMuted bg-background">
              <code>{selectedFile ? generatePurifiedCode(selectedFile) : '// Select a file in the tree to preview'}</code>
            </pre>
          </div>

          {/* Right panel: Annotated code blocks */}
          <div className="flex flex-col h-full overflow-hidden bg-white">
            <div className="bg-background px-4 py-1.5 text-[9px] uppercase tracking-wider text-sfTextMuted border-b border-sfBorder flex items-center justify-between">
              <span>Annotated Skeletal Stubs</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sfSuccess font-bold bg-sfSuccessBg px-2 py-0.5 rounded border border-sfSuccess/20 uppercase">Javadocs injected</span>
                <InfoTooltip text="Shows skeletal method stubs with Javadoc comments auto-generated from linked user stories and acceptance criteria." />
              </div>
            </div>
            <pre className="flex-1 p-4 overflow-auto text-sfTextPrimary bg-background">
              <code>{selectedFile ? generateAnnotatedCode(selectedFile) : '// Select a file in the tree to preview'}</code>
            </pre>
          </div>
        </div>

      </div>

    </div>
  );
}
