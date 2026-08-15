import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { 
  UploadCloud, 
  Layout, 
  Kanban, 
  Code2, 
  ShieldAlert, 
  Activity, 
  Database, 
  CheckCircle2, 
  Settings, 
  Plus, 
  Key,
  ChevronDown
} from 'lucide-react';

import { Project, UserStory, ASTSymbol } from '../lib/types';
import { api } from '../lib/api';

// Components imports
import DropZone from '../components/DropZone';
import UMLCanvas from '../components/UMLCanvas';
import EpicBoard from '../components/EpicBoard';
import CodeViewer from '../components/CodeViewer';
import AdminPortal from '../components/AdminPortal';
import PerformanceDashboard from '../components/PerformanceDashboard';

const ROLES = [
  { name: 'Product Manager', value: 'PRODUCT_MANAGER', envKey: 'ROLE_KEY_PRODUCT_MANAGER', defaultKey: 'rk_pm_demo_secret_only' },
  { name: 'Scrum Master', value: 'SCRUM_MASTER', envKey: 'ROLE_KEY_SCRUM_MASTER', defaultKey: 'rk_sm_demo_secret_only' },
  { name: 'Lead Developer', value: 'LEAD_DEVELOPER', envKey: 'ROLE_KEY_LEAD_DEVELOPER', defaultKey: 'rk_dev_demo_secret_only' },
  { name: 'Security Auditor', value: 'SECURITY_AUDITOR', envKey: 'ROLE_KEY_SECURITY_AUDITOR', defaultKey: 'rk_audit_demo_secret_only' },
  { name: 'System Admin', value: 'SYSTEM_ADMIN', envKey: 'ROLE_KEY_SYSTEM_ADMIN', defaultKey: 'rk_admin_demo_secret_only' }
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('ingest');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  
  // Role & Auth state
  const [activeRole, setActiveRole] = useState(ROLES[2]); // Default to Lead Developer
  const [roleKey, setRoleKey] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  // Global project assets state (shared between views)
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [astSymbols, setAstSymbols] = useState<ASTSymbol[]>([]);
  const [classDiagramUrl, setClassDiagramUrl] = useState<string | null>(null);

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
      const errMsg = e.response?.data?.detail || e.message || "Unknown error";
      showStatus(`Project Creation Rejected: ${errMsg}`, 'error');
    }
  };

  const showStatus = (text: string, type: 'info' | 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  return (
    <div className="flex min-height-screen bg-background text-slate-100 font-sans min-h-screen">
      <Head>
        <title>ScrumMap Software Governance & Requirements Control Room</title>
      </Head>

      {/* Sticky Left Sidebar */}
      <aside className="w-64 bg-slate-950/80 border-r border-borderLine flex flex-col justify-between select-none">
        <div>
          {/* Logo brand */}
          <div className="px-6 py-6 border-b border-borderLine flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center font-black text-white text-base shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              S
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">ScrumMap</span>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Secure Governance</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-6 px-3 space-y-1">
            <button
              onClick={() => setActiveTab('ingest')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'ingest' 
                  ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Ingestion Hub</span>
            </button>

            <button
              onClick={() => setActiveTab('uml')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'uml' 
                  ? 'bg-cyan-600/10 text-cyan-400 border-l-2 border-cyan-500' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Layout className="w-4 h-4" />
              <span>UML Canvas</span>
            </button>

            <button
              onClick={() => setActiveTab('backlog')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'backlog' 
                  ? 'bg-emerald-600/10 text-emerald-400 border-l-2 border-emerald-500' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Kanban className="w-4 h-4" />
              <span>Epic Backlog</span>
            </button>

            <button
              onClick={() => setActiveTab('code')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'code' 
                  ? 'bg-violet-600/10 text-violet-400 border-l-2 border-violet-500' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-4 h-4" />
              <span>Code Annotator</span>
            </button>

            <button
              onClick={() => setActiveTab('metrics')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'metrics' 
                  ? 'bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Performance</span>
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'admin' 
                  ? 'bg-rose-600/10 text-rose-400 border-l-2 border-rose-500' 
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Admin Portal</span>
            </button>
          </nav>
        </div>

        {/* Footer info */}
        <div className="px-6 py-6 border-t border-borderLine text-[10px] text-slate-500 flex flex-col gap-1 font-mono">
          <div>IP: 127.0.0.1 (Loopback)</div>
          <div>STATUS: SANDBOX SECURE</div>
          <div>ZDR POLICY: ACTIVE</div>
        </div>
      </aside>

      {/* Main viewport area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        
        {/* Dynamic Global Header */}
        <header className="h-16 bg-slate-950/40 border-b border-borderLine px-8 flex items-center justify-between select-none backdrop-blur-md">
          {/* Active project dropdown details */}
          <div className="flex items-center gap-4">
            <span className="text-xs uppercase tracking-widest text-slate-500 font-bold">Project:</span>
            {projects.length > 0 ? (
              <div className="relative group">
                <select
                  value={selectedProject?.id || ''}
                  onChange={(e) => {
                    const p = projects.find(proj => proj.id === e.target.value);
                    if (p) setSelectedProject(p);
                  }}
                  className="bg-slate-900 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded border border-borderLine focus:outline-none cursor-pointer hover:border-slate-500 transition-all appearance-none pr-8"
                >
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>{proj.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2 pointer-events-none text-slate-400" />
              </div>
            ) : (
              <span className="text-xs text-slate-400 font-medium italic">No active project</span>
            )}
            
            <button 
              onClick={handleCreateProject}
              className="p-1.5 rounded bg-slate-900 border border-borderLine hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all"
              title="Create New Project"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive Role Switcher Header Inputs Panel */}
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-slate-500 font-bold">Role context:</span>
            
            {/* Switch Role Dropdown */}
            <div className="relative">
              <select
                value={activeRole.value}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="bg-slate-900 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded border border-borderLine focus:outline-none cursor-pointer hover:border-slate-500 transition-all appearance-none pr-8"
              >
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{role.name}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2 pointer-events-none text-slate-400" />
            </div>

            {/* View/Edit API Access Key Button */}
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-blue-600/15 text-blue-400 border border-blue-500/20 hover:bg-blue-600/25 transition-all"
              title="Manage RBAC Credentials Key"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Key Settings</span>
            </button>

            {/* Server-status Dot */}
            <div className="flex items-center gap-1.5 ml-2 border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
              <span className="text-[10px] uppercase font-bold text-emerald-400">Online</span>
            </div>
          </div>
        </header>

        {/* Global Notification Toast */}
        {statusMessage && (
          <div className="px-8 py-2.5 bg-slate-950/70 border-b border-borderLine flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${
              statusMessage.type === 'success' ? 'bg-emerald-500' : statusMessage.type === 'error' ? 'bg-rose-500' : 'bg-blue-500'
            }`} />
            <span className="text-xs text-slate-300 font-medium">{statusMessage.text}</span>
          </div>
        )}

        {/* Main tabs viewport content */}
        <main className="p-8 flex-1">
          {activeTab === 'ingest' && (
            <DropZone 
              projectId={selectedProject?.id}
              onUploadSuccess={(symbols) => {
                setAstSymbols(symbols);
                showStatus(`Successfully parsed codebase, extracted ${symbols.length} AST symbols.`, 'success');
                setActiveTab('uml');
              }}
            />
          )}

          {activeTab === 'uml' && (
            <UMLCanvas />
          )}

          {activeTab === 'backlog' && (
            <EpicBoard />
          )}

          {activeTab === 'code' && (
            <CodeViewer />
          )}

          {activeTab === 'metrics' && (
            <PerformanceDashboard />
          )}

          {activeTab === 'admin' && (
            <AdminPortal />
          )}
        </main>
      </div>

      {/* Role Key settings overlay Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 bg-slate-950 border border-borderLine rounded-xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-slate-100 mb-2 flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-400" />
              <span>RBAC Key Configuration</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter the secret access key for the active role. The backend validates this key to authorize endpoints and log interactions securely.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                  Active Role Namespace
                </label>
                <div className="px-3 py-2 bg-slate-900 border border-borderLine text-slate-300 text-sm font-semibold rounded">
                  {activeRole.name} ({activeRole.value})
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                  X-ScrumMap-Role-Key Input
                </label>
                <input
                  type="password"
                  value={roleKey}
                  onChange={(e) => setRoleKey(e.target.value)}
                  placeholder="rk_your_role_secret"
                  className="w-full px-3 py-2 bg-slate-900 border border-borderLine text-slate-200 text-sm font-mono rounded focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 border border-borderLine text-slate-400 hover:text-slate-200 rounded transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveKey}
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded transition-all shadow-[0_2px_8px_rgba(37,99,235,0.4)]"
                >
                  Save Credentials
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
