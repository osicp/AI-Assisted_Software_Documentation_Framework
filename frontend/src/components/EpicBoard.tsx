import React, { useState, useEffect } from 'react';
import { 
  Kanban, 
  Plus, 
  Calendar, 
  FileText, 
  Play, 
  Loader2, 
  ArrowRight, 
  AlertTriangle,
  FileUp,
  Trash2,
  FileSpreadsheet
} from 'lucide-react';
import { api } from '../lib/api';
import { ASTSymbol, UserStory, AuditReport, Developer } from '../lib/types';
import { sanitizeIdentifier } from '../lib/uml_helpers';
import InfoTooltip from './InfoTooltip';

interface EpicBoardProps {
  projectId?: string;
  projectName?: string;
  projectDescription?: string;
  astSymbols?: ASTSymbol[];
  userStories: UserStory[];
  setUserStories: (stories: UserStory[]) => void;
  classDiagramUrl: string | null;
  sequenceDiagramUrl?: string | null;
  tobeClassText?: string;
  setTobeClassText?: (val: string) => void;
  tobeSeqText?: string;
  setTobeSeqText?: (val: string) => void;
  setBackupTobeClassText?: (val: string | null) => void;
  setBackupTobeSeqText?: (val: string | null) => void;
  developers?: Developer[];
  loadBacklog?: () => void;
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
  sequenceDiagramUrl,
  tobeClassText = '',
  setTobeClassText,
  tobeSeqText = '',
  setTobeSeqText,
  setBackupTobeClassText,
  setBackupTobeSeqText,
  developers = [],
  loadBacklog
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

  // Sync Kanban columns with localStorage using projectId to prevent cross-project ID collisions
  useEffect(() => {
    if (projectId) {
      const saved = localStorage.getItem(`scrummap_cols_${projectId}`);
      if (saved) {
        try {
          setStoryColumns(JSON.parse(saved));
          return;
        } catch (e) {
          console.error("Failed to parse saved columns from localStorage:", e);
        }
      }
    }
    setStoryColumns({});
  }, [projectId]);



  // Multi-developer assignment open state
  const [openAssigneeStoryId, setOpenAssigneeStoryId] = useState<string | null>(null);

  // Close assignees popover when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setOpenAssigneeStoryId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  // Clarification questions for ambiguity resolution
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<{ [key: string]: string }>({});

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
    setStoryColumns(prev => {
      const updated = {
        ...prev,
        [storyId]: targetCol
      };
      if (projectId) {
        localStorage.setItem(`scrummap_cols_${projectId}`, JSON.stringify(updated));
      }
      return updated;
    });
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
    
