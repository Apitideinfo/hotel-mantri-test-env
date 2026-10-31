// @ts-ignore: Deno npm module specifier
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const getCorsHeaders = (reqOrigin: string | null) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://hotel-mantri-test-env.vercel.app",
    "https://hotelmantri.com",
    "https://www.hotelmantri.com",
  ];
  const origin = reqOrigin && allowedOrigins.includes(reqOrigin) ? reqOrigin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-request-id",
  };
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
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const reqOrigin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(reqOrigin);

  // 1. CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: { ...corsHeaders, "x-request-id": requestId },
    });
  }

  // 2. Health & Status Check via GET
  if (req.method === "GET") {
    const url = new URL(req.url);
    const attemptIdParam = url.searchParams.get("attempt_id");
    const propertyCodeParam = url.searchParams.get("property_code");
    const emailParam = url.searchParams.get("email");

    // If query params are provided, allow checking attempt status
    if (attemptIdParam || (propertyCodeParam && emailParam)) {
      try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
          return errorResponse("auth", "MISSING_AUTH_HEADER", "Missing Authorization header", false, null, null, 401, requestId);
        }
        const jwt = authHeader.replace("Bearer ", "").trim();
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_ANON_KEY");

        if (!supabaseUrl || !serviceRoleKey || !anonKey) {
          return errorResponse("server", "CONFIGURATION_ERROR", "Server configuration error.", false, null, null, 500, requestId);
        }

        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: `Bearer ${jwt}` } },
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
        if (authError || !user) {
          return errorResponse("auth", "INVALID_TOKEN", "Your session is invalid or expired.", false, null, null, 401, requestId);
        }

        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // H3: Super Admin access required to view onboarding attempts
        let isSuperAdmin = false;
        const { data: rpcSuperAdmin, error: rpcErr } = await userClient.rpc("is_super_admin");
        if (!rpcErr && rpcSuperAdmin === true) {
          isSuperAdmin = true;
        } else {
          const { data: adminRecord } = await adminClient
            .from("hotel_admins")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "super_admin")
            .maybeSingle();
          if (adminRecord) {
            isSuperAdmin = true;
          }
        }

        if (!isSuperAdmin) {
          return errorResponse("auth", "FORBIDDEN", "Forbidden: Super Admin access is required to view onboarding attempts.", false, null, null, 403, requestId, corsHeaders);
        }

        // H3: Never return form_data in status response to prevent credential leakage
        let query = adminClient
          .from("onboarding_attempts")
          .select("id, attempt_key, hotel_id, status, current_step, completed_steps, error_message, hotel_name, owner_name, admin_email, mobile, property_code, plan_id, created_at, updated_at");
        if (attemptIdParam) {
          query = query.eq("id", attemptIdParam);
        } else {
          const attemptKey = `${propertyCodeParam?.trim() || ""}|${emailParam?.trim().toLowerCase() || ""}`;
          query = query.eq("attempt_key", attemptKey).order("created_at", { ascending: false }).limit(1);
        }

        const { data: attempt, error: attemptError } = await query.maybeSingle();
        if (attemptError) {
          return errorResponse("status", "QUERY_FAILED", "Failed to retrieve onboarding attempt status.", true, null, null, 500, requestId, corsHeaders);
        }

        if (attempt && (attempt as any).form_data) {
          delete (attempt as any).form_data;
        }

        return jsonResponse({
          success: true,
          attempt: attempt || null,
        }, 200, requestId, corsHeaders);
      } catch (err) {
        console.error(`[ONBOARDING_STATUS_GET_ERROR] [${requestId}]`, err);
        return errorResponse("status", "STATUS_CHECK_FAILED", "Unable to verify onboarding status.", true, null, null, 500, requestId);
      }
    }

    // Default GET response: healthy status probe
    return jsonResponse({
      success: true,
      service: "hotel-onboarding",
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.2.0",
    }, 200, requestId);
  }

  // 3. Reject unsupported HTTP methods
  if (req.method !== "POST") {
    return errorResponse(
      "method",
      "METHOD_NOT_ALLOWED",
      `HTTP method ${req.method} is not allowed. Use POST to onboard a hotel.`,
      false,
      null,
      null,
      405,
      requestId
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("auth", "MISSING_AUTH_HEADER", "Missing Authorization header", false, null, null, 401, requestId);
    }
    const jwt = authHeader.replace("Bearer ", "").trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error(`[ONBOARDING_ENV_MISSING] [${requestId}] url=${Boolean(supabaseUrl)} serviceRole=${Boolean(serviceRoleKey)} anonKey=${Boolean(anonKey)}`);
      return errorResponse("server", "CONFIGURATION_ERROR", "Server configuration error. Service keys are missing.", false, null, null, 500, requestId);
    }

    // ── Auth Verification ──
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !user) {
      return errorResponse("auth", "INVALID_TOKEN", "Your session is invalid or expired. Please log in again.", false, null, null, 401, requestId);
    }

    // Check Super Admin privilege via RPC with fallback to hotel_admins check
    let isSuperAdmin = false;
    const { data: rpcSuperAdmin, error: rpcErr } = await userClient.rpc("is_super_admin");
    if (!rpcErr && rpcSuperAdmin === true) {
      isSuperAdmin = true;
    } else {
      const adminClientCheck = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: adminRecord } = await adminClientCheck
        .from("hotel_admins")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (adminRecord) {
        isSuperAdmin = true;
      }
    }

    if (!isSuperAdmin) {
      return errorResponse("auth", "FORBIDDEN", "Forbidden: Super Admin access is required to onboard hotels.", false, null, null, 403, requestId);
    }

    // ── Safe JSON Body Parsing ──
    let body: OnboardingPayload;
    try {
      body = await req.json();
    } catch {
      return errorResponse("validation", "INVALID_JSON_BODY", "Request body must be valid JSON.", false, null, null, 400, requestId);
    }

    // ── Validation ──
    const validation = validatePayload(body);
    if (!validation.valid) {
      return errorResponse("validation", "VALIDATION_FAILED", validation.error ?? "Invalid onboarding details.", false, null, null, 400, requestId);
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
        requestId
      );
    }

    // Check if property code is already in use by another active hotel
    if (cleanPropCode) {
      const { data: propCheck } = await adminClient
        .from("hotels")
        .select("id, hotel_name")
        .eq("property_code", cleanPropCode)
        .maybeSingle();

      if (propCheck && (!existingAttempt || existingAttempt.hotel_id !== propCheck.id)) {
        return errorResponse(
          "hotel_record",
          "PROPERTY_CODE_EXISTS",
          `Property code "${cleanPropCode}" is already assigned to "${propCheck.hotel_name}". Please choose a unique property code.`,
          false,
          null,
          propCheck.id,
          409,
          requestId
        );
      }
    }

    if (existingAttempt && existingAttempt.hotel_id) {
      // Resume: reuse the existing hotel and completed steps
      attemptId = existingAttempt.id;
      hotelId = existingAttempt.hotel_id;
      completedSteps = existingAttempt.completed_steps || [];
      console.log(`[ONBOARDING_RESUME] [${requestId}] attemptId=${attemptId} hotelId=${hotelId} completedSteps=${completedSteps.join(",")}`);
    } else {
      // New attempt
      attemptId = body.attempt_id || crypto.randomUUID();
      console.log(`[ONBOARDING_START] [${requestId}] attemptId=${attemptId} key=${attemptKey}`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    // ── Find / resolve subscription plan ──
    let selectedPlanId: string | null = body.plan_id || null;
    if (!selectedPlanId) {
      const { data: plans } = await adminClient
        .from("subscription_plans")
        .select("id, name, trial_days")
        .order("sort_order", { ascending: true });
      const trialPlan = (plans || []).find((p: any) => p.trial_days > 0) || (plans || [])[0];
      selectedPlanId = trialPlan?.id || null;
    }

    // ── Step 1: Hotel record ──
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
          console.error(`[ONBOARDING_FAILED] [${requestId}] step=hotel_record error=${hotelError.message}`);
          await updateAttempt(adminClient, attemptId, "failed", completedSteps, "hotel_record", hotelError.message);
          const isConflict = hotelError.code === "23505";
          return errorResponse(
            "hotel_record",
            isConflict ? "HOTEL_RECORD_CONFLICT" : "HOTEL_CREATE_FAILED",
            isConflict ? "A hotel record with these unique details already exists." : "Failed to create hotel record in database.",
            !isConflict,
            attemptId,
            null,
            isConflict ? 409 : 500,
            requestId
          );
        }

        hotelId = hotel.id;
        completedSteps.push("hotel_record");
        console.log(`[ONBOARDING_HOTEL_CREATED] [${requestId}] hotelId=${hotelId}`);

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
        console.error(`[ONBOARDING_FAILED] [${requestId}] step=hotel_settings error=${settingsError.message}`);
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "hotel_settings", settingsError.message);
        return errorResponse("hotel_settings", "HOTEL_SETTINGS_FAILED", "Failed to save hotel configuration settings.", true, attemptId, hotelId, 500, requestId);
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
        console.error(`[ONBOARDING_FAILED] [${requestId}] step=hotel_settings error=${sourcesError.message}`);
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "hotel_settings", sourcesError.message);
        return errorResponse("hotel_settings", "COMPANY_SOURCES_FAILED", "Failed to initialize booking sources.", true, attemptId, hotelId, 500, requestId);
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
          console.error(`[ONBOARDING_FAILED] [${requestId}] step=room_categories error=${catError.message}`);
          await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "room_categories", catError.message);
          return errorResponse("room_categories", "CATEGORY_CREATE_FAILED", `Failed to configure room category: ${trimmedName}.`, true, attemptId, hotelId, 500, requestId);
        }

        catIdMap.set(trimmedName.toLowerCase(), upsertedCat.id);
      }

      // Deactivate any unconfigured legacy trigger-seeded categories that were not submitted in this onboarding
      const configuredCatIds = Array.from(catIdMap.values());
      if (configuredCatIds.length > 0) {
        await adminClient
          .from("room_categories")
          .update({ is_active: false })
          .eq("hotel_id", hotelId)
          .eq("default_tariff", 0)
          .not("id", "in", `(${configuredCatIds.join(",")})`);
      }

      completedSteps.push("room_categories");
      console.log(`[ONBOARDING_CATEGORIES_CREATED] [${requestId}] hotelId=${hotelId} count=${catIdMap.size}`);
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

    // ── Step 4: Room inventory ──
    if (!completedSteps.includes("room_inventory")) {
      const { data: existingRooms } = await adminClient
        .from("rooms")
        .select("id, room_no")
        .eq("hotel_id", hotelId);

      const existingRoomNos = new Set((existingRooms || []).map((r: any) => r.room_no.trim()));
      const fullRoomList = generateMissingRooms(
        body.total_rooms,
        body.categories,
        body.rooms || [],
      );

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
        if (existingRoomNos.has(cleanRoomNo)) continue;

        const catKey = room.category_name?.trim().toLowerCase() || "";
        const categoryId = catKey ? (catIdMap.get(catKey) ?? null) : null;

        roomsToInsert.push({
          hotel_id: hotelId!,
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
          console.error(`[ONBOARDING_FAILED] [${requestId}] step=room_inventory error=${roomError.message}`);
          await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "room_inventory", roomError.message);
          return errorResponse("room_inventory", "ROOM_CREATION_FAILED", "Failed to create physical rooms in database.", true, attemptId, hotelId, 500, requestId);
        }
      }

      completedSteps.push("room_inventory");
      console.log(`[ONBOARDING_ROOMS_CREATED] [${requestId}] hotelId=${hotelId} inserted=${roomsToInsert.length} total=${existingRoomNos.size}`);
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 5: Owner auth account ──
    if (!completedSteps.includes("owner_auth")) {
      const { data: authUserRows, error: lookupError } = await adminClient.rpc("get_auth_user_by_email", {
        p_email: cleanEmail,
      });

      if (lookupError) {
        console.error(`[ONBOARDING_FAILED] [${requestId}] step=owner_auth lookup_error=${lookupError.message}`);
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "owner_auth", lookupError.message);
        return errorResponse("owner_auth", "OWNER_AUTH_LOOKUP_FAILED", "Unable to verify owner account status.", true, attemptId, hotelId, 500, requestId);
      }

      const existingAuthUser = (authUserRows && authUserRows.length > 0) ? authUserRows[0] : null;
      let userId: string;

      if (existingAuthUser) {
        const { data: adminLinks } = await adminClient
          .from("hotel_admins")
          .select("id, hotel_id, role")
          .eq("user_id", existingAuthUser.id);

        const isSuper = (adminLinks || []).some((l: any) => l.role === "super_admin");
        if (isSuper) {
          return errorResponse(
            "owner_auth",
            "SUPER_ADMIN_EMAIL_RESERVED",
            "This email belongs to a Super Admin and cannot be assigned as a Hotel Owner.",
            false,
            attemptId,
            hotelId,
            409,
            requestId
          );
        }

        const otherHotelLink = (adminLinks || []).find((l: any) => l.hotel_id && l.hotel_id !== hotelId);
        if (otherHotelLink) {
          return errorResponse(
            "owner_auth",
            "OWNER_EMAIL_CONFLICT",
            `A user with email "${cleanEmail}" is already associated with another hotel. Please use a unique owner email.`,
            false,
            attemptId,
            hotelId,
            409,
            requestId
          );
        }

        userId = existingAuthUser.id;
        if (body.password) {
          const { error: updatePwErr } = await adminClient.auth.admin.updateUserById(userId, {
            password: body.password,
            email_confirm: true,
          });
          if (updatePwErr) {
            console.warn(`[ONBOARDING_WARNING] [${requestId}] password update warning: ${updatePwErr.message}`);
          }
        }
        console.log(`[ONBOARDING_OWNER_AUTH_REUSED] [${requestId}] userId=${userId} email=${cleanEmail}`);
      } else {
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
          console.error(`[ONBOARDING_FAILED] [${requestId}] step=owner_auth create_error=${createError.message}`);
          await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "owner_auth", createError.message);
          
          // Map client validation / format errors to 400 Bad Request
          const msg = createError.message || "Unable to create owner account.";
          const isFormatError = msg.toLowerCase().includes("invalid") ||
                                msg.toLowerCase().includes("format") ||
                                msg.toLowerCase().includes("password") ||
                                msg.toLowerCase().includes("email");
          return errorResponse(
            "owner_auth",
            isFormatError ? "INVALID_OWNER_CREDENTIALS" : "OWNER_AUTH_CREATE_FAILED",
            msg,
            !isFormatError,
            attemptId,
            hotelId,
            isFormatError ? 400 : 500,
            requestId
          );
        }

        userId = newUserData.user.id;
        console.log(`[ONBOARDING_OWNER_AUTH_CREATED] [${requestId}] userId=${userId} email=${cleanEmail}`);
      }

      // Link owner to this hotel in hotel_admins
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
        console.error(`[ONBOARDING_FAILED] [${requestId}] step=owner_auth link_error=${linkError.message}`);
        await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "owner_auth", linkError.message);
        return errorResponse("owner_auth", "OWNER_LINK_FAILED", "Failed to assign hotel owner permissions.", true, attemptId, hotelId, 500, requestId);
      }

      completedSteps.push("owner_auth");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 6: Subscription ──
    if (!completedSteps.includes("subscription")) {
      if (selectedPlanId) {
        await adminClient
          .from("hotels")
          .update({ plan_id: selectedPlanId })
          .eq("id", hotelId);

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
            console.error(`[ONBOARDING_FAILED] [${requestId}] step=features error=${featError.message}`);
            await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "features", featError.message);
            return errorResponse("features", "FEATURES_CONFIG_FAILED", "Failed to configure hotel module features.", true, attemptId, hotelId, 500, requestId);
          }
        }
      }
      completedSteps.push("features");
      await updateAttempt(adminClient, attemptId, "creating", completedSteps);
    }

    // ── Step 8: Audit log (non-blocking) ──
    if (!completedSteps.includes("audit_log")) {
      try {
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
      } catch (auditErr: any) {
        console.warn(`[ONBOARDING_AUDIT_WARNING] [${requestId}]`, auditErr.message);
      }
      completedSteps.push("audit_log");
    }

    // ── Step 9: Activate Hotel ──
    const { error: activateError } = await adminClient
      .from("hotels")
      .update({ is_active: true, onboarding_status: "completed" })
      .eq("id", hotelId);

    if (activateError) {
      console.error(`[ONBOARDING_FAILED] [${requestId}] step=activate error=${activateError.message}`);
      await updateAttempt(adminClient, attemptId, "incomplete", completedSteps, "activate", activateError.message);
      return errorResponse("activate", "HOTEL_ACTIVATION_FAILED", "Failed to activate hotel status.", true, attemptId, hotelId, 500, requestId);
    }

    completedSteps.push("activate");
    await updateAttempt(adminClient, attemptId, "completed", completedSteps);
    console.log(`[ONBOARDING_COMPLETED] [${requestId}] attemptId=${attemptId} hotelId=${hotelId}`);

    return jsonResponse(
      {
        success: true,
        hotel_id: hotelId,
        attempt_id: attemptId,
        completed_steps: completedSteps,
        total_rooms: body.total_rooms,
      },
      200,
      requestId
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown internal server error";
    console.error(`[ONBOARDING_UNCAUGHT_EXCEPTION] [${requestId}] error=${message}`);
    return errorResponse("server", "INTERNAL_SERVER_ERROR", "An unexpected error occurred during onboarding. Please try again.", true, null, null, 500, requestId);
  }
});

