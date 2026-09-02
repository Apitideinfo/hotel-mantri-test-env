import { createClient } from "npm:@supabase/supabase-js@2";

// Helper to generate CORS headers dynamically based on request origin
const getCorsHeaders = (reqOrigin: string | null) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "https://hotel-mantri-test-env.vercel.app",
    "https://hotelmantri.com",
    "https://www.hotelmantri.com"
  ];
  const origin = reqOrigin && allowedOrigins.includes(reqOrigin) ? reqOrigin : allowedOrigins[0];
  
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
};

Deno.serve(async (req: Request) => {
  const reqOrigin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(reqOrigin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Extract JWT from Bearer token
    const jwt = authHeader.replace("Bearer ", "").trim();

    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized", details: authError?.message || "No user found" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is a super_admin via an RPC or query
    const { data: isSuperAdmin } = await userClient.rpc("is_super_admin");
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: Super Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── ACTION: create_hotel_admin ──────────────────────────────────────────
    if (action === "create_hotel_admin" || !action) {
      const { email, password, hotel_id, role } = body;
      if (!email || !password || !hotel_id) {
        return new Response(JSON.stringify({ error: "Email, password, and hotel_id are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) throw listError;
      const existing = listData.users.find((u) => u.email === email);
      let userId: string;

      if (existing) {
        userId = existing.id;
        const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password, email_confirm: true });
        if (updateError) throw updateError;
      } else {
        const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
        if (createError) throw createError;
        userId = newUserData.user.id;
      }

      const assignedRole = role || "hotel_admin";
      if (assignedRole !== "super_admin") {
        const { error: linkError } = await adminClient
          .from("hotel_admins")
          .upsert({ user_id: userId, hotel_id, role: assignedRole, status: "Active", email }, { onConflict: "user_id,hotel_id" });
        if (linkError) throw linkError;
      } else {
        const { error: linkError } = await adminClient
          .from("hotel_admins")
          .upsert({ user_id: userId, hotel_id: null, role: "super_admin", status: "Active", email }, { onConflict: "user_id,hotel_id" });
        if (linkError) throw linkError;
      }

      return new Response(JSON.stringify({ success: true, userId, email, role: assignedRole }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: reset_password ───────────────────────────────────────────────
    if (action === "reset_password") {
      const { email, password } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) throw listError;
      const existing = listData.users.find((u) => u.email === email);
      if (!existing) {
        return new Response(JSON.stringify({ error: "No user found with that email" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
      if (updateError) throw updateError;
      return new Response(JSON.stringify({ success: true, email }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: create_company_user ──────────────────────────────────────────
    if (action === "create_company_user") {
      const { email, password, name, role } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) throw listError;
      const existing = listData.users.find((u) => u.email === email);
      let userId: string;

      if (existing) {
        userId = existing.id;
        const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password, email_confirm: true });
        if (updateError) throw updateError;
      } else {
        const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { name, role },
        });
        if (createError) throw createError;
        userId = newUserData.user.id;
      }
      return new Response(JSON.stringify({ success: true, userId, email }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: remove_company_user ──────────────────────────────────────────
    if (action === "remove_company_user") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true, user_id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: delete_hotel ─────────────────────────────────────────────
    if (action === "deactivate_hotel" || action === "delete_hotel") {
      const { hotel_id } = body;
      if (!hotel_id) {
        return new Response(JSON.stringify({ error: "hotel_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // We explicitly DO NOT delete from auth.users here to prevent the Super Admin
      // from accidentally deleting their own global account when deleting a hotel.
      // The hotel deletion will cascade to hotel_admins and other tables.
      
      const { error: deleteHotelError } = await adminClient
        .from("hotels")
        .delete()
        .eq("id", hotel_id);

      if (deleteHotelError) {
        return new Response(JSON.stringify({ error: deleteHotelError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, hotel_id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // We must re-extract origin safely because req might not be available or parsed if it crashed above, 
    // but Deno.serve provides `req` in scope.
    const reqOrigin = req.headers.get("Origin");
    const corsHeaders = getCorsHeaders(reqOrigin);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