    let finalGoal = goalText;
    if (!finalGoal && reqText) {
      // Extract the first line of the requirements document, strip MD headers, and limit length to 80 chars
      const firstLine = reqText.split('\n')[0].replace(/^[#*\s-]+/, '').trim();
      finalGoal = firstLine.substring(0, 80) || "Sprint backlog compiled from requirements";
    }
    
    setIsGenerating(true);
    try {
      const res = await api.generateBacklog(
        projectId,
        finalGoal || "ScrumMap Sprint backlog compilation",
        astSymbols,
        reqText || undefined,
        clarificationQuestions.length > 0 ? clarificationAnswers : undefined
      ) as any;
      
      if (res && res.status === "CLARIFICATION_NEEDED") {
        setClarificationQuestions(res.questions || []);
        setIsGenerating(false);
        return;
      }

      // Clear questions on success
      setClarificationQuestions([]);
      setClarificationAnswers({});

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
      
      // If sequence_flow is returned from LLM, construct the To-Be Sequence Diagram!
      const seqParticipants = new Set<string>();
      if (res.sequence_flow && Array.isArray(res.sequence_flow) && res.sequence_flow.length > 0) {
        if (setBackupTobeSeqText) setBackupTobeSeqText(tobeSeqText);
        const seqLines = ["@startuml"];
        res.sequence_flow.forEach((step: any) => {
          const s = sanitizeIdentifier((step.sender || "User").trim().replace(/^[+\-#~]+/g, ""));
          const r = sanitizeIdentifier((step.receiver || "Server").trim().replace(/^[+\-#~]+/g, ""));
          const m = step.message || "call()";
          seqLines.push(`  ${s} -> ${r} : ${m}`);
          
          if (s !== "User" && s !== "Server" && s !== "Client") seqParticipants.add(s);
          if (r !== "User" && r !== "Server" && r !== "Client") seqParticipants.add(r);
        });
        seqLines.push("@enduml");
        if (setTobeSeqText) {
          setTobeSeqText(seqLines.join('\n'));
        }
      }
      
      // Programmatically update the To-Be class and sequence diagrams with backlog proposed elements
      if (stories.length > 0) {
        const existingClassNames = new Set(
          astSymbols.filter(sym => sym.kind === 'class').map(sym => sanitizeIdentifier(sym.name))
        );
        const proposedClasses = new Set<string>();
        
        // Auto-reconcile sequence flow participants as planned classes
        seqParticipants.forEach(p => {
          if (!existingClassNames.has(p)) {
            proposedClasses.add(p);
          }
        });
        
        stories.forEach(story => {
          const actionStr = story.action || '';
          const match = actionStr.match(/`([^`]+)`/);
          let target = '';
          
          if (match && match[1]) {
            target = match[1].trim();
          } else if (story.code_pointers && story.code_pointers.length > 0) {
            const file = story.code_pointers[0].file || '';
            const parts = file.split('/');
            const filename = parts[parts.length - 1];
            if (filename) {
              const extIdx = filename.lastIndexOf('.');
              const name = extIdx !== -1 ? filename.substring(0, extIdx) : filename;
              if (name && name !== 'main' && name !== 'index') {
                target = name;
              }
            }
          }
          
          if (!target) {
            let cleanAction = actionStr.replace(/^(implement a new |implement a |dispatch |handle |manage |manage connection |throwing a specific |using a cached state |dispatch transaction outcomes via a )/i, '');
            const words = cleanAction.split(' ').filter(Boolean);
            if (words.length > 0) {
              target = words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).replace(/[^a-zA-Z0-9]/g, '')).join('');
            }
          }
          
          if (target) {
            const cleanTarget = sanitizeIdentifier(target.split('.')[0].trim());
            if (cleanTarget && !existingClassNames.has(cleanTarget)) {
              proposedClasses.add(cleanTarget);
            }
          }
        });
        
        const uniqueProposed = Array.from(proposedClasses);
        
        if (uniqueProposed.length > 0) {
          if (setBackupTobeClassText) setBackupTobeClassText(tobeClassText);
          if (setBackupTobeSeqText) setBackupTobeSeqText(tobeSeqText);
          
          if (setTobeClassText && tobeClassText) {
            const toAdd = uniqueProposed.filter(cls => !tobeClassText.includes(`class ${cls}`));
            if (toAdd.length > 0) {
              const classLines = tobeClassText.split('\n');
              const endIdx = classLines.lastIndexOf('@enduml');
              if (endIdx !== -1) {
                const classAdditions = [
                  "",
                  "  ' Proposed green/dashed planned class additions from backlog:",
                  ...toAdd.map(cls => `  class ${cls} <<Planned>> #line:green;line.dashed;back:lightgreen {\n    +executeTask()\n  }`),
                  ""
                ];
                classLines.splice(endIdx, 0, ...classAdditions);
                setTobeClassText(classLines.join('\n'));
              }
            }
          }
          
          if (setTobeSeqText && tobeSeqText) {
            const toAdd = uniqueProposed.filter(cls => !tobeSeqText.includes(`-> ${cls}`));
            if (toAdd.length > 0) {
              const seqLines = tobeSeqText.split('\n');
              const endIdx = seqLines.lastIndexOf('@enduml');
              if (endIdx !== -1) {
                const lastClass = sanitizeIdentifier(astSymbols.find(s => s.kind === 'class')?.name || 'User');
                const seqAdditions = [
                  "",
                  "  ' Proposed planned sequence flows from backlog:",
                  ...toAdd.map((cls, idx) => {
                    const prev = idx === 0 ? lastClass : toAdd[idx - 1];
                    return `  ${prev} -> ${cls} : executeTask()`;
                  }),
                  ""
                ];
                seqLines.splice(endIdx, 0, ...seqAdditions);
                setTobeSeqText(seqLines.join('\n'));
              }
            }
          }
        }
      }
      
      const newCols: { [id: string]: string } = {};
      stories.forEach(s => {
        if (s && s.id) {
          newCols[s.id] = 'todo';
        }
      });
      setStoryColumns(newCols);
      if (projectId) {
        localStorage.setItem(`scrummap_cols_${projectId}`, JSON.stringify(newCols));
      }
      

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

  const handleExportJiraCSV = () => {
    if (userStories.length === 0) {
      alert("No backlog stories available to export.");
      return;
    }

    const headers = [
      "Summary",
      "Description",
      "Issue Type",
      "Epic Link",
      "Story Points",
      "Assignees"
    ];

    const rows = userStories.map(story => {
      const summary = story.role && story.action 
        ? `As a ${story.role}, I want to ${story.action}` 
        : `User Story ${story.id}`;
      const desc = `As a ${story.role || 'User'}, I want to ${story.action || ''} so that ${story.benefit || ''}.\n\nAcceptance Criteria (Unhappy Paths):\n${(story.unhappy_paths || []).join('\n')}`;
      const issueType = "Story";
      const epicLink = story.epic_title || "";
      const storyPoints = story.story_points || 0;
      
      const devNames = (story.assigned_developer_ids || [])
        .map(id => developers?.find(d => d.id === id)?.name || "")
        .filter(Boolean)
        .join(", ");

      const escapeCSVField = (field: any) => {
        const val = String(field == null ? '' : field);
        if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      return [
        escapeCSVField(summary),
        escapeCSVField(desc),
        escapeCSVField(issueType),
        escapeCSVField(epicLink),
        storyPoints,
        escapeCSVField(devNames)
      ];
    });

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${projectName.toLowerCase().replace(/\s+/g, '_')}_jira_backlog.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };



  const columns = getKanbanData();

  // Per-column accent tokens so the Kanban lanes stay visually distinct
  // (Todo=blue, In Progress=warning, Testing=purple, Done=success)
  const columnAccent: { [key: string]: string } = {
    todo: 'text-sfBlue',
    in_progress: 'text-sfWarning',
    testing: 'text-sfPurple',
    done: 'text-sfSuccess'
  };

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] select-none">
      
      {/* 1. Header options & generator inputs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sprint Goal Ingestion */}
        <div className="lg:col-span-2 glass rounded-xl p-5 border border-borderLine">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sfTextMuted flex items-center gap-1.5">
              <Kanban className="w-3.5 h-3.5 text-sfBlue" />
              <span>Sprint Goal Configuration</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReqUpload(!showReqUpload)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase font-bold rounded transition-all border ${
                  showReqUpload
                    ? 'bg-sfBlue/10 text-sfBlue border-sfBlue/30'
                    : 'bg-white text-sfTextMuted border-sfBorder hover:text-sfTextPrimary'
                }`}
              >
                <FileUp className="w-3 h-3" />
                <span>{showReqUpload ? 'Hide Upload' : 'Requirements File'}</span>
              </button>
              <InfoTooltip text="Define a sprint goal or upload requirements, then generate an AI-drafted backlog of user stories from your code's AST symbols." />
            </div>
          </div>
          <div className="flex gap-4">
            <input
              type="text"
              value={sprintGoal}
              onChange={(e) => setSprintGoal(e.target.value)}
              placeholder="Enter sprint goal description..."
              className="flex-1 px-3 py-2 bg-background border border-sfBorder text-sfTextPrimary text-xs rounded focus:outline-none focus:border-sfBlue transition-all"
            />
            <button
              onClick={handleGenerateBacklog}
              disabled={isGenerating || astSymbols.length === 0 || (!sprintGoal.trim() && !reqDocText.trim())}
              className={`flex items-center gap-1.5 px-4 py-2 text-white rounded text-xs font-bold transition-all disabled:opacity-50 ${
                clarificationQuestions.length > 0
                  ? 'bg-sfWarning hover:bg-sfWarning/80'
                  : 'bg-sfBlue hover:bg-sfBlueHover'
              }`}
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{clarificationQuestions.length > 0 ? 'Confirm & Generate' : 'Generate Backlog'}</span>
            </button>
          </div>

          {clarificationQuestions.length > 0 && (
            <div className="mt-4 border-t border-sfBorder/50 pt-4 space-y-4 animate-[fadeIn_0.3s_ease-out]">
              <div className="flex justify-between items-center">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-sfWarning flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-sfWarning" />
                  <span>Requirements Ambiguity Resolution Required</span>
                </h4>
                <button
                  onClick={() => {
                    setClarificationQuestions([]);
                    setClarificationAnswers({});
                  }}
                  className="text-[9px] text-sfTextMuted hover:text-sfTextPrimary uppercase font-bold border border-sfBorder px-1.5 py-0.5 rounded hover:bg-background"
                >
                  Clear Questions
                </button>
              </div>
              <div className="space-y-3">
                {clarificationQuestions.map((q, idx) => (
                  <div key={idx} className="space-y-1">
                    <label className="text-[10px] text-sfTextPrimary font-medium block">
                      {q}
                    </label>
                    <textarea
                      rows={2}
                      value={clarificationAnswers[q] || ""}
                      onChange={(e) =>
                        setClarificationAnswers((prev) => ({
                          ...prev,
                          [q]: e.target.value,
                        }))
                      }
                      placeholder="Type your response to resolve this gap..."
                      className="w-full px-3 py-1.5 bg-background border border-sfBorder text-sfTextPrimary text-xs rounded focus:outline-none focus:border-sfBlue transition-all"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {astSymbols.length === 0 && (
            <p className="text-[10px] text-sfWarning mt-2 flex items-center gap-1">
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
                      ? 'border-sfBlue bg-sfBlue/5'
                      : 'border-sfBorder hover:border-sfTextMuted hover:bg-background'
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
                  <FileUp className={`w-8 h-8 mb-2 ${isDragging ? 'text-sfBlue animate-bounce' : 'text-sfTextMuted'}`} />
                  <span className="text-xs font-semibold text-sfTextPrimary text-center">
                    Drag & drop your requirements file here, or <span className="text-sfBlue underline">browse</span>
                  </span>
                  <span className="text-[10px] text-sfTextMuted mt-1">Accepts only .md or .txt files</span>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-background border border-sfBorder rounded p-3 text-xs">
                  <div className="flex items-center gap-2 text-sfTextPrimary">
                    <FileText className="w-4 h-4 text-sfSuccess" />
                    <div>
                      <span className="font-semibold text-sfTextPrimary block truncate max-w-xs">{reqDocFileName}</span>
                      <span className="text-[10px] text-sfTextMuted">{(reqDocText.length / 1024).toFixed(1)} KB loaded</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setReqDocText('');
                      setReqDocFileName('');
                    }}
                    className="p-1 hover:bg-sfErrorBg text-sfTextMuted hover:text-sfError rounded transition-all"
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
        <div className="relative lg:col-span-1 glass rounded-xl p-5 border border-borderLine flex flex-col justify-between">
          <InfoTooltip text="Compiles backlog reports into a signed PDF governance report or exports them as a Jira-compatible CSV." className="absolute top-3 right-3" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-sfTextMuted mb-2">
            Backlog Exporters
          </h3>
          <p className="text-[10px] text-sfTextMuted leading-normal mb-3">
            Compile the backlog into a signed governance PDF report, or export stories into a Jira-compatible CSV file.
          </p>
          <div className="space-y-2">
            <button
              onClick={handleCompilePdf}
              disabled={isCompilingPdf || userStories.length === 0}
              className="flex items-center justify-center gap-2 w-full py-2 bg-sfSuccess hover:opacity-90 text-white rounded text-xs font-bold transition-all disabled:opacity-50 shadow-sm"
            >
              {isCompilingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              <span>Compile PDF Report</span>
            </button>
            <button
              onClick={handleExportJiraCSV}
              disabled={userStories.length === 0}
              className="flex items-center justify-center gap-2 w-full py-2 bg-white border border-sfBorder hover:border-sfPurple text-sfTextPrimary rounded text-xs font-bold transition-all disabled:opacity-50 shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-sfPurple" />
              <span>Export Jira CSV</span>
            </button>
          </div>
        </div>

      </div>

      {/* 2. Interactive Kanban board grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(columns).map(([colId, stories]) => {
          const colLabel = colId.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
          
          const accentText = columnAccent[colId] || 'text-sfTextMuted';

          return (
            <div key={colId} className="bg-background border border-borderLine rounded-xl p-4 min-h-[350px] flex flex-col">
              <div className="flex justify-between items-center border-b border-sfBorder pb-2 mb-3">
                <h4 className={`text-xs font-bold uppercase tracking-wider ${accentText}`}>{colLabel}</h4>
                <span className={`text-[10px] bg-white border border-sfBorder px-2 py-0.5 rounded-full font-bold ${accentText}`}>
                  {stories.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[450px] pr-1">
                {stories.map((story) => (
                  <div
                    key={story.id}
                    className="p-3 bg-white border border-borderLine rounded-lg hover:border-sfBlue/40 transition-all select-none space-y-2"
                  >
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[9px] font-bold bg-sfBlue/10 text-sfBlue border border-sfBlue/30 px-1.5 py-0.5 rounded font-mono">
                        {story.id}
                      </span>
                      <span className="text-[9px] font-bold bg-sfPurple/10 text-sfPurple border border-sfPurple/30 px-1.5 py-0.5 rounded">
                        {story.story_points} SP
                      </span>
                    </div>

                    <p className="text-xs text-sfTextPrimary leading-normal font-sans">
                      <strong className="text-sfTextMuted font-normal">As a</strong> {story.role}, <strong className="text-sfTextMuted font-normal">I want to</strong> {story.action} <strong className="text-sfTextMuted font-normal">so that</strong> {story.benefit}
                    </p>

                    {/* Traceability files */}
                    {story.code_pointers && story.code_pointers.length > 0 && (
                      <div className="text-[9px] text-sfTextMuted border-t border-sfBorder/50 pt-2 font-mono truncate" title={story.code_pointers[0].file}>
                        Pointers: {story.code_pointers[0].file.split('/').pop()}:{story.code_pointers[0].lines}
                      </div>
                    )}

                    {/* Developer Assignment Checklist (Multi-Select Popover) */}
                    <div className="flex flex-col border-t border-sfBorder/50 pt-2 space-y-1">
                      <span className="text-[9px] uppercase font-bold text-sfTextMuted">Assignees:</span>
                      <div className="relative">
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenAssigneeStoryId(openAssigneeStoryId === story.id ? null : story.id);
                          }}
                          className="flex flex-wrap gap-1 items-center p-1.5 bg-background border border-sfBorder rounded hover:border-sfBorderHover transition-all min-h-[28px] cursor-pointer"
                        >
                          {developers.filter(d => (story.assigned_developer_ids || []).includes(d.id)).length > 0 ? (
                            developers.filter(d => (story.assigned_developer_ids || []).includes(d.id)).map(dev => {
                              const parts = dev.name.trim().split(/\s+/);
                              const initials = parts.map(p => p[0]).join('').substring(0, 2).toUpperCase() || '?';
                              return (
                                <span
                                  key={dev.id}
                                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold text-white shadow-sm flex items-center gap-0.5 ${
                                    dev.is_lead ? 'bg-yellow-500' : 'bg-sfPurple'
                                  }`}
                                  title={dev.name}
                                >
                                  {initials}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[9px] text-sfTextMuted italic pl-1">Unassigned</span>
                          )}
                        </div>
                        
                        {/* Dropdown Checklist on Click */}
                        {openAssigneeStoryId === story.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-0 right-0 top-full mt-1 bg-white border border-sfBorder rounded-lg shadow-xl p-2 z-50 space-y-1.5 max-h-40 overflow-y-auto"
                          >
                            {developers.length > 0 ? (
                              developers.map((dev) => {
                                const isChecked = (story.assigned_developer_ids || []).includes(dev.id);
                                return (
                                  <div
                                    key={dev.id}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-2 text-[10px] text-sfTextPrimary font-medium cursor-pointer hover:bg-background p-1 rounded transition-all select-none"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={async (e) => {
                                        let currentIds = [...(story.assigned_developer_ids || [])];
                                        if (e.target.checked) {
                                          if (!currentIds.includes(dev.id)) {
                                            currentIds.push(dev.id);
                                          }
                                        } else {
                                          currentIds = currentIds.filter(id => id !== dev.id);
                                        }
                                        
                                        try {
                                          await api.assignStory(projectId || '', story.id, currentIds);
                                          if (loadBacklog) loadBacklog();
                                        } catch (err) {
                                          console.error("Failed to update assignments:", err);
                                          alert("Failed to update developer assignment. Reverting selection.");
                                          if (loadBacklog) loadBacklog();
                                        }
                                      }}
                                      className="rounded bg-white border-sfBorder text-sfBlue focus:ring-0 cursor-pointer w-3 h-3"
                                    />
                                    <span 
                                      className="flex-1"
                                      onClick={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const nextChecked = !isChecked;
                                        let currentIds = [...(story.assigned_developer_ids || [])];
                                        if (nextChecked) {
                                          if (!currentIds.includes(dev.id)) currentIds.push(dev.id);
                                        } else {
                                          currentIds = currentIds.filter(id => id !== dev.id);
                                        }
                                        try {
                                          await api.assignStory(projectId || '', story.id, currentIds);
                                          if (loadBacklog) loadBacklog();
                                        } catch (err) {
                                          console.error(err);
                                          alert("Failed to update developer assignment. Reverting selection.");
                                          if (loadBacklog) loadBacklog();
                                        }
                                      }}
                                    >
                                      {dev.name}{dev.is_lead ? ' (Lead)' : ''}
                                    </span>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-[9px] text-sfTextMuted italic p-1 text-center">
                                No team members found
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Move controls (interactive) */}
                    <div className="flex justify-end gap-1 pt-1">
                      {colId !== 'todo' && (
                        <button
                          onClick={() => moveStory(story.id, colId === 'done' ? 'testing' : colId === 'testing' ? 'in_progress' : 'todo')}
                          className="text-[9px] bg-background hover:bg-white border border-sfBorder text-sfTextMuted hover:text-sfTextPrimary px-1.5 py-0.5 rounded"
                        >
                          ◀
                        </button>
                      )}
                      {colId !== 'done' && (
                        <button
                          onClick={() => moveStory(story.id, colId === 'todo' ? 'in_progress' : colId === 'in_progress' ? 'testing' : 'done')}
                          className="text-[9px] bg-background hover:bg-white border border-sfBorder text-sfTextMuted hover:text-sfTextPrimary px-1.5 py-0.5 rounded"
                        >
                          ▶
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {stories.length === 0 && (
                  <div className="text-center py-10 text-[10px] text-sfTextMuted italic border border-dashed border-sfBorder rounded-lg">
                    No items placed.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Bottom panels: Gantt chart */}
      <div className="mt-6">
        
        {/* Interactive Gantt Timeline map */}
        <div className="glass rounded-xl p-5 border border-borderLine">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sfTextMuted flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sfTextMuted" />
              <span>Agile Gantt Timeline Schedulers</span>
            </h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[10px] text-sfTextMuted uppercase font-bold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTimelineInPdf}
                  onChange={(e) => setIncludeTimelineInPdf(e.target.checked)}
                  className="rounded bg-white border-sfBorder text-sfPurple focus:ring-0 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5"
                />
                <span>Include Milestones in PDF</span>
              </label>
              <InfoTooltip text="Assigns user stories alternately to two developer tracks across a 10-day sprint, sizing each bar by story points." />
            </div>
          </div>
          <div className="space-y-4 pt-2">
            {(() => {
              // 1. Calculate max total days needed across all developer tracks
              const tempDevTimes: { [devId: string]: number } = { unassigned: 0 };
              if (Array.isArray(userStories)) {
                userStories.forEach((story) => {
                  const sp = story.story_points || 3.0;
                  let durationDays = 2;
                  if (sp <= 1) durationDays = 1;
                  else if (sp <= 2) durationDays = 1.5;
                  else if (sp <= 3) durationDays = 2;
                  else if (sp <= 5) durationDays = 3;
                  else durationDays = 5;
                  
                  const devIds = story.assigned_developer_ids || [];
                  if (devIds.length === 0) {
                    tempDevTimes['unassigned'] += durationDays;
                  } else {
                    devIds.forEach((id) => {
                      if (!(id in tempDevTimes)) {
                        tempDevTimes[id] = 0;
                      }
                      tempDevTimes[id] += durationDays;
                    });
                  }
                });
              }
              const totalDays = Math.max(10, ...Object.values(tempDevTimes));

              // 2. Render each row using the dynamic totalDays scale
              const currentDevTimes: { [devId: string]: number } = { unassigned: 0 };
              
              return Array.isArray(userStories) && userStories.map((story) => {
                const sp = story.story_points || 3.0;
                
                let durationDays = 2;
                if (sp <= 1) durationDays = 1;
                else if (sp <= 2) durationDays = 1.5;
                else if (sp <= 3) durationDays = 2;
                else if (sp <= 5) durationDays = 3;
                else durationDays = 5;
                
                const devIds = story.assigned_developer_ids || [];
                let startDay = 0;
                if (devIds.length === 0) {
                  startDay = currentDevTimes['unassigned'] || 0;
                  currentDevTimes['unassigned'] = startDay + durationDays;
                } else {
                  devIds.forEach((id) => {
                    if (!(id in currentDevTimes)) {
                      currentDevTimes[id] = 0;
                    }
                  });
                  startDay = Math.max(...devIds.map(id => currentDevTimes[id] || 0));
                  devIds.forEach((id) => {
                    currentDevTimes[id] = startDay + durationDays;
                  });
                }
                
                const startOffset = `${(startDay / totalDays) * 100}%`;
                const durationWidth = `${(durationDays / totalDays) * 100}%`;
                const weekNum = Math.floor(startDay / 5) + 1;
                const endDayVal = startDay + durationDays;
                
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
                
                // Find all assigned developers
                const devs = developers.filter(d => (story.assigned_developer_ids || []).includes(d.id));
                
                return (
                  <div key={story.id} className="flex items-center gap-4 text-xs font-mono select-none animate-[fadeIn_0.2s_ease-out]">
                    <span className="w-16 text-sfTextMuted">{story.id}</span>
                    
                    {/* Developer initials circles next to the bar */}
                    <div className="flex -space-x-1 pl-1 w-16 justify-center">
                      {devs.length > 0 ? (
                        devs.map(dev => {
                          const parts = dev.name.trim().split(/\s+/);
                          const initials = parts.map(p => p[0]).join('').substring(0, 2).toUpperCase() || '?';
                          return (
                            <div 
                              key={dev.id}
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold shadow-sm border select-none ${
                                dev.is_lead 
                                  ? 'bg-yellow-500 border-yellow-400 text-white ring-1 ring-yellow-300' 
                                  : 'bg-sfPurple border-white/20 text-white'
                              }`}
                              title={`${dev.name}${dev.is_lead ? ' (Lead)' : ''}`}
                            >
                              {initials}
                            </div>
                          );
                        })
                      ) : (
                        <div 
                          className="w-6 h-6 rounded-full bg-sfBorder border border-sfBorder text-sfTextMuted flex items-center justify-center text-[9px] select-none"
                          title="Unassigned"
                        >
                          -
                        </div>
                      )}
                    </div>
 
                     <div className="flex-1 bg-background h-6 rounded border border-sfBorder relative">
                       <div
                         style={{ left: startOffset, width: durationWidth }}
                         className="absolute top-1 bottom-1 bg-sfBlue rounded flex items-center px-2 text-[8px] font-sans text-white truncate font-bold shadow-sm"
                       >
                         Sprint W{weekNum} (Day {Math.floor(startDay) + 1}-{Math.ceil(endDayVal)}) '{targetName}'
                       </div>
                     </div>
                   </div>
                 );
               });
             })()}

            {userStories.length === 0 && (
              <div className="text-center py-6 text-xs text-sfTextMuted italic">
                Generate sprint backlog user stories to populate the Gantt schedule.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
