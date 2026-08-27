import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Db } from "../db/client.js";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import type { User, UserRole } from "./types.js";

function rowToUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    salt: row.salt,
    createdAt: row.createdAt,
    role: row.role as UserRole,
    email: row.email ?? undefined,
    azureOid: row.azureOid ?? undefined,
  };
}

export class UserStore {
  private readonly db: Db;

  constructor(db?: Db) {
    this.db = db ?? getDb();
  }

  async ensure(): Promise<void> {
    // Tables are created by migrations; no-op for API compatibility.
  }

  async count(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(users);
    return result[0]?.count ?? 0;
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const key = username.trim().toLowerCase();
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.usernameLower, key))
      .limit(1);
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async create(input: {
    username: string;
    passwordHash: string;
    salt: string;
    role: UserRole;
    email?: string;
    azureOid?: string;
  }): Promise<User> {
    const username = input.username.trim();
    if (!username || username.length < 2) {
      throw new Error("Username must be at least 2 characters");
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      throw new Error("Username may only contain letters, numbers, dots, underscores, and hyphens");
    }

    const existing = await this.findByUsername(username);
    if (existing) {
      throw new Error("Username already taken");
    }

    const user: User = {
      id: `user-${randomBytes(8).toString("hex")}`,
      username,
      passwordHash: input.passwordHash,
      salt: input.salt,
      createdAt: new Date().toISOString(),
      role: input.role,
      email: input.email,
      azureOid: input.azureOid,
    };

    await this.db.insert(users).values({
      id: user.id,
      username: user.username,
      usernameLower: user.username.toLowerCase(),
      passwordHash: user.passwordHash,
      salt: user.salt,
      role: user.role,
      email: user.email ?? null,
      azureOid: user.azureOid ?? null,
      createdAt: user.createdAt,
    });

    return user;
  }

  /** Ensure a dedicated CLI owner user exists (username `cli`). */
  async ensureCliUser(): Promise<User> {
    const fromEnv = process.env.AE_CLI_USER_ID?.trim();
    if (fromEnv) {
      const existing = await this.findById(fromEnv);
      if (existing) return existing;
      throw new Error(`AE_CLI_USER_ID=${fromEnv} does not match any user`);
    }

    const existing = await this.findByUsername("cli");
    if (existing) return existing;

    const count = await this.count();
    // Placeholder credentials — CLI does not log in as this user via password.
    const salt = randomBytes(16).toString("hex");
    const passwordHash = randomBytes(32).toString("hex");
    return this.create({
      username: "cli",
      passwordHash,
      salt,
      role: count === 0 ? "admin" : "user",
    });
  }
}
