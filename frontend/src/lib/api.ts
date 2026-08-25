import axios from 'axios';
import { Project, UserStory, ASTSymbol, LedgerBlock, AuditReport, BacklogGenerationResult, TelemetryMetrics, Developer } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000` : 'http://localhost:8000');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Attach the selected role key to all request headers
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const key = localStorage.getItem('scrummap_role_key');
      if (key) {
        config.headers['X-ScrumMap-Role-Key'] = key;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const api = {
  // Projects
  async getProjects(): Promise<Project[]> {
    const res = await apiClient.get('/api/projects');
    return res.data;
  },

  async createProject(name: string, description?: string): Promise<{ project_id: string; status: string }> {
    const res = await apiClient.post('/api/projects', {
      name,
      description: description || ''
    });
    return res.data;
  },

  async deleteProject(projectId: string): Promise<{ status: string; project_id: string }> {
    const res = await apiClient.delete(`/api/projects/${projectId}`);
    return res.data;
  },

  // Codebase file upload
  async uploadCodebase(
    projectId: string,
    versionTag: string,
    file: File,
    onUploadProgress?: (progressEvent: any) => void
  ): Promise<{
    version_id: string;
    zip_checksum: string;
    raw_size_bytes: number;
    purified_size_bytes: number;
    reduction_percentage: string;
    status: string;
    ast_symbols: ASTSymbol[];
  }> {
    const formData = new FormData();
    formData.append('codebase_zip', file, file.name);
    
    const res = await apiClient.post('/api/codebase/upload', formData, {
      params: {
        project_id: projectId,
        version_tag: versionTag,
      },
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
    return res.data;
  },

  // Backlog compilation
  async generateBacklog(
    projectId: string,
    sprintGoal: string,
    astSymbols: ASTSymbol[],
    refinedRequirements?: string,
    answers?: {[key: string]: string}
  ): Promise<any> {
    const res = await apiClient.post('/api/backlog/generate', {
      project_id: projectId,
      sprint_goal: sprintGoal,
      ast_symbols: astSymbols,
      refined_requirements: refinedRequirements || '',
      answers: answers || null,
    });
    return res.data;
  },

  // SBERT clustering
  async clusterBacklog(userStories: string[], nClusters: number = 3): Promise<any> {
    const res = await apiClient.post('/api/backlog/cluster', {
      user_stories: userStories,
      n_clusters: nClusters,
    });
    return res.data;
  },

  // UML Diagrams
  async renderUml(plantumlCode: string): Promise<{ status: string; render_url: string }> {
    const res = await apiClient.post('/api/uml/render', {
      plantuml_code: plantumlCode,
    });
    return res.data;
  },

  async verifyUml(classDiagram: string, sequenceDiagram: string): Promise<any> {
    const res = await apiClient.post('/api/uml/verify', {
      class_diagram: classDiagram,
      sequence_diagram: sequenceDiagram,
    });
    return res.data;
  },

  // Immutable Ledger checks
  async verifyLedger(
    startId: number = 1,
    chunkSize?: number,
    expectedPrevSig?: string
  ): Promise<AuditReport> {
    const params: any = { start_id: startId };
    if (chunkSize) params.chunk_size = chunkSize;
    if (expectedPrevSig) params.expected_prev_sig = expectedPrevSig;

    const res = await apiClient.get('/api/ledger/verify', { params });
    return res.data;
  },

  async getLedgerBlocks(): Promise<LedgerBlock[]> {
    const res = await apiClient.get('/api/ledger/blocks');
    return res.data;
  },

  async getTelemetry(projectId?: string): Promise<TelemetryMetrics> {
    const params = projectId ? { project_id: projectId } : {};
    const res = await apiClient.get('/api/metrics/telemetry', { params });
    return res.data;
  },

  // Report Compiler (PDF Export)
  async downloadPdfReport(
    projectName: string,
    projectDescription: string,
    userStories: UserStory[],
    classDiagramUrl?: string,
    sequenceDiagramUrl?: string,
    projectId?: string,
    includeTimeline?: boolean
  ): Promise<Blob> {
    const res = await apiClient.post(
      '/api/project/report/pdf',
      {
        project_name: projectName,
        project_description: projectDescription,
        user_stories: userStories,
        class_diagram_url: classDiagramUrl || '',
        sequence_diagram_url: sequenceDiagramUrl || '',
        project_id: projectId || '',
        include_timeline: !!includeTimeline,
      },
      { responseType: 'blob' }
    );
    return res.data;
  },

  async getBacklog(projectId: string): Promise<UserStory[]> {
    const res = await apiClient.get(`/api/projects/${projectId}/backlog`);
    return res.data;
  },

  async getDevelopers(projectId: string): Promise<Developer[]> {
    const res = await apiClient.get(`/api/projects/${projectId}/developers`);
    return res.data;
  },

  async addDeveloper(projectId: string, name: string, isLead: boolean = false): Promise<Developer> {
    const res = await apiClient.post(`/api/projects/${projectId}/developers`, {
      name,
      is_lead: isLead
    });
    return res.data;
  },

  async deleteDeveloper(projectId: string, devId: string): Promise<{ status: string }> {
    const res = await apiClient.delete(`/api/projects/${projectId}/developers/${devId}`);
    return res.data;
  },

  async assignStory(projectId: string, storyId: string, developerIds: string[]): Promise<{ status: string; assigned_developer_ids: string[] }> {
    const res = await apiClient.post(`/api/backlog/${storyId}/assign`, {
      developer_ids: developerIds,
      project_id: projectId
    });
    return res.data;
  },

  async checkHealth(): Promise<boolean> {
    try {
      const res = await apiClient.get('/api/health');
      return res.data && res.data.status === 'healthy';
    } catch {
      return false;
    }
  }
};
