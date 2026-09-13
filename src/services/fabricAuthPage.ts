import { BrowserUtils } from '@azure/msal-browser';
import { runPopupRelay } from '@azure/msal-browser/popup-relay';
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

function hasAuthResponse(url: URL): boolean {
  if (url.pathname !== '/') return false;
  const hasResponse = [url.searchParams, new URLSearchParams(url.hash.slice(1))].some(
    (params) =>
      !!params.get('state') &&
      ['code', 'error', 'ear_jwe'].some((key) => params.has(key))
  );
  if (!hasResponse) return false;
  try {
    const { libraryState } = BrowserUtils.parseAuthResponseFromUrl();
    return ['popup', 'silent', 'redirect'].includes(libraryState.meta.interactionType);
  } catch {
    // Rayfin and application routes may also carry state; only MSAL owns this path.
    return false;
  }
}

function renderAuthStatus(message: string) {
  document.title = 'Connect Fabric · Chat Genie';
  const panel = document.createElement('main');
  panel.className = 'mx-auto max-w-lg px-8 py-12 text-slate-100';
  const heading = document.createElement('h1');
  heading.className = 'mb-4 text-2xl font-bold';
  heading.textContent = 'Connect Fabric';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.className = 'mb-6 text-sm text-slate-300';
  status.textContent = message;
  panel.append(heading, status);
  document.getElementById('root')!.replaceChildren(panel);
  return { panel, status };
}

/** Handle same-origin MSAL helper windows without starting the Fabric app. */
export async function handleFabricAuthPage(): Promise<boolean> {
  const url = new URL(window.location.href);
  if (url.pathname === '/' && url.searchParams.get('fabric-auth') === 'relay') {
    const { panel, status } = renderAuthStatus(
      'Continue to Microsoft sign-in to connect your reports and data agents.'
    );
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rounded-lg bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950';
    button.textContent = 'Continue to Microsoft sign-in';
    button.addEventListener('click', () => {
      button.disabled = true;
      try {
        // A click in this top-level window lets MSAL open its sign-in popup.
        // MSAL checks the response origin, source window, and request state.
        runPopupRelay({
          allowedAuthorityOrigins: ['https://login.microsoftonline.com'],
        });
        status.textContent = 'Complete Microsoft sign-in in the new window. This window closes when the connection is ready.';
      } catch {
        status.textContent = 'Microsoft sign-in could not start. Close this window and select Connect Fabric in Chat Genie to try again.';
      }
    });
    panel.append(button);
    return true;
  }

  if (!hasAuthResponse(url)) return false;

  const { status } = renderAuthStatus('Completing your Microsoft sign-in…');
  try {
    // The registered redirect is the existing app origin. The official bridge
    // validates MSAL's encoded state before returning a response to the relay.
    await broadcastResponseToMainFrame();
    status.textContent = 'Sign-in complete. You can close this window.';
  } catch {
    status.textContent = 'Microsoft sign-in could not complete. Close this window and select Connect Fabric in Chat Genie to try again.';
  }
  return true;
}
