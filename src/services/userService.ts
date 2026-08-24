import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { users, type User } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/password";
import { ConflictError, UnauthorizedError } from "./errors";
import type { RegisterInput } from "../schemas";

/**
 * User service — registration and credential verification.
 */
export class UserService {
  constructor(private readonly db: Database) {}

  async register(input: RegisterInput): Promise<User> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictError("A user with this email already exists.");
    }
    const passwordHash = await hashPassword(input.password);
    const [created] = await this.db
      .insert(users)
      .values({ email: input.email, passwordHash })
      .returning();
    if (!created) {
      throw new Error("Failed to create user.");
    }
    return created;
  }

  async verifyCredentials(email: string, password: string): Promise<User> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedError();
    }
    return user;
  }
}