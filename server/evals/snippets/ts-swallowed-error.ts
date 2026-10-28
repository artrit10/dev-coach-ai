import { readFile } from "node:fs/promises";

export async function loadConfig(path: string) {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text);
  } catch (error) {
    // ignore
  }
}
