import type { IncomingMessage } from "node:http";
import type { Db } from "../db/client.js";
import { AzureOidcProvider } from "./azure-provider.js";
import { LocalPasswordProvider } from "./local-provider.js";
import {
  COOKIE_NAME,
  buildSetCookie,
  createSessionToken,
  parseCookies,
  resolveSessionSecret,
  shouldUseSecureCookie,
  verifySession,
} from "./session-cookie.js";
import { UserStore } from "./user-store.js";
import {
  toPublicUser,
  type AuthProviderInfo,
  type PublicUser,
  type User,
} from "./types.js";

export type { AuthProviderInfo, PublicUser, User };
export { toPublicUser, COOKIE_NAME };

export class AuthService {
  readonly users: UserStore;
  readonly local: LocalPasswordProvider;
  readonly azure: AzureOidcProvider;
  private secret = "";

  constructor(db?: Db) {
    this.users = new UserStore(db);
    this.local = new LocalPasswordProvider(this.users);
    this.azure = new AzureOidcProvider();
  }

  async init(): Promise<void> {
    await this.users.ensure();
    this.secret = resolveSessionSecret();
  }

  listProviders(): AuthProviderInfo[] {
    return [
      { id: "local", label: "Username / password", enabled: true },
      {
        id: "azure",
        label: "Microsoft (Azure AD)",
        enabled: this.azure.isConfigured(),
      },
    ];
  }

  async register(username: string, password: string): Promise<User> {
    return this.local.register(username, password);
  }

  async login(username: string, password: string): Promise<User> {
    return this.local.login(username, password);
  }

  mintCookie(userId: string, reqSecureHint: boolean): string {
    const token = createSessionToken(userId, this.secret);
    return buildSetCookie(token, { secure: shouldUseSecureCookie(reqSecureHint) });
  }

  clearCookie(reqSecureHint: boolean): string {
    return buildSetCookie(null, { secure: shouldUseSecureCookie(reqSecureHint) });
  }

  async requireUser(req: IncomingMessage): Promise<User | null> {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    const payload = verifySession(token, this.secret);
    if (!payload) return null;
    return this.users.findById(payload.userId);
  }

  async me(req: IncomingMessage): Promise<PublicUser | null> {
    const user = await this.requireUser(req);
    return user ? toPublicUser(user) : null;
  }

  canAccessSession(
    user: User,
    session: { ownerUserId?: string },
  ): boolean {
    if (user.role === "admin") return true;
    if (!session.ownerUserId) return false;
    return session.ownerUserId === user.id;
  }
}
