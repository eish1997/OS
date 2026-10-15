import React from 'react';
const paths = {
  switch:'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4',
  plus:'M12 5v14M5 12h14',close:'m6 6 12 12M18 6 6 18',
  space:'M4 4h16v16H4zM4 10h16M10 10v10',
  float:'M14 4h6v6M20 4l-9 9M10 4H4v16h16v-6',
  dock:'M4 4h16v16H4zM14 4v16',
  pin:'m9 3 6 0-1 6 4 4H6l4-4zM12 13v8',
  minus:'M5 12h14',splitX:'M4 4h16v16H4zM12 4v16',splitY:'M4 4h16v16H4zM4 12h16',
  settings:'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  sidebar:'M4 4h16v16H4zM9 4v16',back:'M19 12H5m6-6-6 6 6 6',
  grip:'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',
  resize:'M9 20 20 9M15 20l5-5',
} as const;
export function Icon({name}:{name:keyof typeof paths}){return <svg className="wb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;}
