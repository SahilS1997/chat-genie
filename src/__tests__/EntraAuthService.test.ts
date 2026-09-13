import { beforeEach, describe, expect, it, vi } from 'vitest';

const fabricAuth = vi.hoisted(() => ({
  clearFabricAccount: vi.fn(),
  connectFabric: vi.fn(),
  getFabricAccount: vi.fn(),
}));

vi.mock('@/services/fabricEntraAuth', () => fabricAuth);

import { EntraAuthService } from '@/services/EntraAuthService';

describe('EntraAuthService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses the Fabric connection flow and maps the selected Microsoft account', async () => {
    fabricAuth.connectFabric.mockResolvedValue('fabric-token');
    fabricAuth.getFabricAccount.mockResolvedValue({
      homeAccountId: 'home-account',
      localAccountId: 'local-account',
      username: 'sahil@example.com',
      name: 'Sahil Sreedharan',
    });

    await expect(new EntraAuthService().signIn()).resolves.toEqual({
      id: 'local-account',
      email: 'sahil@example.com',
      name: 'Sahil Sreedharan',
    });

    expect(fabricAuth.connectFabric).toHaveBeenCalledOnce();
  });

  it('returns no user when no Microsoft account is cached', async () => {
    fabricAuth.getFabricAccount.mockResolvedValue(null);

    await expect(new EntraAuthService().getCurrentUser()).resolves.toBeNull();
  });

  it('clears the local MSAL account on sign-out', async () => {
    await new EntraAuthService().signOut();

    expect(fabricAuth.clearFabricAccount).toHaveBeenCalledOnce();
  });
});
