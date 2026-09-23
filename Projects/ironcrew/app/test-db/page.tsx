import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function TestDatabase() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("test_connection")
    .select("*")
    .limit(10);

  if (error) {
    return (
      <div>
        <h1>🔴 Supabase connection failed</h1>
        <pre>{error.message}</pre>
      </div>
    );
  }

  return (
    <div>
      <h1>🟢 Supabase connected</h1>

      {data.map((row) => (
        <div key={row.id}>
          {row.message}
        </div>
      ))}
    </div>
  );
}
