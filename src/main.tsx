import { handleFabricAuthPage } from '@/services/fabricAuthPage';

import './main.css';

// Authentication helper windows must finish before Fabric SSO or routing starts.
if (!(await handleFabricAuthPage())) {
  await import('./renderApp');
}
