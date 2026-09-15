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
  plan_id?: string | null;
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
  "subscription",
  "features",
  "audit_log",
  "activate",
] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("auth", "MISSING_AUTH_HEADER", "Missing Authorization header", false, null, null, 401);
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
      return errorResponse("auth", "INVALID_TOKEN", "Your session is invalid or expired. Please log in again.", false, null, null, 401);
    }

    const { data: isSuperAdmin } = await userClient.rpc("is_super_admin");
    if (!isSuperAdmin) {
      return errorResponse("auth", "FORBIDDEN", "Forbidden: Super Admin access is required to onboard hotels.", false, null, null, 403);
    }

    const body: OnboardingPayload = await req.json();

    // ── Validation (Phase 21) ──
    const validation = validatePayload(body);
    if (!validation.valid) {
      return errorResponse("validation", "VALIDATION_FAILED", validation.error ?? "Invalid onboarding details.", false, null, null, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const cleanEmail = body.admin_email.trim().toLowerCase();
    const cleanHotelName = body.hotel_name.trim();
    const cleanPropCode = body.property_code?.trim() || null;
    const attemptKey = `${cleanPropCode || cleanHotelName}|${cleanEmail}`;

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
      return jsonResponse(
        {
          success: false,
          code: "HOTEL_ALREADY_COMPLETED",
          error: "A hotel with these details already exists and onboarding is complete.",
          message: "A hotel with these details already exists and onboarding is complete.",
          attempt_id: existingAttempt.id,
          hotel_id: existingAttempt.hotel_id,
          retryable: false,
        },
        409,
      );
    }

    if (existingAttempt && existingAttempt.hotel_id) {
      // Resume: reuse the existing hotel and completed steps
      attemptId = existingAttempt.id;
      hotelId = existingAttempt.hotel_id;
      completedSteps = existingAttempt.completed_steps || [];
      console.log(`[ONBOARDING_RESUME] attemptId=${attemptId} hotelId=${hotelId} completedSteps=${completedSteps.join(",")}`);
    } else {
      // New attempt
      attemptId = body.attempt_id || crypto.randomUUID();
      console.log(`[ONBOARDING_START] attemptId=${attemptId} key=${attemptKey}`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    // ── Find / resolve subscription plan (Phase 16) ──
    let selectedPlanId: string | null = body.plan_id || null;
    if (!selectedPlanId) {
      const { data: plans } = await adminClient
        .from("subscription_plans")
        .select("id, name, trial_days")
        .order("sort_order", { ascending: true });
      const trialPlan = (plans || []).find((p) => p.trial_days > 0) || (plans || [])[0];
      selectedPlanId = trialPlan?.id || null;
    }

    // ── Step 1: Hotel record (Phase 13) ──
    if (!completedSteps.includes("hotel_record")) {
      if (hotelId) {
        completedSteps.push("hotel_record");
      } else {
        const { data: hotel, error: hotelError } = await adminClient
          .from("hotels")
          .insert({
            hotel_name: cleanHotelName,
            owner_name: body.owner_name.trim(),
            admin_email: cleanEmail,
            mobile: body.mobile.trim(),
            address: body.address.trim(),
            total_rooms: body.total_rooms,
            city: body.city.trim(),
            state: body.state.trim(),
            property_code: cleanPropCode,
            plan_id: selectedPlanId,
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
          console.error(`[ONBOARDING_FAILED] step=hotel_record error=${hotelError.message}`);
          await updateAttempt(adminClient, attemptId, "failed", completedSteps, "hotel_record", hotelError.message);
          return errorResponse("hotel_record", "HOTEL_CREATE_FAILED", "Failed to create hotel record in database.", true, attemptId, null, 500);
        }

        hotelId = hotel.id;
        completedSteps.push("hotel_record");
        console.log(`[ONBOARDING_HOTEL_CREATED] hotelId=${hotelId}`);

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
        hotel_name: cleanHotelName,
        total_rooms: body.total_rooms,
      }, { onConflict: "id" });

      if (settingsError) {
        console.error(`[ONBOARDING_FAILED] step=hotel_settings error=${settingsError.message}`);
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "hotel_settings", settingsError.message);
        return errorResponse("hotel_settings", "HOTEL_SETTINGS_FAILED", "Failed to save hotel configuration settings.", true, attemptId, hotelId, 500);
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
        console.error(`[ONBOARDING_FAILED] step=hotel_settings error=${sourcesError.message}`);
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "hotel_settings", sourcesError.message);
        return errorResponse("hotel_settings", "COMPANY_SOURCES_FAILED", "Failed to initialize booking sources.", true, attemptId, hotelId, 500);
      }

      completedSteps.push("hotel_settings");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 3: Room categories (Phase 11 - with tariffs updated!) ──
    const catIdMap = new Map<string, string>();
    if (!completedSteps.includes("room_categories")) {
      for (const cat of body.categories) {
        const trimmedName = cat.name.trim();
        if (!trimmedName) continue;

        // Upsert category with actual configured tariffs
        const { data: upsertedCat, error: catError } = await adminClient
          .from("room_categories")
          .upsert({
            hotel_id: hotelId,
            name: trimmedName,
            default_tariff: Number(cat.tariff) || 0,
            extra_bed_charge: Number(cat.extra_bed) || 0,
            is_active: true,
          }, { onConflict: "hotel_id,name" })
          .select("id")
          .single();

        if (catError) {
          console.error(`[ONBOARDING_FAILED] step=room_categories error=${catError.message}`);
          await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "room_categories", catError.message);
          return errorResponse("room_categories", "CATEGORY_CREATE_FAILED", `Failed to configure room category: ${trimmedName}.`, true, attemptId, hotelId, 500);
        }

        catIdMap.set(trimmedName.toLowerCase(), upsertedCat.id);
      }

      completedSteps.push("room_categories");
      console.log(`[ONBOARDING_CATEGORIES_CREATED] hotelId=${hotelId} count=${catIdMap.size}`);
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    } else {
      // Load existing categories for room mapping
      const { data: existingCats } = await adminClient
        .from("room_categories")
        .select("id, name")
        .eq("hotel_id", hotelId);
      for (const c of existingCats || []) {
        catIdMap.set(c.name.trim().toLowerCase(), c.id);
      }
    }

    // ── Step 4: Room inventory (Phases 11, 12, 36) ──
    if (!completedSteps.includes("room_inventory")) {
      // 1. Fetch existing rooms for this hotel to enforce idempotency
      const { data: existingRooms } = await adminClient
        .from("rooms")
        .select("id, room_no")
        .eq("hotel_id", hotelId);

      const existingRoomNos = new Set((existingRooms || []).map((r) => r.room_no.trim()));

      // 2. Ensure all total_rooms rooms exist
      const fullRoomList = generateMissingRooms(
        body.total_rooms,
        body.categories,
        body.rooms || [],
      );

      // 3. Insert only missing rooms
      const roomsToInsert: {
        hotel_id: string;
        room_no: string;
        category_id: string | null;
        floor: string | null;
        default_tariff: number;
        extra_bed_charge: number;
        is_active: boolean;
        housekeeping_status: string;
        sort_order: number;
      }[] = [];

      for (const room of fullRoomList) {
        const cleanRoomNo = room.room_no.trim();
        if (existingRoomNos.has(cleanRoomNo)) continue; // Already created in a prior partial run

        const catKey = room.category_name?.trim().toLowerCase() || "";
        const categoryId = catKey ? (catIdMap.get(catKey) ?? null) : null;

        roomsToInsert.push({
          hotel_id: hotelId,
          room_no: cleanRoomNo,
          category_id: categoryId,
          floor: room.floor?.trim() || null,
          default_tariff: Number(room.tariff) || 0,
          extra_bed_charge: Number(room.extra_bed) || 0,
          is_active: room.is_active ?? true,
          housekeeping_status: "Vacant Clean",
          sort_order: 0,
        });
        existingRoomNos.add(cleanRoomNo);
      }

      if (roomsToInsert.length > 0) {
        const { error: roomError } = await adminClient.from("rooms").insert(roomsToInsert);
        if (roomError) {
          console.error(`[ONBOARDING_FAILED] step=room_inventory error=${roomError.message}`);
          await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "room_inventory", roomError.message);
          return errorResponse("room_inventory", "ROOM_CREATION_FAILED", "Failed to create physical rooms in database.", true, attemptId, hotelId, 500);
        }
      }

      completedSteps.push("room_inventory");
      console.log(`[ONBOARDING_ROOMS_CREATED] hotelId=${hotelId} inserted=${roomsToInsert.length} total=${existingRoomNos.size}`);
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 5: Owner auth account (Phases 3, 4, 5, 14, 15) ──
    if (!completedSteps.includes("owner_auth")) {
      // Targeted lookup using secure RPC get_auth_user_by_email (O(1), no scan, no NULL crashes)
      const { data: authUserRows, error: lookupError } = await adminClient.rpc("get_auth_user_by_email", {
        p_email: cleanEmail,
      });

      if (lookupError) {
        console.error(`[ONBOARDING_FAILED] step=owner_auth lookup_error=${lookupError.message}`);
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "owner_auth", lookupError.message);
        return errorResponse("owner_auth", "OWNER_AUTH_LOOKUP_FAILED", "Unable to verify owner account status.", true, attemptId, hotelId, 500);
      }

      const existingAuthUser = (authUserRows && authUserRows.length > 0) ? authUserRows[0] : null;
      let userId: string;

      if (existingAuthUser) {
        // CASE B, C, D: User exists in Auth
        const { data: adminLinks } = await adminClient
          .from("hotel_admins")
          .select("id, hotel_id, role")
          .eq("user_id", existingAuthUser.id);

        const isSuper = (adminLinks || []).some((l) => l.role === "super_admin");
        if (isSuper) {
          return errorResponse(
            "owner_auth",
            "SUPER_ADMIN_EMAIL_RESERVED",
            "This email belongs to a Super Admin and cannot be assigned as a Hotel Owner.",
            false,
            attemptId,
            hotelId,
            409,
          );
        }

        const sameHotelLink = (adminLinks || []).find((l) => l.hotel_id === hotelId);
        const otherHotelLink = (adminLinks || []).find((l) => l.hotel_id && l.hotel_id !== hotelId);

        if (otherHotelLink) {
          // CASE C: Belong to another hotel -> conflict!
          return errorResponse(
            "owner_auth",
            "OWNER_EMAIL_CONFLICT",
            `A user with email "${cleanEmail}" is already associated with another hotel. Please use a unique owner email.`,
            false,
            attemptId,
            hotelId,
            409,
          );
        }

        // CASE B or E: Re-use existing auth user, update password if provided
        userId = existingAuthUser.id;
        if (body.password) {
          await adminClient.auth.admin.updateUserById(userId, {
            password: body.password,
            email_confirm: true,
          });
        }
        console.log(`[ONBOARDING_OWNER_AUTH_REUSED] userId=${userId} email=${cleanEmail}`);
      } else {
        // CASE A: Create new auth user
        const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password: body.password,
          email_confirm: true,
          user_metadata: {
            full_name: body.owner_name.trim(),
            mobile: body.mobile.trim(),
          },
        });

        if (createError) {
          console.error(`[ONBOARDING_FAILED] step=owner_auth create_error=${createError.message}`);
          await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "owner_auth", createError.message);
          return errorResponse("owner_auth", "OWNER_AUTH_CREATE_FAILED", "Unable to create the owner authentication account.", true, attemptId, hotelId, 500);
        }

        userId = newUserData.user.id;
        console.log(`[ONBOARDING_OWNER_AUTH_CREATED] userId=${userId} email=${cleanEmail}`);
      }

      // Link owner to this hotel in hotel_admins (Phase 14 & 15: strictly hotel_admin)
      const { error: linkError } = await adminClient.from("hotel_admins").upsert(
        {
          user_id: userId,
          hotel_id: hotelId,
          role: "hotel_admin",
          status: "Active",
          email: cleanEmail,
        },
        { onConflict: "user_id,hotel_id" },
      );

      if (linkError) {
        console.error(`[ONBOARDING_FAILED] step=owner_auth link_error=${linkError.message}`);
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "owner_auth", linkError.message);
        return errorResponse("owner_auth", "OWNER_LINK_FAILED", "Failed to assign hotel owner permissions.", true, attemptId, hotelId, 500);
      }

      completedSteps.push("owner_auth");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 6: Subscription (Phase 16) ──
    if (!completedSteps.includes("subscription")) {
      if (selectedPlanId) {
        // 1. Ensure hotels has plan_id
        await adminClient
          .from("hotels")
          .update({ plan_id: selectedPlanId })
          .eq("id", hotelId);

        // 2. Ensure initial entry in subscription_plan_history
        const { data: existingSubHistory } = await adminClient
          .from("subscription_plan_history")
          .select("id")
          .eq("hotel_id", hotelId)
          .maybeSingle();

        if (!existingSubHistory) {
          await adminClient.from("subscription_plan_history").insert({
            hotel_id: hotelId,
            new_plan_id: selectedPlanId,
            change_type: "initial",
            effective_date: today,
            reason: "Initial trial subscription on hotel onboarding",
          });
        }
      }

      completedSteps.push("subscription");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 7: Feature assignments ──
    if (!completedSteps.includes("features")) {
      const featureKeys = Object.keys(body.features || {});
      if (featureKeys.length > 0) {
        for (const key of featureKeys) {
          const { error: featError } = await adminClient.from("hotel_features").upsert(
            {
              hotel_id: hotelId,
              module_key: key,
              is_enabled: body.features[key] ?? true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "hotel_id,module_key" },
          );
          if (featError) {
            console.error(`[ONBOARDING_FAILED] step=features error=${featError.message}`);
            await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "features", featError.message);
            return errorResponse("features", "FEATURES_CONFIG_FAILED", "Failed to configure hotel module features.", true, attemptId, hotelId, 500);
          }
        }
      }
      completedSteps.push("features");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 8: Audit log ──
    if (!completedSteps.includes("audit_log")) {
      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email,
        role: "super_admin",
        action: "onboard_hotel",
        module: "hotels",
        hotel_id: hotelId,
        hotel_name: cleanHotelName,
        record_id: hotelId,
        new_value: {
          hotel_name: cleanHotelName,
          owner: body.owner_name,
          email: cleanEmail,
          total_rooms: body.total_rooms,
          categories: body.categories.length,
        },
        severity: "info",
      });
      completedSteps.push("audit_log");
    }

    // ── Step 9: Activate Hotel ──
    const { error: activateError } = await adminClient
      .from("hotels")
      .update({ is_active: true, onboarding_status: "completed" })
      .eq("id", hotelId);

    if (activateError) {
      console.error(`[ONBOARDING_FAILED] step=activate error=${activateError.message}`);
      await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "activate", activateError.message);
      return errorResponse("activate", "HOTEL_ACTIVATION_FAILED", "Failed to activate hotel status.", true, attemptId, hotelId, 500);
    }

    completedSteps.push("activate");
    await updateAttempt(adminClient, attemptId, "completed", completedSteps);
    console.log(`[ONBOARDING_COMPLETED] attemptId=${attemptId} hotelId=${hotelId}`);

    return jsonResponse(
      {
        success: true,
        hotel_id: hotelId,
        attempt_id: attemptId,
        completed_steps: completedSteps,
        total_rooms: body.total_rooms,
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown internal server error";
    console.error(`[ONBOARDING_UNCAUGHT_EXCEPTION] error=${message}`);
    return errorResponse("server", "INTERNAL_SERVER_ERROR", "An unexpected error occurred during onboarding. Please try again.", true, null, null, 500);
  }
});

