import { createClient } from "npm:@supabase/supabase-js@2";

// ── Allowed Origins & CORS Configuration ─────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://hotel-mantri-test-env.vercel.app",
  "https://hotelmantri.com",
  "https://www.hotelmantri.com",
];

const getCorsHeaders = (reqOrigin: string | null) => {
  let origin = ALLOWED_ORIGINS[0];
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) {
    origin = reqOrigin;
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  const reqOrigin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(reqOrigin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST.", code: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // ── 1. Authentication & Credential Verification ───────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required", code: "AUTH_REQUIRED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "").trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!jwt || jwt === anonKey) {
      return new Response(
        JSON.stringify({
          error: "Authentication required. Anon key cannot perform administrative operations.",
          code: "AUTH_REQUIRED",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing", code: "CONFIG_ERROR" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client with caller JWT for user identity verification
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Privileged admin client for scoped backend execution
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify JWT validity with Supabase Auth
    const { data: userData, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !userData?.user) {
      return new Response(
        JSON.stringify({
          error: "Invalid or expired authentication session",
          code: "INVALID_TOKEN",
          details: authError?.message || "User session not found",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerUserId = userData.user.id;
    const callerEmail = userData.user.email || "";

    // ── 2. Caller Role Resolution ─────────────────────────────────────────────
    let isSuperAdmin = false;
    try {
      const { data: rpcSuperAdmin } = await userClient.rpc("is_super_admin");
      if (rpcSuperAdmin === true) {
        isSuperAdmin = true;
      }
    } catch {
      // Fallback to table lookup if RPC is unreachable
    }

    if (!isSuperAdmin) {
      // Check company_users for platform founder / company_admin
      const { data: compUser } = await adminClient
        .from("company_users")
        .select("role, status")
        .eq("user_id", callerUserId)
        .eq("status", "Active")
        .maybeSingle();

      if (compUser && ["founder", "company_admin"].includes(compUser.role)) {
        isSuperAdmin = true;
      }
    }

    if (!isSuperAdmin) {
      // Check hotel_admins for super_admin role
      const { data: superAdminRows } = await adminClient
        .from("hotel_admins")
        .select("role")
        .eq("user_id", callerUserId)
        .eq("role", "super_admin")
        .eq("status", "Active");

      if (superAdminRows && superAdminRows.length > 0) {
        isSuperAdmin = true;
      }
    }

    // Helper: Verify caller is authorized for a given hotel
    const isCallerAuthorizedForHotel = async (hotelId: string): Promise<boolean> => {
      if (isSuperAdmin) return true;
      const { data: adminRows } = await adminClient
        .from("hotel_admins")
        .select("id")
        .eq("user_id", callerUserId)
        .eq("hotel_id", hotelId)
        .eq("role", "hotel_admin")
        .eq("status", "Active");
      return Boolean(adminRows && adminRows.length > 0);
    };

    // ── 3. Parse and Validate Request Payload ──────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON request body", code: "INVALID_JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, hotel_id, auth_user_ids, reason } = body;

    if (!action || typeof action !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid action parameter", code: "MISSING_ACTION" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: delete_storage_files ─────────────────────────────────────────
    // Deletes files in hotel-assets bucket strictly scoped to the authorized hotel
    if (action === "delete_storage_files") {
      if (!hotel_id || typeof hotel_id !== "string" || !UUID_REGEX.test(hotel_id)) {
        return new Response(
          JSON.stringify({ error: "Valid hotel_id UUID is required", code: "INVALID_HOTEL_ID" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Enforce tenant authorization: Super Admin or Hotel Admin for target hotel
      const authorized = await isCallerAuthorizedForHotel(hotel_id);
      if (!authorized) {
        return new Response(
          JSON.stringify({
            error: "Forbidden: You are not authorized to delete storage for this hotel",
            code: "FORBIDDEN",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // List files strictly in the hotel's root folder
      const { data: files, error: listError } = await adminClient
        .storage
        .from("hotel-assets")
        .list(hotel_id, { limit: 1000 });

      if (listError) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to list storage assets", code: "STORAGE_LIST_FAILED" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!files || files.length === 0) {
        return new Response(
          JSON.stringify({ success: true, deleted_files: 0, message: "No storage files found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Strict path traversal mitigation: all paths must start with `${hotel_id}/` and have no raw or encoded `..`
      const filePaths = files
        .map((f) => `${hotel_id}/${f.name}`)
        .filter((p) => {
          if (!p.startsWith(`${hotel_id}/`)) return false;
          if (p.includes("..")) return false;
          try {
            const decoded = decodeURIComponent(p);
            if (decoded.includes("..") || !decoded.startsWith(`${hotel_id}/`)) return false;
          } catch {
            return false;
          }
          return true;
        });

      if (filePaths.length === 0) {
        return new Response(
          JSON.stringify({ success: true, deleted_files: 0, message: "No valid files to delete" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: deleteError } = await adminClient
        .storage
        .from("hotel-assets")
        .remove(filePaths);

      if (deleteError) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to delete storage files", code: "STORAGE_DELETE_FAILED" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Non-fatal audit log entry
      try {
        await adminClient.from("audit_logs").insert({
          user_id: callerUserId,
          user_email: callerEmail,
          role: isSuperAdmin ? "super_admin" : "hotel_admin",
          action: "delete_storage_files",
          module: "storage",
          hotel_id: hotel_id,
          record_id: hotel_id,
          severity: "warning",
          reason: typeof reason === "string" ? reason.slice(0, 500) : "Hotel storage cleanup",
          metadata: { deleted_count: filePaths.length, hotel_id },
        });
      } catch (auditErr) {
        console.warn("[HOTEL_DATA_MANAGEMENT] Audit log write note:", auditErr);
      }

      return new Response(
        JSON.stringify({ success: true, deleted_files: filePaths.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: delete_auth_users ────────────────────────────────────────────
    // Irreversible auth account deletion; strictly restricted to Super Admins
    if (action === "delete_auth_users") {
      if (!isSuperAdmin) {
        return new Response(
          JSON.stringify({
            error: "Forbidden: Super Admin access is required to delete auth users",
            code: "SUPER_ADMIN_REQUIRED",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!auth_user_ids || !Array.isArray(auth_user_ids) || auth_user_ids.length === 0) {
        return new Response(
          JSON.stringify({ error: "auth_user_ids must be a non-empty array of UUIDs", code: "INVALID_AUTH_USER_IDS" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (auth_user_ids.length > 100) {
        return new Response(
          JSON.stringify({ error: "auth_user_ids batch exceeds maximum limit of 100 users", code: "BATCH_SIZE_EXCEEDED" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate UUID formatting on all elements
      for (const uid of auth_user_ids) {
        if (typeof uid !== "string" || !UUID_REGEX.test(uid)) {
          return new Response(
            JSON.stringify({ error: `Invalid user UUID format: ${uid}`, code: "INVALID_USER_ID" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      let deleted = 0;
      const skipped: string[] = [];
      const errors: string[] = [];

      for (const userId of auth_user_ids) {
        // Guard 1: Prevent caller from deleting their own account
        if (userId === callerUserId) {
          skipped.push(`User ${userId} is the current caller (self-deletion forbidden)`);
          continue;
        }

        // Guard 2: Verify user is not a company platform user
        const { data: compUser } = await adminClient
          .from("company_users")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (compUser) {
          skipped.push(`User ${userId} is an active company user (deletion skipped)`);
          continue;
        }

        // Guard 3: Double-check this user is not linked to any other hotel
        const { data: remainingLinks } = await adminClient
          .from("hotel_admins")
          .select("hotel_id")
          .eq("user_id", userId);

        if (remainingLinks && remainingLinks.length > 0) {
          skipped.push(`User ${userId} remains linked to active hotels (deletion skipped)`);
          continue;
        }

        const { error: deleteError } = await adminClient.auth.admin.deleteUserById(userId);
        if (deleteError) {
          errors.push(`Failed to delete user ${userId}: ${deleteError.message}`);
        } else {
          deleted++;
        }
      }

      // Non-fatal audit log entry
      try {
        await adminClient.from("audit_logs").insert({
          user_id: callerUserId,
          user_email: callerEmail,
          role: "super_admin",
          action: "delete_auth_users",
          module: "auth",
          record_id: callerUserId,
          severity: "critical",
          reason: typeof reason === "string" ? reason.slice(0, 500) : "Hotel deletion cleanup",
          metadata: { deleted_count: deleted, skipped_count: skipped.length, errors_count: errors.length },
        });
      } catch (auditErr) {
        console.warn("[HOTEL_DATA_MANAGEMENT] Audit log write note:", auditErr);
      }

      return new Response(
        JSON.stringify({
          success: errors.length === 0,
          deleted_auth_users: deleted,
          skipped: skipped.length > 0 ? skipped : undefined,
          errors: errors.length > 0 ? errors : undefined,
        }),
        {
          status: errors.length > 0 && deleted === 0 ? 500 : 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Fallback for Unrecognized Actions ─────────────────────────────────────
    return new Response(
      JSON.stringify({
        error: `Unknown action: '${action}'. Supported actions: 'delete_storage_files', 'delete_auth_users'`,
        code: "INVALID_ACTION",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message, code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
