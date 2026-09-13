import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const portal = vi.hoisted(() => ({
  askAgent: vi.fn(),
  connectFabric: vi.fn(),
  getEmbedConfig: vi.fn(),
  listAgents: vi.fn(),
  listReports: vi.fn(),
}));

vi.mock('@/services/biPortalService', () => portal);
vi.mock('@/hooks/AuthContext', () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { name: 'Test User' } }),
}));
vi.mock('powerbi-client', () => ({
  factories: {},
  models: {},
  service: { Service: class {} },
}));

import { HomePage } from '@/pages/HomePage';

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

describe('Fabric portal reconnection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    portal.listReports.mockRejectedValue(new Error('Fabric connection required.'));
    portal.listAgents.mockResolvedValue([]);
  });

  it('shows a failed interactive sign-in and lets the user retry', async () => {
    portal.connectFabric.mockRejectedValue(new Error('The sign-in popup was blocked.'));
    renderHomePage();

    await userEvent.click(await screen.findByRole('button', { name: 'Connect Fabric' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The sign-in popup was blocked.');
    expect(screen.getByRole('button', { name: 'Connect Fabric' })).toBeEnabled();
    expect(portal.listReports).toHaveBeenCalledTimes(1);
  });

  it('reloads discovery after sign-in without navigating away from the Fabric iframe', async () => {
    portal.connectFabric.mockResolvedValue('test-token');
    renderHomePage();
    const connectButton = await screen.findByRole('button', { name: 'Connect Fabric' });
    portal.listReports.mockResolvedValue([]);

    await userEvent.click(connectButton);

    await waitFor(() => expect(portal.listReports).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(portal.listAgents).toHaveBeenCalledTimes(2);
  });
});

