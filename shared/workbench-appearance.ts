export const appearanceThemes = ['render', 'warm', 'graphite', 'light'] as const;
export type AppearanceTheme = typeof appearanceThemes[number];
export interface WorkbenchAppearance {
  theme: AppearanceTheme;
  lineWidth: number;
  navigationCollapsed: boolean;
}
export const defaultAppearance: WorkbenchAppearance = {theme:'render',lineWidth:1,navigationCollapsed:false};
export function validAppearance(value:unknown):value is WorkbenchAppearance {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const v=value as WorkbenchAppearance;
  return appearanceThemes.includes(v.theme)&&Number.isFinite(v.lineWidth)&&v.lineWidth>=.5&&v.lineWidth<=3&&Number.isInteger(v.lineWidth*2)&&typeof v.navigationCollapsed==='boolean';
}
