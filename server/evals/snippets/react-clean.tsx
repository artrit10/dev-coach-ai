import { useState } from "react";

type CounterProps = { initial?: number; step?: number };

export function Counter({ initial = 0, step = 1 }: CounterProps) {
  const [count, setCount] = useState(initial);

  return (
    <div>
      <button onClick={() => setCount((c) => c - step)} aria-label="Decrease">-</button>
      <output aria-live="polite">{count}</output>
      <button onClick={() => setCount((c) => c + step)} aria-label="Increase">+</button>
    </div>
  );
}
