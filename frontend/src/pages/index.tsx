import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { 
  UploadCloud, 
  Layout, 
  Kanban,
  ShieldAlert,
  Activity, 
  Database, 
  CheckCircle2, 
  Settings, 
  Plus, 
  Key,
  ChevronDown,
  Trash2,
  Users,
  X
} from 'lucide-react';

import { Project, UserStory, ASTSymbol, Developer } from '../lib/types';
import { api } from '../lib/api';
import { generateClassDiagramMarkup, generateDefaultSequenceMarkup } from '../lib/uml_helpers';

// Components imports
import DropZone from '../components/DropZone';
import UMLCanvas from '../components/UMLCanvas';
import EpicBoard from '../components/EpicBoard';
import CodeViewer from '../components/CodeViewer';
import AdminPortal from '../components/AdminPortal';
import AuditorConsole from '../components/AuditorConsole';
import PerformanceDashboard from '../components/PerformanceDashboard';

const ROLES = [
  { name: 'Product Manager', value: 'PRODUCT_MANAGER', envKey: 'ROLE_KEY_PRODUCT_MANAGER', defaultKey: 'rk_pm_demo_secret_only' },
  { name: 'Scrum Master', value: 'SCRUM_MASTER', envKey: 'ROLE_KEY_SCRUM_MASTER', defaultKey: 'rk_sm_demo_secret_only' },
  { name: 'Lead Developer', value: 'LEAD_DEVELOPER', envKey: 'ROLE_KEY_LEAD_DEVELOPER', defaultKey: 'rk_dev_demo_secret_only' },
  { name: 'Security Auditor', value: 'SECURITY_AUDITOR', envKey: 'ROLE_KEY_SECURITY_AUDITOR', defaultKey: 'rk_audit_demo_secret_only' },
  { name: 'System Admin', value: 'SYSTEM_ADMIN', envKey: 'ROLE_KEY_SYSTEM_ADMIN', defaultKey: 'rk_admin_demo_secret_only' }
];

