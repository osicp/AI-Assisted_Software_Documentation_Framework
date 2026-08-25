import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, Eye, EyeOff, ShieldAlert, Terminal, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { LedgerBlock } from '../lib/types';
import InfoTooltip from './InfoTooltip';

export default function AuditorConsole() {
  const [blocks, setBlocks] = useState<LedgerBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedPayload, setExpandedPayload] = useState<{ [id: number]: boolean }>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auditor terminal state
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isRunningAudit, setIsRunningAudit] = useState(false);

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

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] select-none">

      {/* View Title */}
      <div className="border-b border-borderLine pb-4">
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-sfBlue to-sfPurple bg-clip-text text-transparent">
          Auditor Console
        </h1>
        <p className="text-sm text-sfTextMuted mt-1">
          Inspect the immutable, cryptographically signed transaction ledger recorded for every privileged action.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Immutable Transaction Logs Viewer */}
        <div className="lg:col-span-2 glass rounded-xl p-5 border border-borderLine flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
          <div className="flex justify-between items-center border-b border-sfBorder pb-3 mb-4 shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sfTextMuted flex items-center gap-1.5">
              <Database className="w-4 h-4 text-sfSuccess" />
              <span>Immutable Ledger Blocks</span>
            </h3>
            <div className="flex items-center gap-2">
              <InfoTooltip text="Lists the immutable, cryptographically signed transaction blocks recorded for every privileged action, available for compliance auditing." />
              <button
                onClick={fetchLedgerLog}
                disabled={isLoading}
                className="p-1 rounded bg-white border border-sfBorder hover:bg-background text-sfTextMuted hover:text-sfTextPrimary transition-all disabled:opacity-50"
                title="Refresh Transaction Logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Logs List Screen */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {errorMessage ? (
              <div className="text-center py-20 px-4 border border-dashed border-sfError/30 bg-sfErrorBg rounded-lg text-sfError">
                <ShieldAlert className="w-8 h-8 text-sfError mx-auto mb-2" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Access Restrained</h4>
                <p className="text-[10px] mt-1.5 leading-normal">{errorMessage}</p>
              </div>
            ) : blocks.length === 0 && !isLoading ? (
              <div className="text-center py-20 text-sfTextMuted italic text-xs border border-dashed border-sfBorder rounded-lg">
                No ledger logs found. Make sure transactions are logged.
              </div>
            ) : (
              blocks.map((block) => {
                const isExpanded = !!expandedPayload[block.id];

                return (
                  <div key={block.id} className="p-3 bg-background border border-borderLine rounded-lg space-y-2 select-text font-mono text-[10px]">
                    <div className="flex justify-between items-center text-sfTextMuted">
                      <span className="font-bold text-sfTextPrimary">Block #{block.id}</span>
                      <span className="text-[9px]">{block.timestamp}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-sfTextMuted">Role ID:</span>
                        <span className="text-sfBlue font-semibold">{block.operator_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sfTextMuted">Event Type:</span>
                        <span className="text-sfPurple font-semibold">{block.transaction_type}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sfTextMuted">Payload Hash:</span>
                        <span className="text-sfTextMuted truncate max-w-[150px] text-[9px]" title={block.payload_hash}>{block.payload_hash}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sfTextMuted">Signature Check:</span>
                        <span className="text-sfSuccess text-[8px] truncate max-w-[150px]" title={block.block_signature}>{block.block_signature}</span>
                      </div>
                    </div>

                    {/* Expand payload content */}
                    {isExpanded && (
                      <div className="p-2 bg-white border border-borderLine rounded text-sfTextMuted whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed select-text mt-2 font-mono text-[9px] border-t border-sfBorder">
                        {JSON.stringify(JSON.parse(block.payload), null, 2)}
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => togglePayload(block.id)}
                        className="flex items-center gap-1.5 px-2 py-0.5 bg-white hover:bg-background border border-borderLine text-sfTextMuted hover:text-sfTextPrimary rounded font-sans"
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

        {/* Relational Ledger Auditor Card */}
        <div className="lg:col-span-1 glass rounded-xl p-5 border border-borderLine flex flex-col justify-between h-[calc(100vh-16rem)] min-h-[500px]">
          <div className="relative">
            <InfoTooltip text="Runs an integrity scan that verifies the SQLite ledger's transaction chain signatures and reports tampering status." className="absolute top-0 right-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-sfTextMuted mb-1 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-sfPurple" />
              <span>Relational Ledger Auditor</span>
            </h3>
            <p className="text-[10px] text-sfTextMuted leading-normal mb-4">
              Trigger a cryptographic signature verify scan on the SQLite transaction ledger table.
            </p>

            {/* Terminal Screen */}
            <div className="w-full bg-background border border-sfBorder rounded p-3 h-72 overflow-y-auto font-mono text-[9px] text-sfTextPrimary space-y-1.5 select-text">
              {terminalLogs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">{log}</div>
              ))}
              {terminalLogs.length === 0 && (
                <div className="text-sfTextMuted italic">Terminal ready. Click scan to verify database chains...</div>
              )}
            </div>
          </div>

          <button
            onClick={runLedgerAudit}
            disabled={isRunningAudit}
            className="flex items-center justify-center gap-2 w-full mt-4 py-2 bg-sfBlue hover:opacity-90 text-white rounded text-xs font-bold transition-all disabled:opacity-50 shadow-sm"
          >
            {isRunningAudit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-white" />}
            <span>Run Integrity Scan</span>
          </button>
        </div>

      </div>

    </div>
  );
}
