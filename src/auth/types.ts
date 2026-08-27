export type UserRole = "user" | "admin";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  role: UserRole;
  /** Optional Azure AD object id for future account linking. */
  azureOid?: string;
  email?: string;
}

/** Public user shape returned by API (no secrets). */
export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  email?: string;
  createdAt: string;
}

export interface AuthSessionPayload {
  userId: string;
  exp: number;
}

export interface AuthProviderInfo {
  id: "local" | "azure";
  label: string;
  enabled: boolean;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
    createdAt: user.createdAt,
  };
}
