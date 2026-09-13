import {
  AccountInfo,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser';

const clientId =
  import.meta.env.VITE_FABRIC_ENTRA_CLIENT_ID ||
  '98c11bf8-bd1a-42a3-9385-93d9e706df67';
const tenantId =
  import.meta.env.VITE_FABRIC_ENTRA_TENANT_ID ||
  '2cb8edaf-a612-48cc-bcef-80bc609f9c25';
const fabricScopes = [
  'https://analysis.windows.net/powerbi/api/UserDataFunction.Execute.All',
];
const powerBiScopes = [
  'https://analysis.windows.net/powerbi/api/Report.Read.All',
  'https://analysis.windows.net/powerbi/api/Dataset.Read.All',
];
const connectionScopes = [...fabricScopes, ...powerBiScopes];

let applicationPromise: Promise<PublicClientApplication> | undefined;
let account: AccountInfo | undefined;
let fabricTokenPromise: Promise<string> | undefined;
let powerBiTokenPromise: Promise<string> | undefined;

async function getApplication() {
  applicationPromise ??= (async () => {
    const application = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: window.location.origin,
        // The relay returns the popup response across Fabric's storage partition.
        popupRelayUri: `${window.location.origin}/?fabric-auth=relay`,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    });
    await application.initialize();
    await application.handleRedirectPromise();
    return application;
  })();
  return applicationPromise;
}

export async function getFabricAccessToken(interactive = false): Promise<string> {
  fabricTokenPromise ??= acquireAccessToken(
    fabricScopes,
    interactive,
    'Fabric'
  );
  try {
    return await fabricTokenPromise;
  } finally {
    fabricTokenPromise = undefined;
  }
}

export async function getPowerBiAccessToken(interactive = false): Promise<string> {
  powerBiTokenPromise ??= acquireAccessToken(
    powerBiScopes,
    interactive,
    'Power BI'
  );
  try {
    return await powerBiTokenPromise;
  } finally {
    powerBiTokenPromise = undefined;
  }
}

export function connectFabric(): Promise<string> {
  return acquireAccessToken(connectionScopes, true, 'Fabric');
}

async function acquireAccessToken(
  scopes: string[],
  interactive: boolean,
  serviceName: string
): Promise<string> {
  const application = await getApplication();
  account ??= application.getAllAccounts()[0];

  if (interactive) {
    // Connect Fabric is a user gesture. Open its popup before a network refresh
    // can consume that gesture and cause the browser to block the popup.
    const result = await application.acquireTokenPopup({ scopes });
    account = result.account ?? undefined;
    return result.accessToken;
  }

  if (account) {
    try {
      const silentResult = await application.acquireTokenSilent({
        account,
        scopes,
      });
      return silentResult.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        throw new Error(
          `${serviceName} connection required. Select Connect Fabric to continue.`
        );
      }
      throw error;
    }
  }

  throw new Error(
    `${serviceName} connection required. Select Connect Fabric to continue.`
  );
}
