import { createRoot } from 'react-dom/client';

import App from '@/App';
import { AuthProvider } from '@/hooks/AuthContext';
import { bootstrapAuth } from '@/services/bootstrap';

const authService = await bootstrapAuth();

createRoot(document.getElementById('root')!).render(
  <AuthProvider authService={authService}>
    <App />
  </AuthProvider>
);
