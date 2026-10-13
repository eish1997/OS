export type ProjectSection = 'research' | 'results' | 'summary' | 'tasks' | 'drafts';
export interface ProjectView { section: ProjectSection; assetId?: string; query: string }
export type ProjectViews = Record<string, ProjectView>;
export function savedProjectViews(): ProjectViews {
  try {
    const saved = JSON.parse(localStorage.getItem('wb-project-views-v1') || '{}'); if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([, value]) => {
      const v = value as Partial<ProjectView>; return v && ['research', 'results', 'summary', 'tasks', 'drafts'].includes(String(v.section)) && (v.assetId === undefined || typeof v.assetId === 'string') && typeof v.query === 'string' && v.query.length <= 120;
    })) as ProjectViews;
  } catch { return {}; }
}
