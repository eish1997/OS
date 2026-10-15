// Separate entry chunks keep legacy global CSS out of the new workspace.
if (location.pathname.startsWith('/legacy')) void import('./main');
else void import('./workbench/app');
