import { createClient } from "npm:@supabase/supabase-js@2";

const getCorsHeaders = (reqOrigin: string | null) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://hotel-mantri-test-env.vercel.app",
    "https://hotelmantri.com",
    "https://www.hotelmantri.com"
  ];
  const origin = reqOrigin && allowedOrigins.includes(reqOrigin) ? reqOrigin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-request-id",
  };
};

Deno.serve(async (req: Request) => {
  const reqOrigin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(reqOrigin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action, confirm } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const environment = (Deno.env.get("ENVIRONMENT") || Deno.env.get("NODE_ENV") || "").toLowerCase();
    const allowDestructive = Deno.env.get("ALLOW_DESTRUCTIVE_DB_TOOLS") === "true";

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Verify caller is super_admin ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
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
    const userEmail = userData.user.email ?? "";

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

    // ── Helper: Audit Logging ───────────────────────────────────────────────────
    const logDbToolsAudit = async (actionName: string, deletedCount: number) => {
      try {
        await adminClient.from("audit_logs").insert({
          user_id: userId,
          user_email: userEmail,
          role: "super_admin",
          action: `db_tools:${actionName}`,
          module: "database_tools",
          hotel_id: null,
          record_id: actionName,
          metadata: {
            deleted_count: deletedCount,
            environment,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (logErr) {
        console.warn("[db-tools] Audit log error:", logErr);
      }
    };

    // ── Destructive Action Guard (H3) ──────────────────────────────────────────
    const DESTRUCTIVE_ACTIONS = [
      "reset_demo_data",
      "delete_all_daily_reports",
      "delete_all_room_charts",
      "delete_all_expenses",
      "delete_all_salary_records",
      "delete_all_staff",
      "delete_demo_hotels",
    ];

    if (DESTRUCTIVE_ACTIONS.includes(action)) {
      if (environment === "production") {
        return new Response(
          JSON.stringify({ error: "Destructive database tools are strictly disabled in production environment." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!allowDestructive) {
        return new Response(
          JSON.stringify({ error: "Destructive database operations are disabled. Set ALLOW_DESTRUCTIVE_DB_TOOLS=true to enable." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (confirm !== "DELETE-ALL-DATA") {
        return new Response(
          JSON.stringify({ error: 'Confirmation required. You must provide confirm="DELETE-ALL-DATA" in request body.' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Helper: get protected hotel IDs ────────────────────────────────────────
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
      const deleted = count ?? 0;
      await logDbToolsAudit(action, deleted);
      return new Response(
        JSON.stringify({ success: true, deleted }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ACTION: delete_all_room_charts ─────────────────────────────────────────
    if (action === "delete_all_room_charts") {
      const { count } = await adminClient.from("room_chart_entries").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      const deleted = count ?? 0;
      await logDbToolsAudit(action, deleted);
      return new Response(
        JSON.stringify({ success: true, deleted }),
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
      await logDbToolsAudit(action, total);
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
      await logDbToolsAudit(action, total);
      return new Response(
        JSON.stringify({ success: true, deleted: total }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ACTION: delete_all_staff ────────────────────────────────────────────────
    if (action === "delete_all_staff") {
      const { count } = await adminClient.from("staff").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
      const deleted = count ?? 0;
      await logDbToolsAudit(action, deleted);
      return new Response(
        JSON.stringify({ success: true, deleted }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ACTION: delete_demo_hotels ──────────────────────────────────────────────
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
      await adminClient.from("hotel_settings").delete().in("id", demoIds);
      await adminClient.from("company_sources").delete().in("hotel_id", demoIds);
      await adminClient.from("expense_categories").delete().in("hotel_id", demoIds);
      const { count } = await adminClient.from("hotels").delete({ count: "exact" }).in("id", demoIds);
      const deleted = count ?? 0;
      await logDbToolsAudit(action, deleted);
      return new Response(
        JSON.stringify({ success: true, deleted }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ACTION: reset_demo_data ──────────────────────────────────────────────────
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
      await logDbToolsAudit(action, total);
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
