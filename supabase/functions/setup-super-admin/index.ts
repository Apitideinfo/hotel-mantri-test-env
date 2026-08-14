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

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── ACTION: create_hotel_admin ──────────────────────────────────────────
    // Creates (or updates) an auth user and links them to a hotel as hotel_admin.
    // Required: email, password, hotel_id
    // Optional: role (defaults to hotel_admin)
    if (action === "create_hotel_admin" || !action) {
      const { email, password, hotel_id, role } = body;

      if (!email || !password || !hotel_id) {
        return new Response(
          JSON.stringify({ error: "Email, password, and hotel_id are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if user already exists
      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) throw listError;

      const existing = listData.users.find((u) => u.email === email);
      let userId: string;

      if (existing) {
        userId = existing.id;
        // Update password
        const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
        });
        if (updateError) throw updateError;
      } else {
        // Create new auth user with email_confirmed = true so they can log in immediately
        const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (createError) throw createError;
        userId = newUserData.user.id;
      }

      // Link to hotel_admins — super_admin does NOT get linked to a specific hotel
      const assignedRole = role || "hotel_admin";
      if (assignedRole !== "super_admin") {
        const { error: linkError } = await adminClient
          .from("hotel_admins")
          .upsert(
            { user_id: userId, hotel_id, role: assignedRole, status: "Active", email },
            { onConflict: "user_id,hotel_id" }
          );
        if (linkError) throw linkError;
      } else {
        // For super_admin, ensure only ONE row exists with hotel_id = null
        const { error: linkError } = await adminClient
          .from("hotel_admins")
          .upsert(
            { user_id: userId, hotel_id: null, role: "super_admin", status: "Active", email },
            { onConflict: "user_id,hotel_id" }
          );
        if (linkError) throw linkError;
      }

      return new Response(
        JSON.stringify({ success: true, userId, email, role: assignedRole }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: reset_password ───────────────────────────────────────────────
    // Resets a user's password. Required: email, password
    if (action === "reset_password") {
      const { email, password } = body;
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "Email and password are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) throw listError;

      const existing = listData.users.find((u) => u.email === email);
      if (!existing) {
        return new Response(
          JSON.stringify({ error: "No user found with that email" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, email }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: create_company_user ──────────────────────────────────────────
    // Creates an auth user for a company-level staff member (enterprise HQ).
    // Required: email, password
    // Optional: name, role
    if (action === "create_company_user") {
      const { email, password, name, role } = body;

      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "Email and password are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) throw listError;

      const existing = listData.users.find((u) => u.email === email);
      let userId: string;

      if (existing) {
        userId = existing.id;
        const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
        });
        if (updateError) throw updateError;
      } else {
        const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name, role },
        });
        if (createError) throw createError;
        userId = newUserData.user.id;
      }

      return new Response(
        JSON.stringify({ success: true, userId, email }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
