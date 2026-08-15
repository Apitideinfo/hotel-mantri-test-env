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
    const { action, hotel_id, reason, user_email, ip, device, auth_user_ids } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Client with the caller's JWT for RPC calls (respects RLS + auth.uid())
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Admin client for auth.users deletion only
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── ACTION: delete_auth_users ──────────────────────────────────
    // Called AFTER delete_hotel_permanently RPC returns auth_user_ids.
    // Deletes auth.users entries for users that belonged ONLY to the
    // deleted hotel (not linked to any other hotel).
    if (action === "delete_auth_users") {
      if (!auth_user_ids || !Array.isArray(auth_user_ids) || auth_user_ids.length === 0) {
        return new Response(
          JSON.stringify({ success: true, deleted_auth_users: 0, message: "No auth users to delete" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let deleted = 0;
      const errors: string[] = [];

      for (const userId of auth_user_ids) {
        // Double-check this user is not linked to any other hotel
        const { data: remainingLinks } = await adminClient
          .from("hotel_admins")
          .select("hotel_id")
          .eq("user_id", userId);

        if (remainingLinks && remainingLinks.length > 0) {
          // User still linked to other hotels — skip deletion
          continue;
        }

        const { error: deleteError } = await adminClient.auth.admin.deleteUserById(userId);
        if (deleteError) {
          errors.push(`Failed to delete user ${userId}: ${deleteError.message}`);
        } else {
          deleted++;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          deleted_auth_users: deleted,
          errors: errors.length > 0 ? errors : undefined,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: delete_storage_files ───────────────────────────────
    // Deletes all files in the hotel-assets bucket for a given hotel.
    if (action === "delete_storage_files") {
      if (!hotel_id) {
        return new Response(
          JSON.stringify({ error: "hotel_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // List all files in the hotel's folder
      const { data: files, error: listError } = await adminClient
        .storage
        .from("hotel-assets")
        .list(hotel_id, { limit: 1000 });

      if (listError) {
        // Folder might not exist — that's fine
        return new Response(
          JSON.stringify({ success: true, deleted_files: 0, message: "No storage files found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!files || files.length === 0) {
        return new Response(
          JSON.stringify({ success: true, deleted_files: 0, message: "No storage files found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const filePaths = files.map((f) => `${hotel_id}/${f.name}`);
      const { error: deleteError } = await adminClient
        .storage
        .from("hotel-assets")
        .remove(filePaths);

      if (deleteError) {
        return new Response(
          JSON.stringify({ success: false, error: deleteError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, deleted_files: filePaths.length }),
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
