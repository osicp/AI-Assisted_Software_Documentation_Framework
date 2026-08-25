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

export interface Developer {
  id: string;
  name: string;
  is_lead: boolean;
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
  assigned_developer_ids?: string[];
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
  db_latency: string;
  purification_compression: string;
  avg_tokens_per_generation: string;
  verification_tax: string;
  prompt_iterations: string;
  corrective_prompts: string;
  git_diff_lines: string;
  validation_failures: string;
  percent_iterations: number;
  percent_corrective: number;
  percent_git: number;
  percent_validation: number;
  tokens_per_item: string;
  inference_latency: string;
  hallucination_drift: string;
  cycle_time: string;
  machine_latency: string;
  scoping_duration: string;
  raw_size_bytes: number;
  purified_size_bytes: number;
  prompt_tokens: number;
  completion_tokens: number;
}
