// Caps how many AI requests the whole server will serve per UTC day, so a spike cannot run up the bill.
export function createDailyBudget(limit: number, now: () => Date = () => new Date()) {
  let day = "";
  let used = 0;

  return {
    take(): boolean {
      const today = now().toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        used = 0;
      }
      if (used >= limit) return false;
      used++;
      return true;
    },
  };
}
