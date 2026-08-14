import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Verify caller is super_admin ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token || token === anonKey) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userId = userData.user.id;

    const { data: adminRows } = await adminClient
      .from("hotel_admins")
      .select("role")
      .eq("user_id", userId);

    const isSuperAdmin = (adminRows ?? []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Super Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Helper: get protected hotel IDs ────────────────────────────────────────
    // Protected = hotels that have at least one hotel_admin (non-super_admin) linked.
    const getProtectedHotelIds = async (): Promise<Set<string>> => {
      const { data } = await adminClient
        .from("hotel_admins")
        .select("hotel_id")
        .not("hotel_id", "is", null)
        .neq("role", "super_admin");
      return new Set((data ?? []).map((r: { hotel_id: string }) => r.hotel_id));
    };

    // ── ACTION: delete_all_daily_reports ───────────────────────────────────────
    if (action === "delete_all_daily_reports") {
      const { count } = await adminClient.from("daily_reports").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      return new Response(
        JSON.stringify({ success: true, deleted: count ?? 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ACTION: delete_all_room_charts ─────────────────────────────────────────
    if (action === "delete_all_room_charts") {
      const { count } = await adminClient.from("room_chart_entries").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      return new Response(
        JSON.stringify({ success: true, deleted: count ?? 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ACTION: delete_all_expenses ────────────────────────────────────────────
    if (action === "delete_all_expenses") {
      const { count: e1 } = await adminClient.from("expense_entries").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      const { count: e2 } = await adminClient.from("other_daily_entries").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      const { count: e3 } = await adminClient.from("utility_bills").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      const { count: e4 } = await adminClient.from("electricity_readings").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      const { count: e5 } = await adminClient.from("monthly_bills").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      const total = (e1 ?? 0) + (e2 ?? 0) + (e3 ?? 0) + (e4 ?? 0) + (e5 ?? 0);
      return new Response(
        JSON.stringify({ success: true, deleted: total }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ACTION: delete_all_salary_records ──────────────────────────────────────
    if (action === "delete_all_salary_records") {
      const { count: s1 } = await adminClient.from("salary_advances").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      const { count: s2 } = await adminClient.from("salary_settlements").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      const total = (s1 ?? 0) + (s2 ?? 0);
      return new Response(
        JSON.stringify({ success: true, deleted: total }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ACTION: delete_all_staff ────────────────────────────────────────────────
    if (action === "delete_all_staff") {
      const { count } = await adminClient.from("staff").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      return new Response(
        JSON.stringify({ success: true, deleted: count ?? 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ACTION: delete_demo_hotels ──────────────────────────────────────────────
    // Deletes hotels that do NOT have a hotel_admin linked (demo hotels).
    // Never deletes protected hotels (those with a real hotel_admin).
    if (action === "delete_demo_hotels") {
      const protectedIds = await getProtectedHotelIds();
      const { data: allHotels } = await adminClient.from("hotels").select("id, hotel_name");
      const demoHotels = (allHotels ?? []).filter((h: { id: string }) => !protectedIds.has(h.id));
      if (demoHotels.length === 0) {
        return new Response(
          JSON.stringify({ success: true, deleted: 0, message: "No demo hotels found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const demoIds = demoHotels.map((h: { id: string }) => h.id);
      // Delete hotel_settings rows for demo hotels first (FK)
      await adminClient.from("hotel_settings").delete().in("id", demoIds);
      // Delete company_sources for demo hotels
      await adminClient.from("company_sources").delete().in("hotel_id", demoIds);
      // Delete expense_categories for demo hotels
      await adminClient.from("expense_categories").delete().in("hotel_id", demoIds);
      // Delete the hotels
      const { count } = await adminClient.from("hotels").delete({ count: "exact" }).in("id", demoIds);
      return new Response(
        JSON.stringify({ success: true, deleted: count ?? 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ACTION: reset_demo_data ──────────────────────────────────────────────────
    // Clears all transactional data across all hotels (daily reports, room charts,
    // expenses, salary records, staff, laundry) but keeps hotels, settings, plans,
    // and admin accounts intact.
    if (action === "reset_demo_data") {
      let total = 0;
      const tables = [
        "daily_reports", "room_chart_entries", "other_daily_entries",
        "expense_entries", "utility_bills", "electricity_readings",
        "monthly_bills", "salary_advances", "salary_settlements",
        "staff", "laundry_entries",
      ];
      for (const table of tables) {
        const { count } = await adminClient.from(table).delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
        total += count ?? 0;
      }
      return new Response(
        JSON.stringify({ success: true, deleted: total }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
