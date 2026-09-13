import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const helpers = vi.hoisted(() => ({ relay: vi.fn(), bridge: vi.fn() }));
vi.mock('@azure/msal-browser/popup-relay', () => ({ runPopupRelay: helpers.relay }));
vi.mock('@azure/msal-browser/redirect-bridge', () => ({
  broadcastResponseToMainFrame: helpers.bridge,
}));

import { handleFabricAuthPage } from '@/services/fabricAuthPage';

beforeEach(() => {
  vi.resetAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
  window.history.replaceState(null, '', '/');
  helpers.bridge.mockResolvedValue(undefined);
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Fabric authentication helper pages', () => {
  it.each(['/', '/#reports', '/?state=filter', '/#code=not-an-auth-response'])(
    'leaves ordinary app navigation available for %s', async (path) => {
      window.history.replaceState(null, '', path);

      await expect(handleFabricAuthPage()).resolves.toBe(false);

      expect(helpers.bridge).not.toHaveBeenCalled();
      expect(helpers.relay).not.toHaveBeenCalled();
    });

  it('starts the trusted relay only after a click in the helper window', async () => {
    window.history.replaceState(null, '', '/?fabric-auth=relay#req=msal-request');

    await expect(handleFabricAuthPage()).resolves.toBe(true);
    expect(helpers.relay).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('button')!.click();

    expect(helpers.relay).toHaveBeenCalledWith({
      allowedAuthorityOrigins: ['https://login.microsoftonline.com'],
    });
    expect(document.querySelector('button')).toBeDisabled();
    expect(document.querySelector('[role=status]')).toHaveTextContent('Complete Microsoft sign-in');
  });

  it('shows recovery guidance when the relay cannot start', async () => {
    window.history.replaceState(null, '', '/?fabric-auth=relay');
    helpers.relay.mockImplementation(() => { throw new Error('popup_relay_no_opener'); });

    await handleFabricAuthPage();
    document.querySelector<HTMLButtonElement>('button')!.click();

    expect(document.querySelector('[role=status]')).toHaveTextContent('select Connect Fabric');
  });

  it.each(['/#code=auth-code', '/?error=access_denied', '/#ear_jwe=encrypted-response'])(
    'handles an auth response before app bootstrap for %s', async (path) => {
      const state = btoa(JSON.stringify({ id: 'request-id', meta: { interactionType: 'popup' } }));
      window.history.replaceState(null, '', `${path}&state=${encodeURIComponent(state)}`);

      await expect(handleFabricAuthPage()).resolves.toBe(true);

      expect(helpers.bridge).toHaveBeenCalledOnce();
      expect(helpers.relay).not.toHaveBeenCalled();
    });

  it('leaves non-MSAL callback state to the app', async () => {
    window.history.replaceState(null, '', '/#code=auth-code&state=not-valid-state');

    await expect(handleFabricAuthPage()).resolves.toBe(false);

    expect(helpers.bridge).not.toHaveBeenCalled();
    expect(window.location.hash).toContain('state=not-valid-state');
  });

  it('returns a valid response to the top-level relay through the official bridge', async () => {
    const realBridge = await vi.importActual<typeof import('@azure/msal-browser/redirect-bridge')>(
      '@azure/msal-browser/redirect-bridge'
    );
    helpers.bridge.mockImplementation(realBridge.broadcastResponseToMainFrame);
    const postMessage = vi.fn();
    const channelClose = vi.fn();
    const channels = vi.fn();
    vi.stubGlobal('BroadcastChannel', class {
      constructor(name: string) { channels(name); }
      postMessage = postMessage;
      close = channelClose;
    });
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const state = btoa(JSON.stringify({ id: 'request-id', meta: { interactionType: 'popup' } }));
    const response = new URLSearchParams({ code: 'auth-code', state }).toString();
    window.history.replaceState(null, '', `/#${response}`);

    await expect(handleFabricAuthPage()).resolves.toBe(true);

    expect(channels).toHaveBeenCalledWith('request-id');
    expect(postMessage).toHaveBeenCalledWith({ v: 1, payload: response });
    expect(channelClose).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('');
  });
});
