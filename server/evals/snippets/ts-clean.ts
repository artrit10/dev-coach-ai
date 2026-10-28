import { z } from "zod";

const userSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export type User = z.infer<typeof userSchema>;

export async function fetchUser(id: number, signal?: AbortSignal): Promise<User> {
  const response = await fetch(`/api/users/${encodeURIComponent(String(id))}`, { signal });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return userSchema.parse(await response.json());
}
