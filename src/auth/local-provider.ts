import { hashPassword, verifyPassword } from "./password.js";
import type { UserStore } from "./user-store.js";
import type { User } from "./types.js";

const MIN_PASSWORD = 8;

export class LocalPasswordProvider {
  constructor(private readonly users: UserStore) {}

  async register(username: string, password: string): Promise<User> {
    if (!password || password.length < MIN_PASSWORD) {
      throw new Error(`Password must be at least ${MIN_PASSWORD} characters`);
    }
    const { hash, salt } = await hashPassword(password);
    const count = await this.users.count();
    return this.users.create({
      username,
      passwordHash: hash,
      salt,
      role: count === 0 ? "admin" : "user",
    });
  }

  async login(username: string, password: string): Promise<User> {
    const user = await this.users.findByUsername(username);
    if (!user) throw new Error("Invalid username or password");
    const ok = await verifyPassword(password, user.salt, user.passwordHash);
    if (!ok) throw new Error("Invalid username or password");
    return user;
  }
}
