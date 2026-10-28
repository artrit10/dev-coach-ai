import { useState } from "react";

export function TodoList({ initial }: { initial: string[] }) {
  const [todos, setTodos] = useState(initial);

  return (
    <ul>
      {todos.map((todo, index) => (
        <li key={index}>
          <input defaultValue={todo} />
          <button onClick={() => setTodos(todos.filter((_, i) => i !== index))}>Remove</button>
        </li>
      ))}
    </ul>
  );
}
