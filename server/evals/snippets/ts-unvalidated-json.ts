interface Settings {
  theme: "light" | "dark";
  pageSize: number;
}

export function loadSettings(raw: string): Settings {
  return JSON.parse(raw) as Settings;
}
