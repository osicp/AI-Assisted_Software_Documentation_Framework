import axios from 'axios';
import { Project, UserStory, ASTSymbol, LedgerBlock, AuditReport } from './types';

const API_BASE_URL = 'http://localhost:8000';

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
    sprintGoal: string,
    astSymbols: ASTSymbol[],
    refinedRequirements?: string
  ): Promise<{ user_stories: UserStory[] }> {
    const res = await apiClient.post('/api/backlog/generate', {
      sprint_goal: sprintGoal,
      ast_symbols: astSymbols,
      refined_requirements: refinedRequirements || '',
    });
    
    let stories: UserStory[] = [];
    if (res.data && Array.isArray(res.data.epics)) {
      res.data.epics.forEach((epic: any) => {
        if (epic.user_stories && Array.isArray(epic.user_stories)) {
          stories = stories.concat(epic.user_stories);
        }
      });
    } else if (res.data && Array.isArray(res.data.user_stories)) {
      stories = res.data.user_stories;
    }
    
    return { user_stories: stories };
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

  // Report Compiler (PDF Export)
  async downloadPdfReport(
    projectName: string,
    projectDescription: string,
    userStories: UserStory[],
    classDiagramUrl?: string,
    projectId?: string
  ): Promise<Blob> {
    const res = await apiClient.post(
      '/api/project/report/pdf',
      {
        project_name: projectName,
        project_description: projectDescription,
        user_stories: userStories,
        class_diagram_url: classDiagramUrl || '',
        project_id: projectId || '',
      },
      { responseType: 'blob' }
    );
    return res.data;
  }
};
