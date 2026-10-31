import { createClient } from "npm:@supabase/supabase-js@2";

// Helper to generate CORS headers dynamically based on request origin
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

// Password Policy Enforcement (H3 & M5: Minimum 12 characters, reject common weak passwords)
const WEAK_PASSWORDS = new Set([
  "password1234", "password12345", "admin1234567", "hotelmantri12", "welcome12345",
  "123456789012", "qwerty123456", "letmein12345", "password@1234", "admin@123456"
]);

const validatePasswordPolicy = (pw: string): string | null => {
  if (!pw || typeof pw !== "string" || pw.length < 12) {
    return "Password must be at least 12 characters long.";
  }
  if (WEAK_PASSWORDS.has(pw.toLowerCase().trim())) {
    return "Password is too common or insecure. Please choose a stronger password.";
  }
  return null;
};

// Helper: Fast and safe user lookup by email
const getUserByEmail = async (client: any, emailStr: string) => {
  const clean = emailStr.trim().toLowerCase();
  try {
    const { data, error } = await client.rpc("get_auth_user_by_email", { p_email: clean });
    if (!error && Array.isArray(data) && data.length > 0) {
      return data[0];
    }
  } catch {}

  // Fallback: listUsers with pagination
  const { data: pageData } = await client.auth.admin.listUsers({ page: 1, perPage: 100 });
  return (pageData?.users || []).find((u: any) => u.email?.toLowerCase() === clean) || null;
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
    const environment = (Deno.env.get("ENVIRONMENT") || Deno.env.get("NODE_ENV") || "").toLowerCase();
    const allowDestructive = Deno.env.get("ALLOW_DESTRUCTIVE_DB_TOOLS") === "true";

    // Verify caller's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const jwt = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized", details: authError?.message || "No user found" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is a super_admin via RPC or database check
    let isSuperAdmin = false;
    const { data: rpcSuperAdmin } = await userClient.rpc("is_super_admin");
    if (rpcSuperAdmin === true) {
      isSuperAdmin = true;
    } else {
      const { data: adminRows } = await adminClient
        .from("hotel_admins")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin");
      if (adminRows && adminRows.length > 0) isSuperAdmin = true;
    }

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: Super Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Helper: Structured audit log writer (H3)
    const logSuperAdminAudit = async (actionName: string, targetId: string | null, details: Record<string, unknown> = {}) => {
      try {
        await adminClient.from("audit_logs").insert({
          user_id: user.id,
          user_email: user.email ?? "",
          role: "super_admin",
          action: `setup_super_admin:${actionName}`,
          module: "super_admin_panel",
          hotel_id: (details.hotel_id as string) ?? null,
          record_id: targetId ?? actionName,
          metadata: {
            ...details,
            caller_id: user.id,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (logErr) {
        console.warn("[setup-super-admin] Audit log failed:", logErr);
      }
    };

    // ── ACTION: create_hotel_admin ──────────────────────────────────────────
    if (action === "create_hotel_admin" || !action) {
      const { email, password, hotel_id, role } = body;
      if (!email || !password || !hotel_id) {
        return new Response(JSON.stringify({ error: "Email, password, and hotel_id are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const pwErr = validatePasswordPolicy(password);
      if (pwErr) {
        return new Response(JSON.stringify({ error: pwErr }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const cleanEmail = email.trim().toLowerCase();
      const existing = await getUserByEmail(adminClient, cleanEmail);
      let userId: string;

      if (existing) {
        // H3: Never overwrite password of existing user!
        userId = existing.id;

        // Check if user already linked to another hotel
        const { data: links } = await adminClient
          .from("hotel_admins")
          .select("id, hotel_id, role")
          .eq("user_id", userId);

        const otherHotel = (links || []).find((l: any) => l.hotel_id && l.hotel_id !== hotel_id);
        if (otherHotel) {
          return new Response(
            JSON.stringify({ error: `User is already associated with another hotel (${otherHotel.hotel_id}). Cannot overwrite.` }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: "A user with this email already exists. To update permissions or generate a password reset link, please use the respective dedicated endpoints." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        const assignedRole = role || "hotel_admin";
        const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: true,
          app_metadata: { role: assignedRole },
        });
        if (createError) throw createError;
        userId = newUserData.user.id;

        const targetHotelId = assignedRole === "super_admin" ? null : hotel_id;
        const { error: linkError } = await adminClient
          .from("hotel_admins")
          .upsert(
            { user_id: userId, hotel_id: targetHotelId, role: assignedRole, staff_role: assignedRole, status: "Active", email: cleanEmail },
            { onConflict: "user_id,hotel_id" }
          );
        if (linkError) throw linkError;

        await logSuperAdminAudit("create_hotel_admin", userId, { email: cleanEmail, hotel_id: targetHotelId, role: assignedRole });
        return new Response(JSON.stringify({ success: true, userId, email: cleanEmail, role: assignedRole }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── ACTION: reset_password ───────────────────────────────────────────────
    if (action === "reset_password") {
      const { email, password, prefer_link } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: "Email is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const cleanEmail = email.trim().toLowerCase();
      const existing = await getUserByEmail(adminClient, cleanEmail);
      if (!existing) {
        return new Response(JSON.stringify({ error: "No user found with that email" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // H3: Refuse to reset password of super_admin
      const { data: adminRows } = await adminClient
        .from("hotel_admins")
        .select("role")
        .eq("user_id", existing.id);

      const isTargetSuperAdmin = (adminRows ?? []).some((r: any) => r.role === "super_admin");
      if (isTargetSuperAdmin) {
        return new Response(
          JSON.stringify({ error: "Cannot reset password of another Super Admin via this endpoint." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // H3: Prefer secure recovery link over setting cleartext password
      if (prefer_link || !password) {
        const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: cleanEmail,
        });
        if (linkErr) throw linkErr;

        await logSuperAdminAudit("generate_recovery_link", existing.id, { email: cleanEmail });
        return new Response(
          JSON.stringify({ success: true, email: cleanEmail, link: linkData.properties?.action_link }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate new password policy
      const pwErr = validatePasswordPolicy(password);
      if (pwErr) {
        return new Response(JSON.stringify({ error: pwErr }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
      if (updateError) throw updateError;

      await logSuperAdminAudit("reset_password", existing.id, { email: cleanEmail });
      return new Response(JSON.stringify({ success: true, email: cleanEmail }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: create_company_user ──────────────────────────────────────────
    if (action === "create_company_user") {
      const { email, password, name, role } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const pwErr = validatePasswordPolicy(password);
      if (pwErr) {
        return new Response(JSON.stringify({ error: pwErr }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const cleanEmail = email.trim().toLowerCase();
      const existing = await getUserByEmail(adminClient, cleanEmail);
      if (existing) {
        return new Response(
          JSON.stringify({ error: "A user with this email already exists." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const assignedRole = role || "staff";
      const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        app_metadata: { role: assignedRole },
      });
      if (createError) throw createError;
      const userId = newUserData.user.id;

      await adminClient.from("company_users").insert({
        user_id: userId,
        email: cleanEmail,
        name: name || cleanEmail,
        role: assignedRole,
        is_active: true,
      });

      await logSuperAdminAudit("create_company_user", userId, { email: cleanEmail, role: assignedRole });
      return new Response(JSON.stringify({ success: true, userId, email: cleanEmail }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: remove_company_user ──────────────────────────────────────────
    if (action === "remove_company_user") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // H3: Block removing caller themselves
      if (user_id === user.id) {
        return new Response(JSON.stringify({ error: "Cannot delete your own Super Admin account." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // H3: Block removing another super_admin
      const { data: targetAdmins } = await adminClient
        .from("hotel_admins")
        .select("role")
        .eq("user_id", user_id)
        .eq("role", "super_admin");

      if (targetAdmins && targetAdmins.length > 0) {
        return new Response(JSON.stringify({ error: "Cannot delete a Super Admin user." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // H3: Verify target exists as a company_user
      const { data: companyUser } = await adminClient
        .from("company_users")
        .select("id, email")
        .eq("user_id", user_id)
        .maybeSingle();

      if (!companyUser) {
        return new Response(JSON.stringify({ error: "Target user is not registered as a company user." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await adminClient.from("company_users").delete().eq("user_id", user_id);
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await logSuperAdminAudit("remove_company_user", user_id, { email: companyUser.email });
      return new Response(JSON.stringify({ success: true, user_id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: deactivate_hotel (Soft-delete per H3) ────────────────────────
    if (action === "deactivate_hotel") {
      const { hotel_id } = body;
      if (!hotel_id) {
        return new Response(JSON.stringify({ error: "hotel_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: updateError } = await adminClient
        .from("hotels")
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
        })
        .eq("id", hotel_id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await logSuperAdminAudit("deactivate_hotel", hotel_id, { soft_deleted: true });
      return new Response(JSON.stringify({ success: true, hotel_id, status: "deactivated" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: hard_delete_hotel (Gated behind destructive flags per H3) ────
    if (action === "hard_delete_hotel" || action === "delete_hotel") {
      const { hotel_id, confirm } = body;
      if (!hotel_id) {
        return new Response(JSON.stringify({ error: "hotel_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (environment === "production") {
        return new Response(
          JSON.stringify({ error: "Hard hotel deletion is prohibited in production. Use deactivate_hotel for soft deletion." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!allowDestructive) {
        return new Response(
          JSON.stringify({ error: "Hard deletion is disabled. Set ALLOW_DESTRUCTIVE_DB_TOOLS=true." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (confirm !== "DELETE-ALL-DATA") {
        return new Response(
          JSON.stringify({ error: 'Confirmation required: confirm="DELETE-ALL-DATA".' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: deleteHotelError } = await adminClient
        .from("hotels")
        .delete()
        .eq("id", hotel_id);

      if (deleteHotelError) {
        return new Response(JSON.stringify({ error: deleteHotelError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await logSuperAdminAudit("hard_delete_hotel", hotel_id);
      return new Response(JSON.stringify({ success: true, hotel_id, status: "deleted" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const reqOrigin = req.headers.get("Origin");
    const corsHeaders = getCorsHeaders(reqOrigin);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
