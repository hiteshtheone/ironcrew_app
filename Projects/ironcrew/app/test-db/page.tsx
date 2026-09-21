import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function TestDatabase() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("test_connection")
    .select("*")
    .limit(10);

  return (
    <div style={{ padding: "40px" }}>
      <h1>Supabase Database Test</h1>

      <h2>Data:</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>

      <h2>Error:</h2>
      <pre>{JSON.stringify(error, null, 2)}</pre>
    </div>
  );
}
