import type { AccountInfo } from '@azure/msal-browser';

import {
  clearFabricAccount,
  connectFabric,
  getFabricAccount,
} from './fabricEntraAuth';
import type { AuthUser, IAuthService } from './IAuthService';

function toEntraUser(account: AccountInfo): AuthUser {
  if (!account.username) {
    throw new Error('Microsoft sign-in did not return an account email address.');
  }

  return {
    id: account.localAccountId || account.homeAccountId,
    email: account.username,
    name: account.name || account.username.split('@')[0],
  };
}

/**
 * Authentication adapter for static hosts that cannot use Fabric's Rayfin
 * session broker. It uses the same delegated scopes as the production portal.
 */
export class EntraAuthService implements IAuthService {
  readonly fabricAuthEnabled = true;

  async signIn(): Promise<AuthUser> {
    await connectFabric();
    const account = await getFabricAccount();
    if (!account) {
      throw new Error('Microsoft sign-in completed without selecting an account.');
    }
    return toEntraUser(account);
  }

  async signOut(): Promise<void> {
    await clearFabricAccount();
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const account = await getFabricAccount();
    return account ? toEntraUser(account) : null;
  }

  async initEmbeddedAuth(): Promise<AuthUser | null> {
    return this.getCurrentUser();
  }
}
