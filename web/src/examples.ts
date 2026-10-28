export type Example = {
  id: string;
  label: string;
  language: "typescript" | "react" | "dotnet";
  code: string;
};

export const EXAMPLES: Example[] = [
  {
    id: "ts-sql",
    label: "TypeScript: user lookup",
    language: "typescript",
    code: `import { Pool } from "pg";

const pool = new Pool();

export async function getUser(id: any) {
  const result = await pool.query("SELECT * FROM users WHERE id = " + id);
  return result.rows[0];
}

export async function deleteUsers(ids: string[]) {
  ids.forEach(async (id) => {
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
  });
}
`,
  },
  {
    id: "react-list",
    label: "React: user list",
    language: "react",
    code: `import { useEffect, useState } from "react";

export function UserList({ team }: { team: string }) {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/users?team=" + team)
      .then((r) => r.json())
      .then(setUsers);
  }, []);

  return (
    <ul>
      {users.map((u, i) => (
        <li key={i} dangerouslySetInnerHTML={{ __html: u.bio }} />
      ))}
    </ul>
  );
}
`,
  },
  {
    id: "dotnet-service",
    label: ".NET: order service",
    language: "dotnet",
    code: `public class OrderService
{
    private readonly string _connection = "Server=db;User=sa;Password=P@ssw0rd123;";

    public async void SaveOrder(Order order)
    {
        using var client = new HttpClient();
        var response = client.GetStringAsync("https://api.example.com/tax/" + order.Country).Result;

        using var conn = new SqlConnection(_connection);
        conn.Open();
        var cmd = new SqlCommand("INSERT INTO Orders (Customer) VALUES ('" + order.Customer + "')", conn);
        cmd.ExecuteNonQuery();
    }
}
`,
  },
];
