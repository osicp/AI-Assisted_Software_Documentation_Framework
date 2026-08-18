export interface Project {
  id: string;
  name: string;
  description: string | null;
}

export interface CodePointer {
  file: string;
  lines: string;
  symbols: string[];
}

export interface UserStory {
  id: string;
  epic_title?: string;
  role: string;
  action: string;
  benefit: string;
  story_points: number;
  unhappy_paths: string[];
  code_pointers: CodePointer[];
}

export interface ASTSymbol {
  name: string;
  kind: string;
  path: string;
  line: number;
  scope: string | null;
  signature: string | null;
}

export interface LedgerBlock {
  id: number;
  project_id: string | null;
  timestamp: string;
  operator_id: string;
  transaction_type: string;
  payload: string;
  payload_hash: string;
  block_signature: string;
  prev_block_signature: string;
}

export interface SequenceFlowStep {
  sender: string;
  receiver: string;
  message: string;
}

export interface BacklogEpic {
  epic_id?: string;
  title: string;
  user_stories: UserStory[];
}

export interface BacklogGenerationResult {
  epics: BacklogEpic[];
  sequence_flow: SequenceFlowStep[];
}

export interface AuditReport {
  ledger_integrity: "OK" | "TAMPERED";
  scanned_blocks: number;
  compromised_blocks: number[];
  verification_timestamp: string;
  last_verified_id: number | null;
  last_block_signature: string | null;
}

export interface TelemetryMetrics {
  db_wal_latency_ms: number;
  purification_compression_pct: number;
  context_caching_savings_pct: number;
  v_tax: number;
  prompt_iterations: number;
  corrective_prompts: number;
  git_diff_distance: number;
  validation_failures: number;
}