// ── Helpers ──

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

function validatePayload(body: OnboardingPayload): { valid: boolean; error?: string } {
  if (!body.hotel_name || !body.hotel_name.trim()) {
    return { valid: false, error: "Hotel name is required." };
  }
  if (!body.owner_name || !body.owner_name.trim()) {
    return { valid: false, error: "Owner name is required." };
  }
  if (!body.admin_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.admin_email.trim())) {
    return { valid: false, error: "A valid owner email address is required." };
  }
  if (!body.mobile || !body.mobile.trim()) {
    return { valid: false, error: "Mobile number is required." };
  }
  if (typeof body.total_rooms !== "number" || body.total_rooms < 1 || !Number.isInteger(body.total_rooms)) {
    return { valid: false, error: "Total rooms must be a positive whole number." };
  }
  if (!Array.isArray(body.categories) || body.categories.length === 0) {
    return { valid: false, error: "At least one room category is required." };
  }
  for (const cat of body.categories) {
    if (!cat.name || !cat.name.trim()) {
      return { valid: false, error: "All room categories must have a valid name." };
    }
  }
  if (!body.password || body.password.length < 6) {
    return { valid: false, error: "Password must be at least 6 characters long." };
  }
  return { valid: true };
}

function generateMissingRooms(
  totalRooms: number,
  categories: { name: string; tariff: number; extra_bed: number }[],
  existingProvidedRooms: { room_no: string; category_name: string | null; floor: string | null; tariff: number; extra_bed: number; is_active: boolean }[],
) {
  const result = [...existingProvidedRooms];
  const existingNos = new Set(result.map((r) => r.room_no.trim()));
  const needed = totalRooms - result.length;
  if (needed <= 0) return result;

  const catCount = Math.max(1, categories.length);
  let currentFloor = 1;
  let roomInFloor = 1;
  const roomsPerFloor = Math.min(20, Math.ceil(totalRooms / Math.max(1, Math.ceil(totalRooms / 20))));

  for (let i = 0; i < needed; i++) {
    let roomNo = "";
    while (true) {
      roomNo = String(currentFloor * 100 + roomInFloor);
      roomInFloor++;
      if (roomInFloor > roomsPerFloor) {
        currentFloor++;
        roomInFloor = 1;
      }
      if (!existingNos.has(roomNo)) {
        existingNos.add(roomNo);
        break;
      }
    }

    const catIdx = i % catCount;
    const cat = categories[catIdx] ?? categories[0];
    const floorStr = currentFloor === 1 ? "1st" : currentFloor === 2 ? "2nd" : currentFloor === 3 ? "3rd" : `${currentFloor}th`;

    result.push({
      room_no: roomNo,
      category_name: cat?.name ?? null,
      floor: floorStr,
      tariff: cat?.tariff ?? 1000,
      extra_bed: cat?.extra_bed ?? 200,
      is_active: true,
    });
  }

  return result;
}

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(
  step: string,
  code: string,
  message: string,
  retryable = true,
  attemptId?: string | null,
  hotelId?: string | null,
  status = 500,
) {
  return jsonResponse(
    {
      success: false,
      step,
      failed_step: step,
      code,
      message,
      error: message,
      retryable,
      attempt_id: attemptId ?? null,
      hotel_id: hotelId ?? null,
    },
    status,
  );
}