// ── Helpers ──

async function updateAttempt(
  client: any,
  attemptId: string,
  status: string,
  completedSteps: string[],
  failedStep?: string,
  errorMessage?: string,
) {
  try {
    await client.from("onboarding_attempts").update({
      status,
      completed_steps: completedSteps,
      failed_step: failedStep ?? null,
      error_message: errorMessage ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", attemptId);
  } catch (err: any) {
    console.warn(`[ONBOARDING_UPDATE_ATTEMPT_WARNING] attemptId=${attemptId}`, err.message);
  }
}

function validatePayload(body: OnboardingPayload): { valid: boolean; error?: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid payload format." };
  }
  if (!body.hotel_name || typeof body.hotel_name !== "string" || !body.hotel_name.trim()) {
    return { valid: false, error: "Hotel name is required." };
  }
  if (!body.owner_name || typeof body.owner_name !== "string" || !body.owner_name.trim()) {
    return { valid: false, error: "Owner name is required." };
  }
  
  // Strict RFC 5322 email regex without consecutive dots or malformed syntax
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  const cleanEmail = (body.admin_email || "").trim();
  if (!cleanEmail || !emailRegex.test(cleanEmail) || cleanEmail.includes("..")) {
    return { valid: false, error: "A valid owner email address is required (e.g. owner@hotel.com)." };
  }

  const cleanMobile = (body.mobile || "").replace(/\D/g, "");
  if (!cleanMobile || cleanMobile.length < 10) {
    return { valid: false, error: "Mobile number must contain at least 10 valid digits." };
  }

  if (typeof body.total_rooms !== "number" || body.total_rooms < 1 || !Number.isInteger(body.total_rooms)) {
    return { valid: false, error: "Total rooms must be a positive whole number (minimum 1)." };
  }
  if (!Array.isArray(body.categories) || body.categories.length === 0) {
    return { valid: false, error: "At least one room category is required." };
  }
  for (const cat of body.categories) {
    if (!cat.name || !cat.name.trim()) {
      return { valid: false, error: "All room categories must have a valid name." };
    }
  }
  if (!body.password || typeof body.password !== "string" || body.password.length < 6) {
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

function jsonResponse(data: Record<string, unknown>, status = 200, requestId?: string, headers = getCorsHeaders(null)) {
  return new Response(JSON.stringify({ ...data, request_id: requestId }), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
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
  requestId?: string,
  headers = getCorsHeaders(null),
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
    requestId,
    headers,
  );
}
