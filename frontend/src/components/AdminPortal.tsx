import React, { useState, useEffect } from 'react';
import { Shield, Key, Database, RefreshCw, Eye, EyeOff, Check, X, ShieldAlert, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../lib/api';
import { LedgerBlock } from '../lib/types';

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

export default function AdminPortal() {
  const [blocks, setBlocks] = useState<LedgerBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedPayload, setExpandedPayload] = useState<{ [id: number]: boolean }>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Settings states (read-only/mock toggle selectors)
  const [zdrActive, setZdrActive] = useState(true);
  const [zipBombActive, setZipBombActive] = useState(true);
  const [promptCapActive, setPromptCapActive] = useState(true);

  const fetchLedgerLog = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await api.getLedgerBlocks();
      setBlocks(data);
    } catch (e: any) {
      console.error(e);
      const msg = e.response?.data?.detail || "You must authenticate with 'SECURITY_AUDITOR' or 'SYSTEM_ADMIN' credentials to access transaction logs.";
      setErrorMessage(msg);
      setBlocks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerLog();
  }, []);

  const togglePayload = (id: number) => {
    setExpandedPayload(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const hasAccess = (roleEndpoints: string[], endpoint: string) => {
    if (roleEndpoints.includes('* (All Endpoints & Schemas)')) return true;
    return roleEndpoints.includes(endpoint);
  };

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] select-none">
      
      {/* View Title */}
      <div className="border-b border-borderLine pb-4">
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
          Compliance & Administrative Portal
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Monitor system boundaries, verify endpoint permissions, and inspect the immutable transaction log records.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* 1. Left Side: Privilege Matrix & Safety Guardrails */}
        <div className="xl:col-span-2 space-y-8">
          
          {/* Endpoint Privilege Matrix Table */}
          <div className="glass rounded-xl p-5 border border-borderLine">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-blue-400" />
              <span>Role-Based Endpoint Privilege Matrix</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-sans border-collapse text-left select-none">
                <thead>
                  <tr className="border-b border-slate-900 text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 font-bold">Endpoint Route</th>
                    {PRIVILEGES.map((p, idx) => (
                      <th key={idx} className="py-2.5 px-3 text-center font-bold text-[10px]">{p.role}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 text-slate-300">
                  {ALL_ENDPOINTS.map((endpoint, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/10">
                      <td className="py-3 font-mono text-[10px] text-slate-400">{endpoint}</td>
                      {PRIVILEGES.map((roleObj, rIdx) => {
                        const allowed = hasAccess(roleObj.endpoints, endpoint);
                        return (
                          <td key={rIdx} className="py-3 px-3 text-center">
                            {allowed ? (
                              <Check className="w-4 h-4 text-emerald-500 mx-auto bg-emerald-500/10 p-0.5 rounded border border-emerald-500/20" />
                            ) : (
                              <X className="w-4 h-4 text-slate-700 mx-auto" />
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
          <div className="glass rounded-xl p-5 border border-borderLine grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 border-r border-slate-950 pr-4 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  <span>Guardrail Shield</span>
                </h4>
                <p className="text-[10px] text-slate-500 leading-normal mt-2">
                  System safety policies are hardcoded inside the container config environment (`scrummap.env`) and validated by the backend boundary threads.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-900/50">
                <span className="text-[10px] uppercase font-bold text-slate-500">Security Score:</span>
                <div className="text-2xl font-black text-emerald-400">100/100</div>
              </div>
            </div>

            <div className="md:col-span-2 space-y-4 font-sans text-xs">
              <div className="flex justify-between items-center bg-slate-900/40 p-3 rounded-lg border border-borderLine">
                <div>
                  <h5 className="font-semibold text-slate-200">Zero-Data Retention Compliance</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5">Wipes raw unzipped files from storage after compilation.</p>
                </div>
                <button onClick={() => setZdrActive(!zdrActive)}>
                  {zdrActive ? (
                    <ToggleRight className="w-8 h-8 text-emerald-500 cursor-pointer" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-slate-600 cursor-pointer" />
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center bg-slate-900/40 p-3 rounded-lg border border-borderLine">
                <div>
                  <h5 className="font-semibold text-slate-200">Zip-Bomb Protection Guardrails</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5">Blocks upload payloads exceeding 2.0GB size boundaries.</p>
                </div>
                <button onClick={() => setZipBombActive(!zipBombActive)}>
                  {zipBombActive ? (
                    <ToggleRight className="w-8 h-8 text-emerald-500 cursor-pointer" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-slate-600 cursor-pointer" />
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center bg-slate-900/40 p-3 rounded-lg border border-borderLine">
                <div>
                  <h5 className="font-semibold text-slate-200">3-Prompt Iterations Escalation Cap</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5">Requires human approval if LLM queries loop more than 3 times.</p>
                </div>
                <button onClick={() => setPromptCapActive(!promptCapActive)}>
                  {promptCapActive ? (
                    <ToggleRight className="w-8 h-8 text-emerald-500 cursor-pointer" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-slate-600 cursor-pointer" />
                  )}
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* 2. Right Side: Immutable Transaction Logs Viewer */}
        <div className="xl:col-span-1 glass rounded-xl p-5 border border-borderLine flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
          <div className="flex justify-between items-center border-b border-slate-900 pb-3 mb-4 shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Immutable Ledger Blocks</span>
            </h3>
            <button
              onClick={fetchLedgerLog}
              disabled={isLoading}
              className="p-1 rounded bg-slate-900 border border-borderLine hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50"
              title="Refresh Transaction Logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Logs List Screen */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {errorMessage ? (
              <div className="text-center py-20 px-4 border border-dashed border-rose-500/20 bg-rose-500/5 rounded-lg text-rose-400">
                <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Access Restrained</h4>
                <p className="text-[10px] mt-1.5 leading-normal">{errorMessage}</p>
              </div>
            ) : blocks.length === 0 && !isLoading ? (
              <div className="text-center py-20 text-slate-600 italic text-xs border border-dashed border-slate-900 rounded-lg">
                No ledger logs found. Make sure transactions are logged.
              </div>
            ) : (
              blocks.map((block) => {
                const isExpanded = !!expandedPayload[block.id];
                
                return (
                  <div key={block.id} className="p-3 bg-slate-900/40 border border-slate-900 rounded-lg space-y-2 select-text font-mono text-[10px]">
                    <div className="flex justify-between items-center text-slate-500">
                      <span className="font-bold text-slate-300">Block #{block.id}</span>
                      <span className="text-[9px]">{block.timestamp}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Role ID:</span>
                        <span className="text-blue-400 font-semibold">{block.operator_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Event Type:</span>
                        <span className="text-indigo-400 font-semibold">{block.transaction_type}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Payload Hash:</span>
                        <span className="text-slate-400 truncate max-w-[150px] text-[9px]" title={block.payload_hash}>{block.payload_hash}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Signature Check:</span>
                        <span className="text-emerald-400 text-[8px] truncate max-w-[150px]" title={block.block_signature}>{block.block_signature}</span>
                      </div>
                    </div>

                    {/* Expand payload content */}
                    {isExpanded && (
                      <div className="p-2 bg-black border border-slate-900 rounded text-slate-400 whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed select-text mt-2 font-mono text-[9px] border-t border-slate-950">
                        {JSON.stringify(JSON.parse(block.payload), null, 2)}
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => togglePayload(block.id)}
                        className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-950 hover:bg-slate-900 border border-borderLine text-slate-500 hover:text-slate-300 rounded font-sans"
                      >
                        {isExpanded ? (
                          <>
                            <EyeOff className="w-3 h-3" />
                            <span>Hide Data</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" />
                            <span>Inspect Payload</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
