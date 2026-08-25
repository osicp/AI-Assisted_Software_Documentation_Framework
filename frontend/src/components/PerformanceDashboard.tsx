import React, { useState, useEffect } from 'react';
import { Activity, Cpu, Percent, BarChart3, HelpCircle, HardDrive, Sparkles, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { TelemetryMetrics } from '../lib/types';
import InfoTooltip from './InfoTooltip';

interface PerformanceDashboardProps {
  projectId?: string;
}

export default function PerformanceDashboard({ projectId }: PerformanceDashboardProps) {
  const [telemetry, setTelemetry] = useState<TelemetryMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchTelemetry = async () => {
      setIsLoading(true);
      setFetchFailed(false);
      try {
        const data = await api.getTelemetry(projectId);
        if (active) {
          setTelemetry(data);
        }
      } catch (err) {
        console.error("Failed to fetch telemetry metrics", err);
        if (active) {
          setTelemetry(null);
          setFetchFailed(true);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };
    fetchTelemetry();
    return () => {
      active = false;
    };
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3 select-none text-sfTextMuted font-mono text-xs">
        <Loader2 className="w-8 h-8 text-sfBlue animate-spin" />
        <span>Loading live database telemetry metrics...</span>
      </div>
    );
  }

  if (fetchFailed || !telemetry) {
    return (
      <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] select-none">
        <div className="border-b border-borderLine pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-sfTextPrimary">
            KPI Metrics & Observability
          </h1>
          <p className="text-sm text-sfTextMuted mt-1">
            Monitor system transaction speeds, token budgets, compression indexes, and developer telemetry logs.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center h-72 gap-3 text-center border border-dashed border-sfError/30 bg-sfErrorBg rounded-xl">
          <AlertTriangle className="w-8 h-8 text-sfError" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-sfError">Could Not Load Live Telemetry</h4>
          <p className="text-[11px] text-sfError max-w-sm leading-relaxed">
            The telemetry API could not be reached. No metrics are shown rather than stale or placeholder values.
          </p>
        </div>
      </div>
    );
  }

  const kpis = [
    {
      name: 'DB WAL Write Latency',
      value: telemetry.db_latency,
      target: '< 5 ms',
      desc: 'Database transaction write latency in non-blocking WAL mode.',
      tooltip: 'Measures how quickly writes commit to the database log; lower latency keeps the app responsive under concurrent access.',
      icon: HardDrive,
      color: 'text-sfSuccess',
    },
    {
      name: 'Purification Compression',
      value: telemetry.purification_compression,
      target: '~ 35%',
      desc: 'File size reduction after structural comments and logging purification.',
      tooltip: 'Tracks how much smaller the codebase gets after stripping comments and logging, which directly lowers LLM context size and cost.',
      icon: Percent,
      color: 'text-sfBlue',
    },
    {
      name: 'Avg Tokens / Generation',
      value: telemetry.avg_tokens_per_generation,
      target: 'Track over time',
      desc: 'Average total LLM tokens (prompt + completion) consumed per backlog-generation run for this project.',
      tooltip: 'Averaged across every successful backlog generation for this project, using the real token usage reported by the LLM gateway.',
      icon: Sparkles,
      color: 'text-sfPurple',
    },
    {
      name: 'Verification Tax (V_tax)',
      value: telemetry.verification_tax,
      target: '< 5.0',
      desc: 'Relative human effort rating (prompt corrections per task).',
      tooltip: 'Quantifies how many manual corrections a task needs after LLM output, signaling how much human oversight is still required.',
      icon: HelpCircle,
      color: 'text-sfBlue',
    },
    {
      name: 'Tokens per Backlog Item',
      value: telemetry.tokens_per_item,
      target: '< 1,500',
      desc: 'Average LLM token load (input + output) per compiled story, from the latest generation run.',
      tooltip: 'Averages combined input and output tokens spent per backlog item, used to estimate and control ongoing API costs.',
      icon: BarChart3,
      color: 'text-sfPurple',
    },
    {
      name: 'LLM Inference Latency',
      value: telemetry.inference_latency,
      target: '< 3.0 s',
      desc: 'Turnaround speed of the latest LLM gateway prompt-response call.',
      tooltip: 'Times the round trip from sending a prompt to receiving the model response, a key driver of perceived tool responsiveness.',
      icon: Activity,
      color: 'text-sfBlue',
    },
    {
      name: 'Hallucination Drift Index',
      value: telemetry.hallucination_drift,
      target: '< 10.0%',
      desc: 'Share of symbols the latest backlog claims to modify in existing files that do not actually exist there.',
      tooltip: 'Only checks claims about files that already exist in your codebase; new files the backlog proposes for planned work are not counted as drift.',
      icon: HelpCircle,
      color: 'text-sfPurple',
    },
    {
      name: 'Active Machine Latency',
      value: telemetry.machine_latency,
      target: '< 15.0 s',
      desc: 'Sum of measured codebase parsing time, LLM inference time, and database read time.',
      tooltip: 'Sums the end-to-end pipeline time across parsing, LLM calls, and database access for the latest run.',
      icon: Cpu,
      color: 'text-sfBlue',
    },
    {
      name: 'Total Scoping Duration',
      value: telemetry.scoping_duration,
      target: '< 15.0 min',
      desc: 'Elapsed time between the first codebase upload and the latest PDF compile for this project.',
      tooltip: 'Reports 0.0 min until a PDF has actually been compiled for this project — it measures a completed cycle, not an in-progress guess.',
      icon: Loader2,
      color: 'text-sfPurple',
    }
  ];

  const telemetryMetrics = [
    { label: 'Prompt Iterations (I_p)', value: telemetry.prompt_iterations, target: 'Max 5', percent: telemetry.percent_iterations },
    { label: 'Corrective Prompts (C_prompts)', value: telemetry.corrective_prompts, target: 'Max 3', percent: telemetry.percent_corrective },
    { label: 'Backlog Revision Delta (D_edit)', value: telemetry.git_diff_lines, target: 'Average 50', percent: telemetry.percent_git },
    { label: 'Validation Failures (F_val)', value: telemetry.validation_failures, target: '0', percent: telemetry.percent_validation }
  ];

  const rawSizeBytes = telemetry.raw_size_bytes;
  const purifiedSizeBytes = telemetry.purified_size_bytes;
  const promptTokens = telemetry.prompt_tokens;
  const completionTokens = telemetry.completion_tokens;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] select-none">

      {/* View Title */}
      <div className="border-b border-borderLine pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-sfTextPrimary">
          KPI Metrics & Observability
        </h1>
        <p className="text-sm text-sfTextMuted mt-1">
          Monitor system transaction speeds, token budgets, compression indexes, and developer telemetry logs.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div key={idx} className="relative glass glass-hover rounded-xl p-5 border border-borderLine flex flex-col justify-between h-48">
              <InfoTooltip text={kpi.tooltip} className="absolute top-3 right-11" />
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase tracking-wider text-sfTextMuted font-bold">{kpi.name}</span>
                <Icon className={`w-5 h-5 ${kpi.color}`} />
              </div>

              <div className="my-3">
                <div className="text-3xl font-black text-sfTextPrimary font-mono tracking-tight">{kpi.value}</div>
                <div className="text-[10px] text-sfTextMuted mt-1">Target Threshold: {kpi.target}</div>
              </div>

              <div className="border-t border-sfBorder pt-3">
                <p className="text-[10px] text-sfTextMuted leading-relaxed font-sans">{kpi.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom panels: Telemetry logs & historical curves */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Interaction Effort Tracker logs */}
        <div className="relative lg:col-span-1 glass rounded-xl p-5 border border-borderLine flex flex-col justify-between">
          <InfoTooltip text="Tracks how much manual back-and-forth (iterations, corrections, edits, and failures) was needed to reach a working result." className="absolute top-3 right-3" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-sfTextMuted mb-4 flex items-center gap-1.5 border-b border-sfBorder pb-2">
              <Activity className="w-3.5 h-3.5 text-sfBlue" />
              <span>Effort Tracker Telemetry</span>
            </h3>

            <div className="space-y-4 font-sans text-xs pt-2">
              {telemetryMetrics.map((metric, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-sfTextPrimary">
                    <span className="font-semibold">{metric.label}</span>
                    <span className="font-mono text-sfTextMuted">{metric.value} <span className="text-sfTextMuted/70 text-[10px]">/ {metric.target}</span></span>
                  </div>
                  <div className="w-full bg-background h-2 rounded-full overflow-hidden border border-sfBorder">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        metric.value === '0' ? 'bg-sfBorder' : 'bg-sfBlue'
                      }`}
                      style={{ width: `${metric.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-sfBorder flex justify-between items-center text-[10px] text-sfTextMuted font-mono">
            <span>Status: Normal Range</span>
            <span className="text-sfSuccess flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Optimized</span>
            </span>
          </div>
        </div>

        {/* Caching & Compression comparison visualizer */}
        <div className="relative lg:col-span-2 glass rounded-xl p-5 border border-borderLine">
          <InfoTooltip text="Visualizes real storage savings from code purification alongside the real prompt/completion token split of the latest backlog generation." className="absolute top-3 right-3" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-sfTextMuted mb-4 flex items-center gap-1.5 border-b border-sfBorder pb-2">
            <Cpu className="w-3.5 h-3.5 text-sfPurple" />
            <span>Resource Compression & API Optimization Indexes</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 select-none">
            {/* Compression Chart representation */}
            <div className="space-y-4">
              <h4 className="text-[10px] uppercase font-bold text-sfTextMuted">Purified Storage Savings</h4>
              <div className="flex items-end gap-3 h-28 pt-4 border-b border-sfBorder px-2 font-mono text-[9px] text-sfTextMuted">
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-background border border-sfBorder h-24 rounded-t relative">
                    <div className="absolute bottom-0 left-0 right-0 bg-sfBlue/20 h-full border-t border-sfBlue" />
                  </div>
                  <span>Raw Zip ({formatBytes(rawSizeBytes)})</span>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-background border border-sfBorder h-24 rounded-t relative">
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-sfSuccess/30 border-t border-sfSuccess"
                      style={{ height: `${Math.min(100, Math.max(5, (purifiedSizeBytes / Math.max(1, rawSizeBytes)) * 100))}%` }}
                    />
                  </div>
                  <span className="text-sfSuccess font-bold">-{formatBytes(Math.max(0, rawSizeBytes - purifiedSizeBytes))}</span>
                </div>
              </div>
              <p className="text-[10px] text-sfTextMuted leading-normal font-sans">
                {rawSizeBytes > 0
                  ? `Syntactic purification strips unused spacing, lines, and docstrings, compressing the codebase payload from ${formatBytes(rawSizeBytes)} down to ${formatBytes(purifiedSizeBytes)} before forwarding to LLM contexts.`
                  : 'Upload a codebase to measure real purification savings for this project.'}
              </p>
            </div>

            {/* Token Usage Breakdown */}
            <div className="space-y-4">
              <h4 className="text-[10px] uppercase font-bold text-sfTextMuted">Token Usage Breakdown</h4>
              <div className="flex items-end gap-3 h-28 pt-4 border-b border-sfBorder px-2 font-mono text-[9px] text-sfTextMuted">
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-background border border-sfBorder h-24 rounded-t relative">
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-sfBlue/20 h-full border-t border-sfBlue"
                      style={{ height: `${Math.max(5, (promptTokens / Math.max(1, promptTokens + completionTokens)) * 100)}%` }}
                    />
                  </div>
                  <span>Prompt ({promptTokens.toLocaleString()})</span>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-background border border-sfBorder h-24 rounded-t relative">
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-sfPurple/30 border-t border-sfPurple"
                      style={{ height: `${Math.max(5, (completionTokens / Math.max(1, promptTokens + completionTokens)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sfPurple font-bold">Completion ({completionTokens.toLocaleString()})</span>
                </div>
              </div>
              <p className="text-[10px] text-sfTextMuted leading-normal font-sans">
                {promptTokens + completionTokens > 0
                  ? `The latest backlog generation used ${promptTokens.toLocaleString()} prompt tokens and ${completionTokens.toLocaleString()} completion tokens, as reported by the LLM gateway.`
                  : 'Generate a backlog to measure real token usage for this project.'}
              </p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