// RBAC: roles allowed to see ZIP upload ingestion and UML rendering controls
const INGEST_ROLES = ['LEAD_DEVELOPER', 'SYSTEM_ADMIN'];
const UML_ROLES = ['LEAD_DEVELOPER', 'SYSTEM_ADMIN'];
// RBAC: roles allowed to see the Auditor Console (ledger transaction table) and Configuration & Keys (privileges, settings)
const ADMIN_ROLES = ['SECURITY_AUDITOR', 'SYSTEM_ADMIN'];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('ingest');
  const [codeTraceView, setCodeTraceView] = useState<'uml' | 'code'>('uml');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  
  // Role & Auth state
  const [activeRole, setActiveRole] = useState(ROLES[2]); // Default to Lead Developer
  const [roleKey, setRoleKey] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);

  // Team management state
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newDevName, setNewDevName] = useState('');
  const [newDevIsLead, setNewDevIsLead] = useState(false);

  const isPMOrAdmin = activeRole.value === 'PRODUCT_MANAGER' || activeRole.value === 'SYSTEM_ADMIN';

  // Global project assets state (shared between views)
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [astSymbols, setAstSymbols] = useState<ASTSymbol[]>([]);
  const [classDiagramUrl, setClassDiagramUrl] = useState<string | null>(null);
  const [sequenceDiagramUrl, setSequenceDiagramUrl] = useState<string | null>(null);

  // Lifted UML text markup states
  const [classDiagramText, setClassDiagramText] = useState('');
  const [sequenceDiagramText, setSequenceDiagramText] = useState('');
  const [tobeClassText, setTobeClassText] = useState('');
  const [tobeSeqText, setTobeSeqText] = useState('');
  const [backupTobeClassText, setBackupTobeClassText] = useState<string | null>(null);
  const [backupTobeSeqText, setBackupTobeSeqText] = useState<string | null>(null);
  const [activeUmlMode, setActiveUmlMode] = useState<'asis' | 'tobe'>('asis');

  // RBAC visibility for the current role
  const canViewIngest = INGEST_ROLES.includes(activeRole.value);
  const canViewUml = UML_ROLES.includes(activeRole.value);
  const canViewAdmin = ADMIN_ROLES.includes(activeRole.value);

  // If the active role loses access to the current tab/sub-view, fall back to a visible one
  useEffect(() => {
    if (activeTab === 'ingest' && !canViewIngest) setActiveTab('backlog');
    if ((activeTab === 'admin' || activeTab === 'auditor') && !canViewAdmin) setActiveTab('backlog');
  }, [canViewIngest, canViewAdmin, activeTab]);

  useEffect(() => {
    if (codeTraceView === 'uml' && !canViewUml) setCodeTraceView('code');
  }, [canViewUml, codeTraceView]);

  // Load initially
  useEffect(() => {
    // Load Saved Role Key if any
    const savedRoleVal = localStorage.getItem('scrummap_role_value') || 'LEAD_DEVELOPER';
    const foundRole = ROLES.find(r => r.value === savedRoleVal) || ROLES[2];
    setActiveRole(foundRole);

    const savedKey = localStorage.getItem('scrummap_role_key') || foundRole.defaultKey;
    setRoleKey(savedKey);
    localStorage.setItem('scrummap_role_key', savedKey);

    loadProjects();
  }, []);

  useEffect(() => {
    const verifyHealth = async () => {
      const online = await api.checkHealth();
      setIsServerOnline(online);
    };
    verifyHealth();
    const interval = setInterval(verifyHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Pre-seed diagrams at page-level when codebase AST changes
  useEffect(() => {
    if (astSymbols && astSymbols.length > 0) {
      const generatedClass = generateClassDiagramMarkup(astSymbols);
      setClassDiagramText(generatedClass);
      
      const defaultSequence = generateDefaultSequenceMarkup(astSymbols);
      setSequenceDiagramText(defaultSequence);

      // Seed To-Be diagrams
      const classLines = generatedClass.split('\n');
      if (classLines.length > 0 && classLines[classLines.length - 1] === '@enduml') {
        classLines.splice(classLines.length - 1, 0, 
          "",
          "  ' To-Be Architecture (Proposed green/dashed stereotyped additions)",
          "  ' Example of a planned extension class:",
          "  ' class PlannedService <<Planned>> #line:green;line.dashed;back:lightgreen {",
          "  '   +executePlannedTask()",
          "  ' }",
          ""
        );
      }
      setTobeClassText(classLines.join('\n'));

      const seqLines = defaultSequence.split('\n');
      if (seqLines.length > 0 && seqLines[seqLines.length - 1] === '@enduml') {
        seqLines.splice(seqLines.length - 1, 0,
          "",
          "  ' To-Be Architecture Sequence traces",
          "  ' Example of sequence trace involving a planned class:",
          "  ' participant PlannedService <<Planned>>",
          "  ' OrderService -> PlannedService : executePlannedTask()",
          ""
        );
      }
      setTobeSeqText(seqLines.join('\n'));
    } else {
      setClassDiagramText('');
      setSequenceDiagramText('');
      setTobeClassText('');
      setTobeSeqText('');
    }
  }, [astSymbols]);

  const loadDevelopers = async (projectId: string) => {
    try {
      const devs = await api.getDevelopers(projectId);
      setDevelopers(devs);
    } catch (e) {
      console.error("Failed to load developers:", e);
    }
  };

  const loadBacklog = async (projectId: string) => {
    try {
      const stories = await api.getBacklog(projectId);
      setUserStories(stories);
    } catch (e) {
      console.error("Failed to load backlog:", e);
      setUserStories([]);
    }
  };

  const handleAddDeveloper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newDevName.trim()) return;
    if (developers.length >= 20) {
      showStatus("You cannot assign more than 20 developers to a project.", "error");
      return;
    }
    try {
      await api.addDeveloper(selectedProject.id, newDevName.trim(), newDevIsLead);
      setNewDevName('');
      setNewDevIsLead(false);
      showStatus("Developer added to team.", "success");
      loadDevelopers(selectedProject.id);
    } catch (err: any) {
      showStatus(err.response?.data?.detail || "Failed to add developer", "error");
    }
  };

  const handleDeleteDeveloper = async (devId: string) => {
    if (!selectedProject) return;
    try {
      await api.deleteDeveloper(selectedProject.id, devId);
      showStatus("Developer removed from team.", "success");
      loadDevelopers(selectedProject.id);
      loadBacklog(selectedProject.id);
    } catch (err: any) {
      showStatus(err.response?.data?.detail || "Failed to remove developer", "error");
    }
  };

  useEffect(() => {
    // Clear diagrams and AST symbols when switching projects to avoid displaying old/stale diagrams
    setAstSymbols([]);
    setClassDiagramUrl(null);
    setSequenceDiagramUrl(null);
    setClassDiagramText('');
    setSequenceDiagramText('');
    setTobeClassText('');
    setTobeSeqText('');

    if (selectedProject) {
      loadDevelopers(selectedProject.id);
      loadBacklog(selectedProject.id);
    } else {
      setDevelopers([]);
      setUserStories([]);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0) {
        setSelectedProject(data[0]);
      }
    } catch (e: any) {
      console.error("Failed to load projects:", e);
      showStatus("Could not fetch project list from backend. Make sure database is initialized.", 'error');
    }
  };

  const handleRoleChange = (roleValue: string) => {
    const roleObj = ROLES.find(r => r.value === roleValue);
    if (roleObj) {
      setActiveRole(roleObj);
      localStorage.setItem('scrummap_role_value', roleObj.value);
      
      // Auto-load default key for ease of local testing
      const targetKey = roleObj.defaultKey;
      setRoleKey(targetKey);
      localStorage.setItem('scrummap_role_key', targetKey);
      showStatus(`Switched role context to: ${roleObj.name}`, 'success');
    }
  };

  const handleSaveKey = () => {
    localStorage.setItem('scrummap_role_key', roleKey);
    setShowAuthModal(false);
    showStatus("Access keys successfully committed to browser local storage.", 'success');
    // Reload projects with new auth context
    loadProjects();
  };

  const handleCreateProject = async () => {
    const pName = prompt("Enter a unique name for the new Project:");
    if (!pName) return;
    const pDesc = prompt("Enter project description (optional):") || "";
    try {
      const res = await api.createProject(pName, pDesc);
      showStatus(`Project '${pName}' registered successfully.`, 'success');
      // Reload projects list
      const updatedList = await api.getProjects();
      setProjects(updatedList);
      const newProj = updatedList.find(p => p.id === res.project_id);
      if (newProj) {
        setSelectedProject(newProj);
      }
    } catch (e: any) {
      console.error(e);
      let errMsg = "Unknown error";
      if (e.response?.data?.detail) {
        const detail = e.response.data.detail;
        if (typeof detail === 'string') {
          errMsg = detail;
        } else if (Array.isArray(detail)) {
          errMsg = detail.map(err => `${err.msg} (${err.loc.slice(1).join('.')})`).join(', ');
        } else {
          errMsg = JSON.stringify(detail);
        }
      } else if (e.message) {
        errMsg = e.message;
      }
      showStatus(`Project Creation Rejected: ${errMsg}`, 'error');
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    const confirmDelete = confirm(`Are you absolutely sure you want to delete the project "${selectedProject.name}"? This will permanently wipe all associated versions, user stories, and audit ledger logs.`);
    if (!confirmDelete) return;

    try {
      await api.deleteProject(selectedProject.id);
      showStatus(`Project '${selectedProject.name}' deleted successfully.`, 'success');
      
      // Reload projects list
      const updatedList = await api.getProjects();
      setProjects(updatedList);
      
      if (updatedList.length > 0) {
        setSelectedProject(updatedList[0]);
      } else {
        setSelectedProject(null);
        setAstSymbols([]);
      }
    } catch (e: any) {
      console.error(e);
      let errMsg = "Unknown error";
      if (e.response?.data?.detail) {
        const detail = e.response.data.detail;
        if (typeof detail === 'string') errMsg = detail;
      } else if (e.message) {
        errMsg = e.message;
      }
      showStatus(`Project Deletion Failed: ${errMsg}`, 'error');
    }
  };

  const showStatus = (text: string, type: 'info' | 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  return (
    <div className="flex min-height-screen bg-background text-sfTextPrimary font-sans min-h-screen">
      <Head>
        <title>ScrumMap Software Governance & Requirements Control Room</title>
      </Head>

      {/* Sticky Left Sidebar */}
      <aside className="w-64 bg-white border-r border-sfBorder flex flex-col justify-between select-none">
        <div>
          {/* Logo brand */}
          <div className="px-6 py-6 border-b border-sfBorder flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sfBlue flex items-center justify-center font-black text-white text-base">
              S
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-sfBlue">ScrumMap</span>
              <div className="text-[9px] uppercase tracking-widest text-sfTextMuted font-bold">Secure Governance</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-6 px-3 space-y-1">
            {canViewIngest && (
              <button
                onClick={() => setActiveTab('ingest')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'ingest'
                    ? 'bg-sfBlue/10 text-sfBlue border-l-2 border-sfBlue'
                    : 'text-sfTextMuted hover:bg-background hover:text-sfTextPrimary'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span>Ingestion Hub</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('backlog')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'backlog'
                  ? 'bg-sfBlue/10 text-sfBlue border-l-2 border-sfBlue'
                  : 'text-sfTextMuted hover:bg-background hover:text-sfTextPrimary'
              }`}
            >
              <Kanban className="w-4 h-4" />
              <span>Epic Backlog</span>
            </button>

            <button
              onClick={() => setActiveTab('codetrace')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'codetrace'
                  ? 'bg-sfBlue/10 text-sfBlue border-l-2 border-sfBlue'
                  : 'text-sfTextMuted hover:bg-background hover:text-sfTextPrimary'
              }`}
            >
              <Layout className="w-4 h-4" />
              <span>Code Trace & UML</span>
            </button>

            {canViewAdmin && (
              <button
                onClick={() => setActiveTab('auditor')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'auditor'
                    ? 'bg-sfBlue/10 text-sfBlue border-l-2 border-sfBlue'
                    : 'text-sfTextMuted hover:bg-background hover:text-sfTextPrimary'
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Auditor Console</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('metrics')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'metrics'
                  ? 'bg-sfBlue/10 text-sfBlue border-l-2 border-sfBlue'
                  : 'text-sfTextMuted hover:bg-background hover:text-sfTextPrimary'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>KPIs</span>
            </button>

            {canViewAdmin && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'admin'
                    ? 'bg-sfBlue/10 text-sfBlue border-l-2 border-sfBlue'
                    : 'text-sfTextMuted hover:bg-background hover:text-sfTextPrimary'
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Configuration & Keys</span>
              </button>
            )}
          </nav>
        </div>

        {/* Footer info */}
        <div className="px-6 py-6 border-t border-sfBorder text-[10px] text-sfTextMuted flex flex-col gap-1">
          <div>IP: 127.0.0.1 (Loopback)</div>
          <div>Status: Sandbox Secure</div>
          <div>ZDR Policy: Active</div>
        </div>
      </aside>

      {/* Main viewport area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        
        {/* Dynamic Global Header */}
        <header className="h-16 bg-sfBlue px-8 flex items-center justify-between select-none shadow-md">
          {/* Active project dropdown details */}
          <div className="flex items-center gap-4">
            <span className="text-xs uppercase tracking-widest text-white/70 font-bold">Project:</span>
            {projects.length > 0 ? (
              <div className="relative group">
                <select
                  value={selectedProject?.id || ''}
                  onChange={(e) => {
                    const p = projects.find(proj => proj.id === e.target.value);
                    if (p) setSelectedProject(p);
                  }}
                  className="bg-white text-sfTextPrimary text-xs font-semibold px-3 py-1.5 rounded border border-white focus:outline-none cursor-pointer hover:bg-white/90 transition-all appearance-none pr-8"
                >
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>{proj.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2 pointer-events-none text-sfTextMuted" />
              </div>
            ) : (
              <span className="text-xs text-white/70 font-medium italic">No active project</span>
            )}

            {isPMOrAdmin && (
              <button
                onClick={handleCreateProject}
                className="p-1.5 rounded bg-white/15 border border-white/25 hover:bg-white/25 text-white transition-all"
                title="Create New Project"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}

            {isPMOrAdmin && selectedProject && (
              <button
                onClick={handleDeleteProject}
                className="p-1.5 rounded bg-white/15 border border-white/25 hover:bg-white/25 text-white transition-all"
                title="Delete Selected Project"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            {isPMOrAdmin && selectedProject && (
              <button
                onClick={() => setShowTeamModal(true)}
                className="p-1.5 rounded bg-white/15 border border-white/25 hover:bg-white/25 text-white transition-all flex items-center gap-1.5 text-xs font-semibold px-2.5"
                title="Manage Team Members"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Team</span>
              </button>
            )}

            {selectedProject && developers.length > 0 && (
              <div className="flex items-center -space-x-1.5 pl-2">
                {developers.slice(0, 5).map((dev) => {
                  const parts = dev.name.trim().split(/\s+/);
                  const initials = parts.map(p => p[0]).join('').substring(0, 2).toUpperCase() || '?';
                  return (
                    <div
                      key={dev.id}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-md select-none ${
                        dev.is_lead 
                          ? 'bg-yellow-500 ring-2 ring-yellow-300' 
                          : 'bg-sfPurple border border-white/30'
                      }`}
                      title={`${dev.name}${dev.is_lead ? ' (Lead Developer)' : ''}`}
                    >
                      {initials}
                    </div>
                  );
                })}
                {developers.length > 5 && (
                  isPMOrAdmin ? (
                    <button
                      onClick={() => setShowTeamModal(true)}
                      className="w-7 h-7 rounded-full bg-white/20 border border-white/30 hover:bg-white/30 text-[9px] font-bold text-white flex items-center justify-center shadow-md transition-all select-none"
                      title={`Show all ${developers.length} team members`}
                    >
                      +{developers.length - 5}
                    </button>
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full bg-white/20 border border-white/30 text-[9px] font-bold text-white flex items-center justify-center shadow-md select-none"
                      title={`${developers.length} team members total`}
                    >
                      +{developers.length - 5}
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Interactive Role Switcher Header Inputs Panel */}
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-white/70 font-bold">Role context:</span>

            {/* Switch Role Dropdown */}
            <div className="relative">
              <select
                value={activeRole.value}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="bg-white text-sfTextPrimary text-xs font-semibold px-3 py-1.5 rounded border border-white focus:outline-none cursor-pointer hover:bg-white/90 transition-all appearance-none pr-8"
              >
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{role.name}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2 pointer-events-none text-sfTextMuted" />
            </div>

            </div>
        </header>

        {/* Global Notification Toast */}
        {statusMessage && (
          <div className="px-8 py-2.5 bg-white border-b border-sfBorder flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${
              statusMessage.type === 'success' ? 'bg-sfSuccess' : statusMessage.type === 'error' ? 'bg-sfError' : 'bg-sfBlue'
            }`} />
            <span className="text-xs text-sfTextPrimary font-medium">{statusMessage.text}</span>
          </div>
        )}

        {/* Main tabs viewport content */}
        <main className="p-8 flex-1">
          {activeTab === 'ingest' && canViewIngest && (
            <DropZone
              projectId={selectedProject?.id}
              onUploadSuccess={(symbols) => {
                setAstSymbols(symbols);
                showStatus(`Successfully parsed codebase, extracted ${symbols.length} AST symbols.`, 'success');
                setActiveTab('backlog');
              }}
            />
          )}
          {activeTab === 'codetrace' && (
            <div className="space-y-4">
              {/* Code Trace & UML sub-tab strip */}
              <div className="flex justify-between items-center bg-white border border-sfBorder rounded-xl p-3">
                <div className="flex gap-2">
                  {canViewUml && (
                    <button
                      onClick={() => setCodeTraceView('uml')}
                      className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                        codeTraceView === 'uml'
                          ? 'bg-sfBlue text-white shadow'
                          : 'bg-background text-sfTextMuted hover:text-sfTextPrimary hover:bg-sfBorder/40'
                      }`}
                    >
                      UML Diagrams
                    </button>
                  )}
                  <button
                    onClick={() => setCodeTraceView('code')}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                      codeTraceView === 'code'
                        ? 'bg-sfPurple text-white shadow'
                        : 'bg-background text-sfTextMuted hover:text-sfTextPrimary hover:bg-sfBorder/40'
                    }`}
                  >
                    Code Trace
                  </button>
                </div>
              </div>

              {codeTraceView === 'uml' && canViewUml && (
                <UMLCanvas
                  astSymbols={astSymbols}
                  classDiagramUrl={classDiagramUrl}
                  sequenceDiagramUrl={sequenceDiagramUrl}
                  setClassDiagramUrl={setClassDiagramUrl}
                  setSequenceDiagramUrl={setSequenceDiagramUrl}
                  classDiagramText={classDiagramText}
                  setClassDiagramText={setClassDiagramText}
                  sequenceDiagramText={sequenceDiagramText}
                  setSequenceDiagramText={setSequenceDiagramText}
                  tobeClassText={tobeClassText}
                  setTobeClassText={setTobeClassText}
                  tobeSeqText={tobeSeqText}
                  setTobeSeqText={setTobeSeqText}
                  activeMode={activeUmlMode}
                  setActiveMode={setActiveUmlMode}
                  backupTobeClassText={backupTobeClassText}
                  setBackupTobeClassText={setBackupTobeClassText}
                  backupTobeSeqText={backupTobeSeqText}
                  setBackupTobeSeqText={setBackupTobeSeqText}
                />
              )}

              {codeTraceView === 'code' && (
                <CodeViewer
                  astSymbols={astSymbols}
                  userStories={userStories}
                />
              )}
            </div>
          )}

          {activeTab === 'backlog' && (
            <EpicBoard 
              projectId={selectedProject?.id}
              projectName={selectedProject?.name}
              projectDescription={selectedProject?.description || ''}
              astSymbols={astSymbols}
              userStories={userStories}
              setUserStories={setUserStories}
              classDiagramUrl={classDiagramUrl}
              sequenceDiagramUrl={sequenceDiagramUrl}
              tobeClassText={tobeClassText}
              setTobeClassText={setTobeClassText}
              tobeSeqText={tobeSeqText}
              setTobeSeqText={setTobeSeqText}
              setBackupTobeClassText={setBackupTobeClassText}
              setBackupTobeSeqText={setBackupTobeSeqText}
              developers={developers}
              loadBacklog={() => selectedProject && loadBacklog(selectedProject.id)}
            />
          )}

          {activeTab === 'auditor' && canViewAdmin && (
            <AuditorConsole />
          )}

          {activeTab === 'metrics' && (
            <PerformanceDashboard projectId={selectedProject?.id} />
          )}

          {activeTab === 'admin' && canViewAdmin && (
            <AdminPortal 
              setShowAuthModal={setShowAuthModal}
              isServerOnline={isServerOnline}
            />
          )}
        </main>
      </div>

      {/* Role Key settings overlay Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 bg-white border border-sfBorder rounded-xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-sfTextPrimary mb-2 flex items-center gap-2">
              <Key className="w-4 h-4 text-sfBlue" />
              <span>RBAC Key Configuration</span>
            </h3>
            <p className="text-xs text-sfTextMuted mb-4">
              Enter the secret access key for the active role. The backend validates this key to authorize endpoints and log interactions securely.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-sfTextMuted font-bold mb-1">
                  Active Role Namespace
                </label>
                <div className="px-3 py-2 bg-background border border-sfBorder text-sfTextPrimary text-sm font-semibold rounded">
                  {activeRole.name} ({activeRole.value})
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-sfTextMuted font-bold mb-1">
                  X-ScrumMap-Role-Key Input
                </label>
                <input
                  type="password"
                  value={roleKey}
                  onChange={(e) => setRoleKey(e.target.value)}
                  placeholder="rk_your_role_secret"
                  className="w-full px-3 py-2 bg-background border border-sfBorder text-sfTextPrimary text-sm font-mono rounded focus:outline-none focus:border-sfBlue transition-all"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="px-4 py-2 text-xs font-semibold bg-background border border-sfBorder text-sfTextMuted hover:text-sfTextPrimary rounded transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveKey}
                  className="px-4 py-2 text-xs font-semibold bg-sfBlue hover:bg-sfBlueHover text-white rounded transition-all"
                >
                  Save Credentials
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Management Modal Dialog */}
      {showTeamModal && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 bg-white border border-sfBorder rounded-xl shadow-2xl relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => setShowTeamModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-background text-sfTextMuted hover:text-sfTextPrimary transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-sfBlue" />
              <h3 className="text-lg font-bold text-sfTextPrimary">
                Project Roster Management
              </h3>
            </div>
            <p className="text-xs text-sfTextMuted mb-4">
              Register up to 20 developers to assign to backlog stories. Designate one developer as the lead.
            </p>

            {/* List of current developers */}
            <div className="flex-1 overflow-y-auto mb-4 border border-sfBorder bg-background rounded-lg p-3 space-y-2 max-h-64">
              {developers.length > 0 ? (
                developers.map((dev) => {
                  const parts = dev.name.trim().split(/\s+/);
                  const initials = parts.map(p => p[0]).join('').substring(0, 2).toUpperCase() || '?';
                  return (
                    <div
                      key={dev.id}
                      className="flex items-center justify-between p-2.5 bg-white border border-sfBorder rounded-lg shadow-sm hover:border-sfBorderHover transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                            dev.is_lead ? 'bg-yellow-500 ring-2 ring-yellow-300' : 'bg-sfPurple'
                          }`}
                        >
                          {initials}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-sfTextPrimary flex items-center gap-2">
                            <span>{dev.name}</span>
                            {dev.is_lead && (
                              <span className="text-[9px] uppercase tracking-wider bg-yellow-100 text-yellow-800 font-bold px-1.5 py-0.5 rounded-full">
                                Lead
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] font-mono text-sfTextMuted">{dev.id}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteDeveloper(dev.id)}
                        className="text-xs text-rose-500 hover:text-rose-700 font-semibold p-1 hover:bg-rose-50 rounded transition-all"
                        title="Remove Developer"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-xs text-sfTextMuted italic">
                  No developers registered. Add a team member below to get started.
                </div>
              )}
            </div>

            {/* Form to add a new developer */}
            <form onSubmit={handleAddDeveloper} className="border-t border-sfBorder pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-[10px] uppercase tracking-widest text-sfTextMuted font-bold mb-1">
                    Developer Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newDevName}
                    onChange={(e) => setNewDevName(e.target.value)}
                    placeholder="e.g. Alice Smith"
                    maxLength={32}
                    className="w-full px-3 py-1.5 bg-background border border-sfBorder text-sfTextPrimary text-xs rounded focus:outline-none focus:border-sfBlue transition-all"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs text-sfTextPrimary font-semibold cursor-pointer mb-2.5">
                    <input
                      type="checkbox"
                      checked={newDevIsLead}
                      onChange={(e) => setNewDevIsLead(e.target.checked)}
                      className="rounded bg-white border-sfBorder text-sfBlue focus:ring-0 cursor-pointer w-3.5 h-3.5"
                    />
                    <span>Lead Developer</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-sfBorder mt-4">
                <button
                  type="button"
                  onClick={() => setShowTeamModal(false)}
                  className="px-4 py-1.5 text-xs font-semibold bg-background border border-sfBorder text-sfTextMuted hover:text-sfTextPrimary rounded transition-all"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={developers.length >= 20}
                  className="px-4 py-1.5 text-xs font-semibold bg-sfBlue hover:bg-sfBlueHover text-white rounded transition-all disabled:opacity-50"
                >
                  Add Team Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
