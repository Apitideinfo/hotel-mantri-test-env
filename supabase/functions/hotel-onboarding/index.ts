import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OnboardingPayload {
  action: "onboard_hotel";
  attempt_id?: string;
  hotel_name: string;
  owner_name: string;
  admin_email: string;
  mobile: string;
  address: string;
  total_rooms: number;
  city: string;
  state: string;
  property_code: string | null;
  password: string;
  categories: { name: string; tariff: number; extra_bed: number }[];
  rooms: { room_no: string; category_name: string | null; floor: string | null; tariff: number; extra_bed: number; is_active: boolean }[];
  features: Record<string, boolean>;
}

const STEPS = [
  "hotel_record",
  "hotel_settings",
  "room_categories",
  "room_inventory",
  "owner_auth",
  "features",
  "audit_log",
] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const jwt = authHeader.replace("Bearer ", "").trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Auth Verification ──
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: isSuperAdmin } = await userClient.rpc("is_super_admin");
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden: Not a Super Admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body: OnboardingPayload = await req.json();

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const attemptKey = `${body.property_code || body.hotel_name}|${body.admin_email}`;

    // ── Check for existing attempt ──
    const { data: existingAttempt } = await adminClient
      .from("onboarding_attempts")
      .select("*")
      .eq("attempt_key", attemptKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let attemptId: string;
    let hotelId: string | null = null;
    let completedSteps: string[] = [];

    if (existingAttempt && existingAttempt.status === "completed") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "A hotel with these details already exists and onboarding is complete.",
          attempt_id: existingAttempt.id,
          hotel_id: existingAttempt.hotel_id,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (existingAttempt && existingAttempt.hotel_id) {
      // Resume: reuse the existing hotel and completed steps
      attemptId = existingAttempt.id;
      hotelId = existingAttempt.hotel_id;
      completedSteps = existingAttempt.completed_steps || [];
    } else {
      // New attempt
      attemptId = crypto.randomUUID();
    }

    const today = new Date().toISOString().slice(0, 10);
    const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    // ── Step 1: Hotel record ──
    if (!completedSteps.includes("hotel_record")) {
      if (hotelId) {
        // Hotel already created in a previous attempt — skip
        completedSteps.push("hotel_record");
      } else {
        const { data: hotel, error: hotelError } = await adminClient
          .from("hotels")
          .insert({
            hotel_name: body.hotel_name.trim(),
            owner_name: body.owner_name.trim(),
            admin_email: body.admin_email.trim(),
            mobile: body.mobile.trim(),
            address: body.address.trim(),
            total_rooms: body.total_rooms,
            city: body.city.trim(),
            state: body.state.trim(),
            property_code: body.property_code?.trim() || null,
            subscription_status: "Active",
            subscription_start: today,
            subscription_expiry: trialEnd,
            trial_start: today,
            trial_end: trialEnd,
            is_active: false,
            onboarding_status: "incomplete",
            onboarding_attempt_id: attemptId,
          })
          .select("*")
          .single();

        if (hotelError) {
          await updateAttempt(adminClient, attemptId, "failed", completedSteps, "hotel_record", hotelError.message);
          return new Response(
            JSON.stringify({ success: false, error: formatError(hotelError), failed_step: "hotel_record", attempt_id: attemptId }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        hotelId = hotel.id;
        completedSteps.push("hotel_record");

        // Create/update the attempt record
        await adminClient.from("onboarding_attempts").upsert({
          id: attemptId,
          hotel_id: hotelId,
          attempt_key: attemptKey,
          status: "creating",
          completed_steps: completedSteps,
          form_data: { ...body, password: undefined },
        }, { onConflict: "id" });
      }
    }

    // ── Step 2: Hotel settings + company sources ──
    if (!completedSteps.includes("hotel_settings")) {
      const { error: settingsError } = await adminClient.from("hotel_settings").upsert({
        id: hotelId,
        hotel_name: body.hotel_name.trim(),
        total_rooms: body.total_rooms,
      }, { onConflict: "id" });

      if (settingsError) {
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "hotel_settings", settingsError.message);
        return new Response(
          JSON.stringify({ success: false, error: formatError(settingsError), failed_step: "hotel_settings", attempt_id: attemptId, hotel_id: hotelId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const defaultSources = ["OTA", "Direct/Walking", "Corporate/Agent", "Phonebook"];
      const { error: sourcesError } = await adminClient.from("company_sources").upsert(
        defaultSources.map((cat) => ({
          hotel_id: hotelId,
          name: cat,
          source_category: cat,
        })),
        { onConflict: "hotel_id,name" },
      );

      if (sourcesError) {
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "hotel_settings", sourcesError.message);
        return new Response(
          JSON.stringify({ success: false, error: formatError(sourcesError), failed_step: "hotel_settings", attempt_id: attemptId, hotel_id: hotelId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      completedSteps.push("hotel_settings");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 3: Room categories ──
    const catIdMap = new Map<string, string>();
    if (!completedSteps.includes("room_categories")) {
      for (const cat of body.categories) {
        const trimmedName = cat.name.trim();
        if (!trimmedName) continue;

        const { data: existingCat } = await adminClient
          .from("room_categories")
          .select("id")
          .eq("hotel_id", hotelId)
          .eq("name", trimmedName)
          .maybeSingle();

        if (existingCat) {
          catIdMap.set(trimmedName, existingCat.id);
          continue;
        }

        const { data: newCat, error: catError } = await adminClient
          .from("room_categories")
          .upsert({
            hotel_id: hotelId,
            name: trimmedName,
            default_tariff: cat.tariff,
            extra_bed_charge: cat.extra_bed,
          }, { onConflict: "hotel_id,name" })
          .select("id")
          .single();

        if (catError) {
          await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "room_categories", catError.message);
          return new Response(
            JSON.stringify({ success: false, error: formatError(catError), failed_step: "room_categories", attempt_id: attemptId, hotel_id: hotelId }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        catIdMap.set(trimmedName, newCat.id);
      }
      completedSteps.push("room_categories");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    } else {
      // Load existing category IDs for room assignment
      const { data: existingCats } = await adminClient
        .from("room_categories")
        .select("id, name")
        .eq("hotel_id", hotelId);
      for (const c of existingCats || []) {
        catIdMap.set(c.name, c.id);
      }
    }

    // ── Step 4: Room inventory ──
    if (!completedSteps.includes("room_inventory")) {
      for (const room of body.rooms) {
        const { data: existingRoom } = await adminClient
          .from("rooms")
          .select("id")
          .eq("hotel_id", hotelId)
          .eq("room_no", room.room_no)
          .maybeSingle();

        if (existingRoom) continue;

        const categoryId = room.category_name ? (catIdMap.get(room.category_name) ?? null) : null;

        const { error: roomError } = await adminClient.from("rooms").insert({
          hotel_id: hotelId,
          room_no: room.room_no,
          category_id: categoryId,
          floor: room.floor || null,
          default_tariff: room.tariff,
          extra_bed_charge: room.extra_bed,
          is_active: room.is_active,
          sort_order: 0,
        });

        if (roomError) {
          await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "room_inventory", roomError.message);
          return new Response(
            JSON.stringify({ success: false, error: formatError(roomError), failed_step: "room_inventory", attempt_id: attemptId, hotel_id: hotelId }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      completedSteps.push("room_inventory");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 5: Owner auth account ──
    if (!completedSteps.includes("owner_auth")) {
      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) {
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "owner_auth", listError.message);
        return new Response(
          JSON.stringify({ success: false, error: formatError(listError), failed_step: "owner_auth", attempt_id: attemptId, hotel_id: hotelId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const existing = listData.users.find((u) => u.email === body.admin_email.trim());
      let userId: string;

      if (existing) {
        // Check if they are already linked to this hotel from a previous step
        const { data: existingLink } = await adminClient.from("hotel_admins").select("id").eq("user_id", existing.id).eq("hotel_id", hotelId).maybeSingle();
        if (existingLink) {
          userId = existing.id; // Resume
        } else {
          return new Response(
            JSON.stringify({ success: false, error: "A user with this email already exists. Please use a different email.", failed_step: "owner_auth", attempt_id: attemptId, hotel_id: hotelId }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
          email: body.admin_email.trim(),
          password: body.password,
          email_confirm: true,
        });
        if (createError) {
          await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "owner_auth", createError.message);
          return new Response(
            JSON.stringify({ success: false, error: formatError(createError), failed_step: "owner_auth", attempt_id: attemptId, hotel_id: hotelId }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        userId = newUserData.user.id;
      }

      const { error: linkError } = await adminClient
        .from("hotel_admins")
        .upsert(
          { user_id: userId, hotel_id: hotelId, role: "hotel_admin", status: "Active", email: body.admin_email.trim() },
          { onConflict: "user_id,hotel_id" },
        );

      if (linkError) {
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "owner_auth", linkError.message);
        return new Response(
          JSON.stringify({ success: false, error: formatError(linkError), failed_step: "owner_auth", attempt_id: attemptId, hotel_id: hotelId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      completedSteps.push("owner_auth");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 6: Feature assignments ──
    if (!completedSteps.includes("features")) {
      const featureKeys = Object.keys(body.features);
      for (const key of featureKeys) {
        const { error: featError } = await adminClient
          .from("hotel_features")
          .upsert(
            { hotel_id: hotelId, module_key: key, is_enabled: body.features[key] ?? true, updated_at: new Date().toISOString() },
            { onConflict: "hotel_id,module_key" },
          );
        if (featError) {
          await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "features", featError.message);
          return new Response(
            JSON.stringify({ success: false, error: formatError(featError), failed_step: "features", attempt_id: attemptId, hotel_id: hotelId }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      completedSteps.push("features");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 7: Audit log ──
    if (!completedSteps.includes("audit_log")) {
      const { data: userData } = await adminClient.auth.admin.listUsers();
      const adminUser = userData.users.find((u) => u.email === body.admin_email.trim());

      await adminClient.from("audit_logs").insert({
        user_id: adminUser?.id ?? null,
        user_email: body.admin_email.trim(),
        role: "hotel_admin",
        action: "onboard_hotel",
        module: "hotels",
        hotel_id: hotelId,
        hotel_name: body.hotel_name.trim(),
        record_id: hotelId,
        new_value: {
          hotel_name: body.hotel_name, owner: body.owner_name, email: body.admin_email,
          rooms: body.rooms.length, categories: body.categories.length,
        },
        severity: "info",
      });
      completedSteps.push("audit_log");
    }

    // ── All steps complete: activate hotel ──
    const { error: activateError } = await adminClient
      .from("hotels")
      .update({ is_active: true, onboarding_status: "completed" })
      .eq("id", hotelId);

    if (activateError) {
      await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "activate", activateError.message);
      return new Response(
        JSON.stringify({ success: false, error: formatError(activateError), failed_step: "activate", attempt_id: attemptId, hotel_id: hotelId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await updateAttempt(adminClient, attemptId, "completed", completedSteps);

    return new Response(
      JSON.stringify({
        success: true,
        hotel_id: hotelId,
        attempt_id: attemptId,
        completed_steps: completedSteps,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function updateAttempt(
  client: ReturnType<typeof createClient>,
  attemptId: string,
  status: string,
  completedSteps: string[],
  failedStep?: string,
  errorMessage?: string,
) {
  await client.from("onboarding_attempts").update({
    status,
    completed_steps: completedSteps,
    failed_step: failedStep ?? null,
    error_message: errorMessage ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", attemptId);
}

function formatError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [`Postgres: ${e.code ?? "???"}`, e.message ?? "Unknown error"];
    if (e.details) parts.push(`Details: ${e.details}`);
    if (e.hint) parts.push(`Hint: ${e.hint}`);
    return parts.join(" | ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
