import { beforeEach, describe, expect, it, vi } from 'vitest';

const msal = vi.hoisted(() => ({
  initialize: vi.fn(),
  handleRedirectPromise: vi.fn(),
  getAllAccounts: vi.fn(),
  acquireTokenSilent: vi.fn(),
  acquireTokenPopup: vi.fn(),
  acquireTokenRedirect: vi.fn(),
  constructor: vi.fn(),
}));

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: class {
    constructor(config: unknown) { msal.constructor(config); }
    initialize = msal.initialize;
    handleRedirectPromise = msal.handleRedirectPromise;
    getAllAccounts = msal.getAllAccounts;
    acquireTokenSilent = msal.acquireTokenSilent;
    acquireTokenPopup = msal.acquireTokenPopup;
    acquireTokenRedirect = msal.acquireTokenRedirect;
  },
  InteractionRequiredAuthError: class extends Error {},
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  msal.initialize.mockResolvedValue(undefined);
  msal.handleRedirectPromise.mockResolvedValue(null);
  msal.getAllAccounts.mockReturnValue([]);
});

describe('Fabric delegated authentication', () => {
  it('requires an explicit connection before opening Microsoft sign-in', async () => {
    const { getFabricAccessToken } = await import('@/services/fabricEntraAuth');

    await expect(getFabricAccessToken()).rejects.toThrow('Select Connect Fabric');

    expect(msal.acquireTokenPopup).not.toHaveBeenCalled();
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled();
  });

  it('connects through the same-origin relay and reuses the returned account', async () => {
    const account = { homeAccountId: 'fabric-user' };
    msal.acquireTokenPopup.mockResolvedValue({ account, accessToken: 'popup-token' });
    msal.acquireTokenSilent.mockResolvedValue({ accessToken: 'silent-token' });
    const { getFabricAccessToken } = await import('@/services/fabricEntraAuth');

    await expect(getFabricAccessToken(true)).resolves.toBe('popup-token');
    await expect(getFabricAccessToken()).resolves.toBe('silent-token');

    expect(msal.constructor).toHaveBeenCalledWith(expect.objectContaining({
      auth: expect.objectContaining({
        redirectUri: window.location.origin,
        popupRelayUri: `${window.location.origin}/?fabric-auth=relay`,
      }),
    }));
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({ account }));
    expect(msal.acquireTokenPopup).toHaveBeenCalledOnce();
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled();
  });

  it('shares the initial token request between report and agent discovery', async () => {
    msal.getAllAccounts.mockReturnValue([{ homeAccountId: 'fabric-user' }]);
    msal.acquireTokenSilent.mockResolvedValue({ accessToken: 'shared-token' });
    const { getFabricAccessToken } = await import('@/services/fabricEntraAuth');

    await expect(Promise.all([getFabricAccessToken(), getFabricAccessToken()]))
      .resolves.toEqual(['shared-token', 'shared-token']);

    expect(msal.initialize).toHaveBeenCalledOnce();
    expect(msal.acquireTokenSilent).toHaveBeenCalledOnce();
  });

  it('acquires a signed-in user Power BI token with read-only report scopes', async () => {
    const account = { homeAccountId: 'fabric-user' };
    msal.getAllAccounts.mockReturnValue([account]);
    msal.acquireTokenSilent.mockResolvedValue({ accessToken: 'power-bi-token' });
    const { getPowerBiAccessToken } = await import('@/services/fabricEntraAuth');

    await expect(getPowerBiAccessToken()).resolves.toBe('power-bi-token');

    expect(msal.acquireTokenSilent).toHaveBeenCalledWith({
      account,
      scopes: [
        'https://analysis.windows.net/powerbi/api/Report.Read.All',
        'https://analysis.windows.net/powerbi/api/Dataset.Read.All',
      ],
    });
  });

  it('connects Fabric and Power BI in one user-initiated popup', async () => {
    msal.acquireTokenPopup.mockResolvedValue({
      account: { homeAccountId: 'fabric-user' },
      accessToken: 'connection-token',
    });
    const { connectFabric } = await import('@/services/fabricEntraAuth');

    await expect(connectFabric()).resolves.toBe('connection-token');

    expect(msal.acquireTokenPopup).toHaveBeenCalledWith({
      scopes: [
        'https://analysis.windows.net/powerbi/api/UserDataFunction.Execute.All',
        'https://analysis.windows.net/powerbi/api/Report.Read.All',
        'https://analysis.windows.net/powerbi/api/Dataset.Read.All',
      ],
    });
  });

  it('uses the relay after silent authentication requires user interaction', async () => {
    const { InteractionRequiredAuthError } = await import('@azure/msal-browser');
    msal.getAllAccounts.mockReturnValue([{ homeAccountId: 'fabric-user' }]);
    msal.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError('interaction_required', 'test-correlation'));
    msal.acquireTokenPopup.mockResolvedValue({ accessToken: 'new-token', account: null });
    const { getFabricAccessToken } = await import('@/services/fabricEntraAuth');

    await expect(getFabricAccessToken()).rejects.toThrow('Select Connect Fabric');
    expect(msal.acquireTokenPopup).not.toHaveBeenCalled();
    await expect(getFabricAccessToken(true)).resolves.toBe('new-token');
    expect(msal.acquireTokenSilent).toHaveBeenCalledOnce();
  });

  it('allows retrying a canceled popup without leaving a pending request', async () => {
    msal.acquireTokenPopup
      .mockRejectedValueOnce(new Error('user_cancelled'))
      .mockResolvedValueOnce({ accessToken: 'retry-token', account: null });
    const { getFabricAccessToken } = await import('@/services/fabricEntraAuth');

    await expect(getFabricAccessToken(true)).rejects.toThrow('user_cancelled');
    await expect(getFabricAccessToken(true)).resolves.toBe('retry-token');
  });
});
