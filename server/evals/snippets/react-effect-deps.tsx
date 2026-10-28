import { useEffect, useState } from "react";

export function Profile({ userId }: { userId: string }) {
  const [name, setName] = useState("");

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then((r) => r.json())
      .then((u) => setName(u.name));
  }, []);

  return <h1>{name}</h1>;
}
