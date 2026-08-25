import React, { useState } from 'react';
import { Shield, Check, X, ShieldAlert, ToggleLeft, ToggleRight, Key } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

const PRIVILEGES = [
  { role: 'Product Manager', key: 'ROLE_KEY_PRODUCT_MANAGER', endpoints: ['POST /api/projects', 'POST /api/backlog/generate', 'POST /api/project/report/pdf', 'POST /api/uml/verify'] },
  { role: 'Scrum Master', key: 'ROLE_KEY_SCRUM_MASTER', endpoints: ['POST /api/project/report/pdf'] },
  { role: 'Lead Developer', key: 'ROLE_KEY_LEAD_DEVELOPER', endpoints: ['POST /api/codebase/upload', 'POST /api/uml/render', 'POST /api/uml/verify', 'POST /api/backlog/generate'] },
  { role: 'Security Auditor', key: 'ROLE_KEY_SECURITY_AUDITOR', endpoints: ['GET /api/ledger/verify', 'GET /api/ledger/blocks', 'POST /api/project/report/pdf'] },
  { role: 'System Admin', key: 'ROLE_KEY_SYSTEM_ADMIN', endpoints: ['* (All Endpoints & Schemas)'] }
];

const ALL_ENDPOINTS = [
  'POST /api/projects',
  'POST /api/codebase/upload',
  'POST /api/backlog/generate',
  'POST /api/uml/render',
  'POST /api/uml/verify',
  'GET /api/ledger/verify',
  'GET /api/ledger/blocks',
  'POST /api/project/report/pdf'
];

interface AdminPortalProps {
  setShowAuthModal: (show: boolean) => void;
  isServerOnline: boolean | null;
}

export default function AdminPortal({ setShowAuthModal, isServerOnline }: AdminPortalProps) {
  // Settings states (read-only/mock toggle selectors)
  const [zdrActive, setZdrActive] = useState(true);
  const [zipBombActive, setZipBombActive] = useState(true);
  const [promptCapActive, setPromptCapActive] = useState(true);

  const hasAccess = (roleEndpoints: string[], endpoint: string) => {
    if (roleEndpoints.includes('* (All Endpoints & Schemas)')) return true;
    return roleEndpoints.includes(endpoint);
  };

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] select-none">
      
      {/* View Title */}
      <div className="border-b border-borderLine pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-sfBlue to-sfPurple bg-clip-text text-transparent">
            Configuration & Keys
          </h1>
          <p className="text-sm text-sfTextMuted mt-1">
            Review role-based endpoint permissions and manage system safety guardrails.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Server-status Indicator */}
          {isServerOnline === null && (
            <div className="flex items-center gap-1.5 border border-sfBorder bg-background px-3 py-1.5 rounded-full animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-sfTextMuted" />
              <span className="text-[10px] uppercase font-bold text-sfTextMuted">Connecting...</span>
            </div>
          )}
          {isServerOnline === true && (
            <div className="flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase font-bold text-emerald-700">Online</span>
            </div>
          )}
          {isServerOnline === false && (
            <div className="flex items-center gap-1.5 border border-rose-200 bg-rose-50 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-[10px] uppercase font-bold text-rose-700">Offline</span>
            </div>
          )}

          {/* Key Settings Button */}
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-sfBlue hover:opacity-90 text-white shadow-sm transition-all"
            title="Manage RBAC Credentials Key"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Key Settings</span>
          </button>
        </div>
      </div>

      <div className="space-y-8">

        {/* Endpoint Privilege Matrix Table */}
        <div className="glass rounded-xl p-5 border border-borderLine relative">
            <InfoTooltip text="Shows which user roles are authorized to call each backend API endpoint, based on their assigned role key." className="absolute top-3 right-3" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-sfTextMuted mb-4 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-sfBlue" />
              <span>Role-Based Endpoint Privilege Matrix</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-sans border-collapse text-left select-none">
                <thead>
                  <tr className="border-b border-sfBorder text-sfTextMuted uppercase tracking-wider">
                    <th className="py-2.5 font-bold">Endpoint Route</th>
                    {PRIVILEGES.map((p, idx) => (
                      <th key={idx} className="py-2.5 px-3 text-center font-bold text-[10px]">{p.role}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderLine text-sfTextPrimary">
                  {ALL_ENDPOINTS.map((endpoint, idx) => (
                    <tr key={idx} className="hover:bg-background">
                      <td className="py-3 font-mono text-[10px] text-sfTextMuted">{endpoint}</td>
                      {PRIVILEGES.map((roleObj, rIdx) => {
                        const allowed = hasAccess(roleObj.endpoints, endpoint);
                        return (
                          <td key={rIdx} className="py-3 px-3 text-center">
                            {allowed ? (
                              <Check className="w-4 h-4 text-sfSuccess mx-auto bg-sfSuccessBg p-0.5 rounded border border-sfSuccess/20" />
                            ) : (
                              <X className="w-4 h-4 text-sfTextMuted mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Security Health Score & Workstation Guardrails */}
          <div className="glass rounded-xl p-5 border border-borderLine grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <InfoTooltip text="Displays the hardcoded safety guardrails protecting the system: data retention wiping, upload size limits, and LLM iteration caps." className="absolute top-3 right-3" />
            <div className="md:col-span-1 border-r border-sfBorder pr-4 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-sfTextMuted mb-1 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-sfWarning" />
                  <span>Guardrail Shield</span>
                </h4>
                <p className="text-[10px] text-sfTextMuted leading-normal mt-2">
                  System safety policies are hardcoded inside the container config environment (`scrummap.env`) and validated by the backend boundary threads.
                </p>
              </div>
            </div>

            <div className="md:col-span-2 space-y-4 font-sans text-xs">
              <div className="flex justify-between items-center bg-background p-3 rounded-lg border border-borderLine">
                <div>
                  <h5 className="font-semibold text-sfTextPrimary">Zero-Data Retention Compliance</h5>
                  <p className="text-[10px] text-sfTextMuted mt-0.5">Wipes raw unzipped files from storage after compilation.</p>
                </div>
                <button onClick={() => setZdrActive(!zdrActive)}>
                  {zdrActive ? (
                    <ToggleRight className="w-8 h-8 text-sfSuccess cursor-pointer" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-sfTextMuted cursor-pointer" />
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center bg-background p-3 rounded-lg border border-borderLine">
                <div>
                  <h5 className="font-semibold text-sfTextPrimary">Zip-Bomb Protection Guardrails</h5>
                  <p className="text-[10px] text-sfTextMuted mt-0.5">Blocks upload payloads exceeding 2.0GB size boundaries.</p>
                </div>
                <button onClick={() => setZipBombActive(!zipBombActive)}>
                  {zipBombActive ? (
                    <ToggleRight className="w-8 h-8 text-sfSuccess cursor-pointer" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-sfTextMuted cursor-pointer" />
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center bg-background p-3 rounded-lg border border-borderLine">
                <div>
                  <h5 className="font-semibold text-sfTextPrimary">3-Prompt Iterations Escalation Cap</h5>
                  <p className="text-[10px] text-sfTextMuted mt-0.5">Requires human approval if LLM queries loop more than 3 times.</p>
                </div>
                <button onClick={() => setPromptCapActive(!promptCapActive)}>
                  {promptCapActive ? (
                    <ToggleRight className="w-8 h-8 text-sfSuccess cursor-pointer" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-sfTextMuted cursor-pointer" />
                  )}
                </button>
              </div>
            </div>
          </div>

      </div>

    </div>
  );
}
