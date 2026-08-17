import React, { useState } from 'react';
import { 
  Kanban, 
  Plus, 
  Calendar, 
  Terminal, 
  FileText, 
  Play, 
  Loader2, 
  ArrowRight, 
  ShieldCheck, 
  AlertTriangle,
  FileUp,
  Trash2
} from 'lucide-react';
import { api } from '../lib/api';
import { ASTSymbol, UserStory, AuditReport } from '../lib/types';

interface EpicBoardProps {
  projectId?: string;
  projectName?: string;
  projectDescription?: string;
  astSymbols?: ASTSymbol[];
  userStories: UserStory[];
  setUserStories: (stories: UserStory[]) => void;
  classDiagramUrl: string | null;
  sequenceDiagramUrl?: string | null;
}

interface KanbanColumns {
  [key: string]: UserStory[];
}

export default function EpicBoard({
  projectId,
  projectName = "Default Project",
  projectDescription = "",
  astSymbols = [],
  userStories,
  setUserStories,
  classDiagramUrl,
  sequenceDiagramUrl
 }: EpicBoardProps) {
  const [sprintGoal, setSprintGoal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompilingPdf, setIsCompilingPdf] = useState(false);
  const [includeTimelineInPdf, setIncludeTimelineInPdf] = useState(false);

  // Requirements document ingestion states
  const [showReqUpload, setShowReqUpload] = useState(false);
  const [reqDocText, setReqDocText] = useState('');
  const [reqDocFileName, setReqDocFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Kanban column placements (Todo, In Progress, Testing, Done)
  // We maintain a map of story IDs to columns locally
  const [storyColumns, setStoryColumns] = useState<{ [id: string]: string }>({});

  // Ledger verify terminal state
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isRunningAudit, setIsRunningAudit] = useState(false);

  // Parse columns
  const getKanbanData = (): KanbanColumns => {
    const cols: KanbanColumns = {
      todo: [],
      in_progress: [],
      testing: [],
      done: []
    };

    if (Array.isArray(userStories)) {
      userStories.forEach(story => {
        if (story && story.id) {
          const colId = storyColumns[story.id] || 'todo';
          if (cols[colId]) {
            cols[colId].push(story);
          } else {
            cols['todo'].push(story);
          }
        }
      });
    }

    return cols;
  };

  const moveStory = (storyId: string, targetCol: string) => {
    setStoryColumns(prev => ({
      ...prev,
      [storyId]: targetCol
    }));
  };

  const handleFileSelection = (file: File) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'txt' && extension !== 'md') {
      alert("Invalid file format. Please upload only plain text (.txt) or Markdown (.md) documents.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setReqDocText(text);
      setReqDocFileName(file.name);
    };
    reader.readAsText(file);
  };

  const handleGenerateBacklog = async () => {
    if (!projectId) {
      alert("Please select or create a project first.");
      return;
    }
    
    const goalText = sprintGoal.trim();
    const reqText = reqDocText.trim();
    
    if (!goalText && !reqText) {
      alert("Please enter a Sprint Goal or upload a requirements file before generating the backlog.");
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await api.generateBacklog(
        projectId,
        goalText || "ScrumMap Sprint backlog compilation",
        astSymbols,
        reqText || undefined
      ) as any;
      
      let stories: UserStory[] = [];
      if (res) {
        if (Array.isArray(res.user_stories)) {
          stories = res.user_stories;
        } else if (Array.isArray(res.epics)) {
          res.epics.forEach((epic: any) => {
            if (epic && Array.isArray(epic.user_stories)) {
              const epicTitle = epic.title || "Core Epic";
              epic.user_stories.forEach((story: any) => {
                if (story) {
                  story.epic_title = story.epic_title || epicTitle;
                }
              });
              stories = stories.concat(epic.user_stories);
            }
          });
        } else if (Array.isArray(res)) {
          stories = res;
        }
      }

      setUserStories(stories);
      
      const newCols: { [id: string]: string } = {};
      stories.forEach(s => {
        if (s && s.id) {
          newCols[s.id] = 'todo';
        }
      });
      setStoryColumns(newCols);
      
      setTerminalLogs(prev => [
        ...prev,
        `[${new Date().toISOString()}] BACKLOG GENERATED: Loaded ${stories.length} sprint user stories.`
      ]);
    } catch (e: any) {
      console.error(e);
      alert("Failed to generate sprint backlog: " + (e.response?.data?.detail || e.message));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompilePdf = async () => {
    if (userStories.length === 0) {
      alert("No user stories available to compile into a report.");
      return;
    }
    setIsCompilingPdf(true);
    try {
      const blob = await api.downloadPdfReport(
        projectName,
        projectDescription,
        userStories,
        classDiagramUrl || '',
        sequenceDiagramUrl || '',
        projectId,
        includeTimelineInPdf
      );
      
      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scrummap_${projectName.toLowerCase().replace(/\s+/g, '_')}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      alert("PDF compilation failed.");
    } finally {
      setIsCompilingPdf(false);
    }
  };

  const runLedgerAudit = async () => {
    setIsRunningAudit(true);
    setTerminalLogs(prev => [...prev, `[system@scrummap-workstation]$ python3 backend/ledger_verifier.py verify`]);
    try {
      const res = await api.verifyLedger(1);
      
      setTerminalLogs(prev => [
        ...prev,
        `Analyzing write-ahead relational transaction chains...`,
        `Checked ${res.scanned_blocks} transaction blocks.`,
        `Last verified Block ID: ${res.last_verified_id || 'N/A'}`,
        `Signature check validation: ${res.ledger_integrity === 'OK' ? 'PASSED (Chains intact)' : 'FAILED (Tampering detected)'}`,
        `Audit result status code: ${res.ledger_integrity === 'OK' ? 'SUCCESS' : 'COMPROMISED'}`
      ]);
    } catch (e: any) {
      setTerminalLogs(prev => [...prev, `Audit Execution Error: ${e.message}`]);
    } finally {
      setIsRunningAudit(false);
    }
  };

  const columns = getKanbanData();

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] select-none">
      
      {/* 1. Header options & generator inputs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sprint Goal Ingestion */}
        <div className="lg:col-span-2 glass rounded-xl p-5 border border-borderLine">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Kanban className="w-3.5 h-3.5 text-blue-400" />
              <span>Sprint Goal Configuration</span>
            </h3>
            <button
              onClick={() => setShowReqUpload(!showReqUpload)}
              className={`flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase font-bold rounded transition-all border ${
                showReqUpload 
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' 
                  : 'bg-slate-800 text-slate-400 border-borderLine hover:text-slate-300'
              }`}
            >
              <FileUp className="w-3 h-3" />
              <span>{showReqUpload ? 'Hide Upload' : 'Requirements File'}</span>
            </button>
          </div>
          <div className="flex gap-4">
            <input
              type="text"
              value={sprintGoal}
              onChange={(e) => setSprintGoal(e.target.value)}
              placeholder="Enter sprint goal description..."
              className="flex-1 px-3 py-2 bg-slate-900 border border-borderLine text-slate-300 text-xs rounded focus:outline-none focus:border-blue-500 transition-all"
            />
            <button
              onClick={handleGenerateBacklog}
              disabled={isGenerating || astSymbols.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-all disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>Generate Backlog</span>
            </button>
          </div>
          {astSymbols.length === 0 && (
            <p className="text-[10px] text-amber-400 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span>Please ingest a codebase ZIP in Ingestion Hub to enable backlog generation from AST symbols.</span>
            </p>
          )}

          {showReqUpload && (
            <div className="mt-4 border-t border-borderLine/50 pt-4 animate-[fadeIn_0.3s_ease-out]">
              {!reqDocText ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    handleFileSelection(file);
                  }}
                  className={`border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center cursor-pointer transition-all ${
                    isDragging 
                      ? 'border-blue-500 bg-blue-500/5' 
                      : 'border-borderLine hover:border-slate-500 hover:bg-slate-900/50'
                  }`}
                  onClick={() => document.getElementById('req-file-input')?.click()}
                >
                  <input
                    id="req-file-input"
                    type="file"
                    accept=".txt,.md"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelection(file);
                    }}
                  />
                  <FileUp className={`w-8 h-8 mb-2 ${isDragging ? 'text-blue-400 animate-bounce' : 'text-slate-500'}`} />
                  <span className="text-xs font-semibold text-slate-300 text-center">
                    Drag & drop your requirements file here, or <span className="text-blue-400 underline">browse</span>
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">Accepts only .md or .txt files</span>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-slate-900/80 border border-borderLine rounded p-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="font-semibold text-slate-200 block truncate max-w-xs">{reqDocFileName}</span>
                      <span className="text-[10px] text-slate-500">{(reqDocText.length / 1024).toFixed(1)} KB loaded</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setReqDocText('');
                      setReqDocFileName('');
                    }}
                    className="p-1 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded transition-all"
                    title="Remove requirements document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action button Panel */}
        <div className="lg:col-span-1 glass rounded-xl p-5 border border-borderLine flex flex-col justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Governance Report Compiler
          </h3>
          <p className="text-[10px] text-slate-500 leading-normal mb-3">
            Click compile to write requirements, trace code, and embed architecture class diagram URLs into a governance-signed PDF document.
          </p>
          <button
            onClick={handleCompilePdf}
            disabled={isCompilingPdf || userStories.length === 0}
            className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-all disabled:opacity-50"
          >
            {isCompilingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            <span>Compile PDF Report</span>
          </button>
        </div>

      </div>

      {/* 2. Interactive Kanban board grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(columns).map(([colId, stories]) => {
          const colLabel = colId.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
          
          return (
            <div key={colId} className="bg-slate-950/40 border border-borderLine rounded-xl p-4 min-h-[350px] flex flex-col">
              <div className="flex justify-between items-center border-b border-slate-900 pb-2 mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{colLabel}</h4>
                <span className="text-[10px] bg-slate-900 border border-borderLine text-slate-400 px-2 py-0.5 rounded-full font-bold">
                  {stories.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[450px] pr-1">
                {stories.map((story) => (
                  <div 
                    key={story.id} 
                    className="p-3 bg-slate-900/60 border border-borderLine rounded-lg hover:border-slate-700 transition-all select-none space-y-2"
                  >
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[9px] font-bold bg-blue-600/15 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-mono">
                        {story.id}
                      </span>
                      <span className="text-[9px] font-bold bg-slate-950 border border-borderLine text-slate-400 px-1.5 py-0.5 rounded">
                        {story.story_points} SP
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 leading-normal font-sans">
                      <strong className="text-slate-400 font-normal">As a</strong> {story.role}, <strong className="text-slate-400 font-normal">I want to</strong> {story.action} <strong className="text-slate-400 font-normal">so that</strong> {story.benefit}
                    </p>

                    {/* Traceability files */}
                    {story.code_pointers && story.code_pointers.length > 0 && (
                      <div className="text-[9px] text-slate-500 border-t border-slate-900/50 pt-2 font-mono truncate" title={story.code_pointers[0].file}>
                        Pointers: {story.code_pointers[0].file.split('/').pop()}:{story.code_pointers[0].lines}
                      </div>
                    )}

                    {/* Move controls (interactive) */}
                    <div className="flex justify-end gap-1 pt-1">
                      {colId !== 'todo' && (
                        <button 
                          onClick={() => moveStory(story.id, colId === 'done' ? 'testing' : colId === 'testing' ? 'in_progress' : 'todo')}
                          className="text-[9px] bg-slate-950 hover:bg-slate-900 border border-borderLine text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded"
                        >
                          ◀
                        </button>
                      )}
                      {colId !== 'done' && (
                        <button 
                          onClick={() => moveStory(story.id, colId === 'todo' ? 'in_progress' : colId === 'in_progress' ? 'testing' : 'done')}
                          className="text-[9px] bg-slate-950 hover:bg-slate-900 border border-borderLine text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded"
                        >
                          ▶
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {stories.length === 0 && (
                  <div className="text-center py-10 text-[10px] text-slate-600 italic border border-dashed border-slate-900 rounded-lg">
                    No items placed.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Bottom panels: Gantt chart & Ledger terminal logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Interactive Gantt Timeline map */}
        <div className="lg:col-span-2 glass rounded-xl p-5 border border-borderLine">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Agile Gantt Timeline Schedulers</span>
            </h3>
            <label className="flex items-center gap-2 text-[10px] text-slate-400 uppercase font-bold cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={includeTimelineInPdf} 
                onChange={(e) => setIncludeTimelineInPdf(e.target.checked)} 
                className="rounded bg-slate-900 border-borderLine text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5"
              />
              <span>Include Milestones in PDF</span>
            </label>
          </div>
          <div className="space-y-4 pt-2">
            {(() => {
              let devATime = 0;
              let devBTime = 0;
              const totalDays = 10;
              
              return Array.isArray(userStories) && userStories.map((story, index) => {
                const sp = story.story_points || 3.0;
                
                let durationDays = 2;
                if (sp <= 1) durationDays = 1;
                else if (sp <= 2) durationDays = 1.5;
                else if (sp <= 3) durationDays = 2;
                else if (sp <= 5) durationDays = 3;
                else durationDays = 5;
                
                let startDay = 0;
                if (index % 2 === 0) {
                  startDay = devATime;
                  devATime = Math.min(totalDays, devATime + durationDays);
                } else {
                  startDay = devBTime;
                  devBTime = Math.min(totalDays, devBTime + durationDays);
                }
                
                if (startDay + durationDays > totalDays) {
                  durationDays = Math.max(1, totalDays - startDay);
                }
                
                const startOffset = `${(startDay / totalDays) * 100}%`;
                const durationWidth = `${(durationDays / totalDays) * 100}%`;
                const weekNum = startDay < 5 ? 1 : 2;
                const endDayVal = Math.min(totalDays, startDay + durationDays);
                
                const getTargetName = (story: any) => {
                  // Try to find backticks in action/title first
                  const actionStr = story.action || '';
                  const match = actionStr.match(/`([^`]+)`/);
                  if (match && match[1]) {
                    return match[1];
                  }
                  
                  // Try to resolve from code pointers filename
                  if (story.code_pointers && story.code_pointers.length > 0) {
                    const file = story.code_pointers[0].file || '';
                    const parts = file.split('/');
                    const filename = parts[parts.length - 1];
                    if (filename) {
                      return filename.replace('.java', '');
                    }
                  }
                  
                  // Clean standard action prefixes
                  let cleanAction = actionStr.replace(/^(implement a new |implement a |dispatch |handle |manage |manage connection |throwing a specific |using a cached state |dispatch transaction outcomes via a )/i, '');
                  const words = cleanAction.split(' ');
                  return words.slice(0, 2).join(' ');
                };
                
                const targetName = getTargetName(story);
                
                return (
                  <div key={story.id} className="flex items-center gap-4 text-xs font-mono select-none">
                    <span className="w-16 text-slate-500">{story.id}</span>
                    <div className="flex-1 bg-slate-900 h-6 rounded border border-slate-800 relative">
                      <div 
                        style={{ left: startOffset, width: durationWidth }}
                        className="absolute top-1 bottom-1 bg-gradient-to-r from-blue-600/80 to-cyan-500/80 rounded border border-blue-500/30 flex items-center px-2 text-[8px] font-sans text-white truncate font-bold shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                      >
                        Sprint W{weekNum} (Day {Math.floor(startDay) + 1}-{Math.ceil(endDayVal)}) '{targetName}'
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
            
            {userStories.length === 0 && (
              <div className="text-center py-6 text-xs text-slate-600 italic">
                Generate sprint backlog user stories to populate the Gantt schedule.
              </div>
            )}
          </div>
        </div>

        {/* Ledger Terminal check log console */}
        <div className="lg:col-span-1 glass rounded-xl p-5 border border-borderLine flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-rose-500" />
              <span>Relational Ledger Auditor</span>
            </h3>
            <p className="text-[10px] text-slate-500 leading-normal mb-3">
              Trigger a cryptographic signature verify scan on the SQLite transaction ledger table.
            </p>

            {/* Terminal Screen */}
            <div className="w-full bg-black border border-slate-900 rounded p-3 h-44 overflow-y-auto font-mono text-[9px] text-emerald-400 space-y-1.5 select-text">
              {terminalLogs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">{log}</div>
              ))}
              {terminalLogs.length === 0 && (
                <div className="text-slate-600 italic">Terminal ready. Click audit to verify database chains...</div>
              )}
            </div>
          </div>

          <button
            onClick={runLedgerAudit}
            disabled={isRunningAudit}
            className="flex items-center justify-center gap-2 w-full mt-4 py-1.5 bg-slate-900 border border-borderLine hover:bg-slate-800 text-slate-300 hover:text-slate-100 rounded text-xs font-bold transition-all disabled:opacity-50"
          >
            {isRunningAudit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
            <span>Run Integrity Scan</span>
          </button>
        </div>

      </div>

    </div>
  );
}
