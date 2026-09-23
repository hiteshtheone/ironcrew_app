import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET() {
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request) {
  const { first_name } = await request.json();

  if (typeof first_name !== "string" || !first_name.trim()) {
    return NextResponse.json({ error: "A first_name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({ first_name: first_name.trim() })
    .select("id, first_name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
