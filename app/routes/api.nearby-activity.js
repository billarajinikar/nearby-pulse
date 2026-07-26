import { authenticate } from "../shopify.server";
import { supabase } from "../services/supabase.server";
import {
  getClientIp,
  getLocationFromIp,
} from "../services/geo.server";

const ALLOWED_ANALYTICS_EVENT_TYPES = new Set([
  "widget_shown",
  "widget_clicked",
]);

const ALLOWED_STOREFRONT_EVENT_TYPES = new Set([
  "product_viewed",
  "add_to_cart",
  "checkout_started",
  "order_completed",
]);

const ALLOWED_ACTIVITY_EVENT_TYPES = [
  "order_completed",
  "checkout_started",
  "add_to_cart",
  "product_viewed",
];

const ACTIVITY_PRIORITY = {
  order_completed: 100,
  checkout_started: 80,
  add_to_cart: 60,
  product_viewed: 40,
};

const DEFAULT_TEMPLATES = {
  order_completed: [
    "Someone from {city} purchased {product} {time} ago.",
    "A customer near {city} ordered {product} {time} ago.",
    "{product} was purchased near {city} {time} ago.",
  ],

  checkout_started: [
    "A shopper near {city} started checkout with {product} {time} ago.",
    "Someone near {city} recently started checkout with {product}.",
  ],

  add_to_cart: [
    "A shopper near {city} added {product} to their cart {time} ago.",
    "Someone in {city} recently added {product} to their cart.",
  ],

  product_viewed: [
    "Someone near {city} viewed {product} {time} ago.",
    "{product} recently received attention near {city}.",
  ],
};

const DEFAULT_RESPONSE = {
  shouldShow: false,
  message: null,
};

const FALLBACK_ANNOUNCEMENT =
  "Shoppers in your area are viewing this product right now.";

function cleanString(value, maximumLength = 255) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maximumLength);
}

function toFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function clampNumber(
  value,
  minimum,
  maximum,
  fallback,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(
    minimum,
    Math.min(parsed, maximum),
  );
}

function getRandomItem(items) {
  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return null;
  }

  return items[
    Math.floor(Math.random() * items.length)
  ];
}

function normaliseProductId(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const productId = String(value).trim();

  if (!productId) {
    return null;
  }

  return productId.replace(
    "gid://shopify/Product/",
    "",
  );
}

function normaliseIdentifier(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return String(value).trim() || null;
}

function formatTimeSince(createdAt) {
  const createdTimestamp =
    new Date(createdAt).getTime();

  if (!Number.isFinite(createdTimestamp)) {
    return "recently";
  }

  const differenceMilliseconds = Math.max(
    0,
    Date.now() - createdTimestamp,
  );

  const differenceMinutes = Math.floor(
    differenceMilliseconds / 60000,
  );

  if (differenceMinutes < 2) {
    return "1 minute";
  }

  if (differenceMinutes < 60) {
    return `${differenceMinutes} minutes`;
  }

  const differenceHours = Math.floor(
    differenceMinutes / 60,
  );

  if (differenceHours < 24) {
    return differenceHours === 1
      ? "1 hour"
      : `${differenceHours} hours`;
  }

  const differenceDays = Math.floor(
    differenceHours / 24,
  );

  return differenceDays === 1
    ? "1 day"
    : `${differenceDays} days`;
}

function applyTemplate(template, values) {
  return String(template || "")
    .replaceAll(
      "{city}",
      values.city || "your area",
    )
    .replaceAll(
      "{time}",
      values.time || "recently",
    )
    .replaceAll(
      "{minutes}",
      values.time || "recently",
    )
    .replaceAll(
      "{product}",
      values.product || "this product",
    );
}

function calculateDistanceKm(
  firstLatitude,
  firstLongitude,
  secondLatitude,
  secondLongitude,
) {
  const latitude1 =
    toFiniteNumber(firstLatitude);

  const longitude1 =
    toFiniteNumber(firstLongitude);

  const latitude2 =
    toFiniteNumber(secondLatitude);

  const longitude2 =
    toFiniteNumber(secondLongitude);

  if (
    latitude1 === null ||
    longitude1 === null ||
    latitude2 === null ||
    longitude2 === null
  ) {
    return null;
  }

  const earthRadiusKm = 6371;

  const latitudeDifference =
    ((latitude2 - latitude1) * Math.PI) /
    180;

  const longitudeDifference =
    ((longitude2 - longitude1) *
      Math.PI) /
    180;

  const firstLatitudeRadians =
    (latitude1 * Math.PI) / 180;

  const secondLatitudeRadians =
    (latitude2 * Math.PI) / 180;

  const haversineValue =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      Math.sin(
        longitudeDifference / 2,
      ) **
        2;

  const angularDistance =
    2 *
    Math.atan2(
      Math.sqrt(haversineValue),
      Math.sqrt(1 - haversineValue),
    );

  return earthRadiusKm * angularDistance;
}

function isActivityNearby(
  activity,
  visitor,
  radiusKm,
) {
  const distance = calculateDistanceKm(
    visitor.latitude,
    visitor.longitude,
    activity.latitude,
    activity.longitude,
  );

  if (distance !== null) {
    return distance <= radiusKm;
  }

  const activityCity = cleanString(
    activity.visitor_city,
    150,
  )?.toLowerCase();

  const visitorCity = cleanString(
    visitor.city,
    150,
  )?.toLowerCase();

  if (!activityCity || !visitorCity) {
    return false;
  }

  return activityCity === visitorCity;
}

function selectBestActivity(activities) {
  if (
    !Array.isArray(activities) ||
    activities.length === 0
  ) {
    return null;
  }

  return [...activities].sort(
    (firstActivity, secondActivity) => {
      const priorityDifference =
        (ACTIVITY_PRIORITY[
          secondActivity.event_type
        ] || 0) -
        (ACTIVITY_PRIORITY[
          firstActivity.event_type
        ] || 0);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return (
        new Date(
          secondActivity.created_at,
        ).getTime() -
        new Date(
          firstActivity.created_at,
        ).getTime()
      );
    },
  )[0];
}

async function loadProductActivities({
  shop,
  productId,
  visitor,
  radiusKm,
}) {
  const thirtyDaysAgo = new Date(
    Date.now() -
      30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("storefront_activities")
    .select(
      `
        id,
        event_type,
        product_id,
        product_title,
        visitor_city,
        visitor_country,
        latitude,
        longitude,
        source,
        created_at
      `,
    )
    .eq("shop", shop)
    .eq("product_id", productId)
    .in(
      "event_type",
      ALLOWED_ACTIVITY_EVENT_TYPES,
    )
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", {
      ascending: false,
    })
    .limit(100);

  if (error) {
    console.error(
      "[NearbyPulse] Unable to load storefront activities:",
      error,
    );

    return [];
  }

  return (data || []).filter(
    (activity) =>
      isActivityNearby(
        activity,
        visitor,
        radiusKm,
      ),
  );
}

async function loadActivityTemplates(
  shop,
  eventType,
) {
  const { data, error } = await supabase
    .from("message_templates")
    .select(
      `
        template,
        event_type,
        is_announcement,
        is_enabled,
        sort_order
      `,
    )
    .eq("shop", shop)
    .eq("event_type", eventType)
    .eq("is_announcement", false)
    .eq("is_enabled", true)
    .order("sort_order", {
      ascending: true,
    });

  if (error) {
    console.error(
      `[NearbyPulse] Unable to load ${eventType} templates:`,
      error,
    );

    return [];
  }

  return (data || [])
    .map((item) =>
      cleanString(item.template, 500),
    )
    .filter(Boolean);
}

async function loadAnnouncements(shop) {
  const { data, error } = await supabase
    .from("message_templates")
    .select(
      `
        template,
        event_type,
        is_announcement,
        is_enabled,
        sort_order
      `,
    )
    .eq("shop", shop)
    .eq("event_type", "announcement")
    .eq("is_announcement", true)
    .eq("is_enabled", true)
    .order("sort_order", {
      ascending: true,
    });

  if (error) {
    console.error(
      "[NearbyPulse] Unable to load merchant announcements:",
      error,
    );

    return [];
  }

  return (data || [])
    .map((item) =>
      cleanString(item.template, 500),
    )
    .filter(Boolean);
}

function selectTemplate(
  templates,
  messageMode,
) {
  if (
    !Array.isArray(templates) ||
    templates.length === 0
  ) {
    return null;
  }

  if (messageMode === "first") {
    return templates[0];
  }

  return getRandomItem(templates);
}

async function resolveDisplayedCity({
  settings,
  visitor,
  activity,
}) {
  const activityCity = cleanString(
    activity?.visitor_city,
    150,
  );

  if (
    settings.city_mode !== "nearest"
  ) {
    return (
      activityCity ||
      cleanString(visitor.city, 150) ||
      "your area"
    );
  }

  const latitude = toFiniteNumber(
    visitor.latitude,
  );

  const longitude = toFiniteNumber(
    visitor.longitude,
  );

  if (
    latitude === null ||
    longitude === null
  ) {
    return (
      activityCity ||
      cleanString(visitor.city, 150) ||
      "your area"
    );
  }

  const radiusKm = clampNumber(
    settings.radius_km,
    1,
    1000,
    100,
  );

  const { data, error } =
    await supabase.rpc("nearby_cities", {
      input_lat: latitude,
      input_lng: longitude,
      radius_meters:
        radiusKm * 1000,
    });

  if (
    error ||
    !Array.isArray(data) ||
    data.length === 0
  ) {
    if (error) {
      console.error(
        "[NearbyPulse] Unable to load nearest city:",
        error,
      );
    }

    return (
      activityCity ||
      cleanString(visitor.city, 150) ||
      "your area"
    );
  }

  if (activityCity) {
    const matchingCity = data.find(
      (city) =>
        cleanString(
          city.name,
          150,
        )?.toLowerCase() ===
        activityCity.toLowerCase(),
    );

    if (matchingCity?.name) {
      return cleanString(
        matchingCity.name,
        150,
      );
    }
  }

  return (
    cleanString(data[0]?.name, 150) ||
    activityCity ||
    cleanString(visitor.city, 150) ||
    "your area"
  );
}

async function buildActivityMessage({
  shop,
  settings,
  activity,
  visitor,
  productTitle,
}) {
  if (!activity) {
    return null;
  }

  const eventType =
    activity.event_type;

  if (
    !ALLOWED_ACTIVITY_EVENT_TYPES.includes(
      eventType,
    )
  ) {
    return null;
  }

  let templates =
    await loadActivityTemplates(
      shop,
      eventType,
    );

  if (templates.length === 0) {
    templates =
      DEFAULT_TEMPLATES[eventType] || [];
  }

  const selectedTemplate =
    selectTemplate(
      templates,
      settings.message_mode,
    );

  if (!selectedTemplate) {
    return null;
  }

  const displayedCity =
    await resolveDisplayedCity({
      settings,
      visitor,
      activity,
    });

  const message = applyTemplate(
    selectedTemplate,
    {
      city: displayedCity,

      time: formatTimeSince(
        activity.created_at,
      ),

      product:
        cleanString(
          activity.product_title,
          255,
        ) ||
        productTitle ||
        "this product",
    },
  );

  return {
    message,

    /*
     * The dashboard uses this value to distinguish
     * genuine activity from merchant-created messages.
     */
    messageType: "activity",

    displayedCity,

    sourceActivityId:
      activity.id,

    /*
     * This keeps the detailed activity source:
     * product_viewed, add_to_cart, checkout_started
     * or order_completed.
     */
    sourceActivityType:
      eventType,
  };
}

function buildAnnouncementMessage({
  announcements,
  settings,
}) {
  const safeAnnouncements =
    announcements.filter(
      (message) =>
        !/{[^}]+}/.test(
          String(message || ""),
        ),
    );

  const selectedMessage =
    selectTemplate(
      safeAnnouncements,
      settings.message_mode,
    );

  if (!selectedMessage) {
    return null;
  }

  return {
    message: selectedMessage,
    messageType: "announcement",
    displayedCity: null,
    sourceActivityId: null,
    sourceActivityType: null,
  };
}

function buildTrackingPayload({
  productId,
  productTitle,
  visitor,
  selectedMessage,
}) {
  return {
    productId,
    productTitle,

    visitorCity: cleanString(
      visitor?.city,
      150,
    ),

    visitorCountry: cleanString(
      visitor?.countryCode ||
        visitor?.country,
      10,
    ),

    displayedCity:
      selectedMessage.displayedCity ||
      null,

    messageText:
      selectedMessage.message,

    messageType:
      selectedMessage.messageType,

    sourceActivityId:
      selectedMessage.sourceActivityId ||
      null,

    sourceActivityType:
      selectedMessage.sourceActivityType ||
      null,
  };
}

export async function loader({ request }) {
  let shop;

  try {
    const proxy =
      await authenticate.public.appProxy(
        request,
      );

    shop =
      proxy.session?.shop ||
      new URL(request.url).searchParams.get(
        "shop",
      );
  } catch (error) {
    console.error(
      "[NearbyPulse] App-proxy authentication failed:",
      error,
    );

    return Response.json(
      DEFAULT_RESPONSE,
      {
        status: 401,
      },
    );
  }

  if (!shop) {
    return Response.json({
      ...DEFAULT_RESPONSE,
      debugReason: "missing_shop",
    });
  }

  const requestUrl = new URL(
    request.url,
  );

  const productId =
    normaliseProductId(
      requestUrl.searchParams.get(
        "product_id",
      ),
    );

  const productTitle = cleanString(
    requestUrl.searchParams.get(
      "product_title",
    ),
    255,
  );

  if (!productId) {
    return Response.json({
      ...DEFAULT_RESPONSE,
      debugReason:
        "missing_product_id",
    });
  }

  const {
    data: settings,
    error: settingsError,
  } = await supabase
    .from("shop_settings")
    .select("*")
    .eq("shop", shop)
    .maybeSingle();

  if (settingsError) {
    console.error(
      "[NearbyPulse] Unable to load shop settings:",
      settingsError,
    );

    return Response.json({
      ...DEFAULT_RESPONSE,
      debugReason:
        "settings_query_failed",
    });
  }

  if (!settings) {
    return Response.json({
      ...DEFAULT_RESPONSE,
      debugReason:
        "settings_not_found",
    });
  }

  if (settings.is_enabled !== true) {
    return Response.json({
      ...DEFAULT_RESPONSE,
      debugReason: "app_disabled",
    });
  }

  const clientIp = getClientIp(request);

  let visitor;

  try {
    visitor =
      await getLocationFromIp(
        clientIp,
      );
  } catch (error) {
    console.error(
      "[NearbyPulse] Unable to resolve visitor location:",
      error,
    );

    return Response.json({
      ...DEFAULT_RESPONSE,
      debugReason:
        "location_lookup_failed",
    });
  }

  const visitorLatitude =
    toFiniteNumber(
      visitor?.latitude,
    );

  const visitorLongitude =
    toFiniteNumber(
      visitor?.longitude,
    );

  if (
    !visitor ||
    visitorLatitude === null ||
    visitorLongitude === null
  ) {
    return Response.json({
      ...DEFAULT_RESPONSE,
      debugReason:
        "visitor_location_unavailable",
    });
  }

  const normalisedVisitor = {
    ...visitor,
    latitude: visitorLatitude,
    longitude: visitorLongitude,
  };

  const radiusKm = clampNumber(
    settings.radius_km,
    1,
    1000,
    100,
  );

  const activities =
    await loadProductActivities({
      shop,
      productId,
      visitor: normalisedVisitor,
      radiusKm,
    });

  const selectedActivity =
    selectBestActivity(activities);

  const announcements =
    await loadAnnouncements(shop);

  const announcementPercentage =
    clampNumber(
      settings.announcement_percentage,
      0,
      100,
      20,
    );

  const shouldPreferAnnouncement =
    announcements.length > 0 &&
    Math.random() * 100 <
      announcementPercentage;

  let selectedMessage = null;

  if (shouldPreferAnnouncement) {
    selectedMessage =
      buildAnnouncementMessage({
        announcements,
        settings,
      });
  }

  if (
    !selectedMessage &&
    selectedActivity
  ) {
    selectedMessage =
      await buildActivityMessage({
        shop,
        settings,
        activity:
          selectedActivity,
        visitor:
          normalisedVisitor,
        productTitle,
      });
  }

  if (
    !selectedMessage &&
    announcements.length > 0
  ) {
    selectedMessage =
      buildAnnouncementMessage({
        announcements,
        settings,
      });
  }

  if (
    !selectedMessage ||
    !selectedMessage.message
  ) {
    const fallbackMessage =
      cleanString(
        settings.fixed_message,
        500,
      );

    const message =
      fallbackMessage ||
      FALLBACK_ANNOUNCEMENT;

    selectedMessage = {
      message,
      messageType: "announcement",
      displayedCity: null,
      sourceActivityId: null,
      sourceActivityType: null,
    };
  }

  return Response.json({
    shouldShow: true,

    message:
      selectedMessage.message,

    messageType:
      selectedMessage.messageType,

    tracking: buildTrackingPayload({
      productId,
      productTitle,
      visitor:
        normalisedVisitor,
      selectedMessage,
    }),

    displaySeconds:
      clampNumber(
        settings.display_seconds,
        3,
        30,
        10,
      ),

    cooldownMinutes:
      clampNumber(
        settings.cooldown_minutes,
        0,
        180,
        15,
      ),

    maxPerProductPerHour:
      clampNumber(
        settings.max_per_product_per_hour,
        1,
        20,
        3,
      ),
  });
}

export async function action({ request }) {
  let shop;

  try {
    const proxy =
      await authenticate.public.appProxy(
        request,
      );

    shop =
      proxy.session?.shop ||
      new URL(request.url).searchParams.get(
        "shop",
      );
  } catch (error) {
    console.error(
      "[NearbyPulse] Analytics authentication failed:",
      error,
    );

    return Response.json(
      {
        success: false,
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  if (!shop) {
    return Response.json(
      {
        success: false,
        error: "Missing shop",
      },
      {
        status: 400,
      },
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        success: false,
        error: "Invalid JSON body",
      },
      {
        status: 400,
      },
    );
  }

  const eventType = cleanString(
    body.event_type ||
      body.eventType,
    50,
  );

  if (!eventType) {
    return Response.json(
      {
        success: false,
        error: "Missing event type",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Store genuine storefront activity separately.
   */
  if (
    ALLOWED_STOREFRONT_EVENT_TYPES.has(
      eventType,
    )
  ) {
    const productId =
      normaliseProductId(
        body.productId ||
          body.product_id,
      );

    if (!productId) {
      return Response.json(
        {
          success: false,
          error: "Missing product ID",
        },
        {
          status: 400,
        },
      );
    }

    const clientIp =
      getClientIp(request);

    let location = null;

    try {
      location =
        await getLocationFromIp(
          clientIp,
        );
    } catch (error) {
      console.error(
        "[NearbyPulse] Unable to resolve activity location:",
        error,
      );
    }

    const storefrontRow = {
      shop,

      event_type: eventType,

      product_id: productId,

      product_title: cleanString(
        body.productTitle ||
          body.product_title,
        255,
      ),

      visitor_city: cleanString(
        location?.city,
        150,
      ),

      visitor_country: cleanString(
        location?.countryCode ||
          location?.country,
        10,
      ),

      latitude: toFiniteNumber(
        location?.latitude,
      ),

      longitude: toFiniteNumber(
        location?.longitude,
      ),

      source: "theme_extension",

      created_at:
        new Date().toISOString(),
    };

    const { error } = await supabase
      .from("storefront_activities")
      .insert(storefrontRow);

    if (error) {
      console.error(
        "[NearbyPulse] Unable to record storefront activity:",
        error,
      );

      return Response.json(
        {
          success: false,
          error:
            "Unable to record storefront activity",
        },
        {
          status: 500,
        },
      );
    }

    return Response.json({
      success: true,
      eventType,
      recordedIn:
        "storefront_activities",
    });
  }

  /*
   * Only widget-generated analytics events are accepted here.
   */
  if (
    !ALLOWED_ANALYTICS_EVENT_TYPES.has(
      eventType,
    )
  ) {
    return Response.json(
      {
        success: false,
        error:
          "Invalid analytics event type",
      },
      {
        status: 400,
      },
    );
  }

  const messageType = cleanString(
    body.messageType ||
      body.message_type,
    50,
  );

  const sourceActivityType =
    cleanString(
      body.sourceActivityType ||
        body.source_activity_type,
      50,
    );

  const analyticsRow = {
    shop,

    event_type: eventType,

    product_id:
      normaliseProductId(
        body.productId ||
          body.product_id,
      ),

    product_title:
      cleanString(
        body.productTitle ||
          body.product_title,
        255,
      ),

    visitor_city:
      cleanString(
        body.visitorCity ||
          body.visitor_city,
        150,
      ),

    visitor_country:
      cleanString(
        body.visitorCountry ||
          body.visitor_country,
        10,
      ),

    displayed_city:
      cleanString(
        body.displayedCity ||
          body.displayed_city,
        150,
      ),

    message_text:
      cleanString(
        body.messageText ||
          body.message_text,
        500,
      ),

    /*
     * Values:
     * activity
     * announcement
     */
    message_type:
      messageType,

    /*
     * Links the analytics event to the genuine
     * storefront activity when one exists.
     */
    source_activity_id:
      normaliseIdentifier(
        body.sourceActivityId ||
          body.source_activity_id,
      ),

    /*
     * Values:
     * product_viewed
     * add_to_cart
     * checkout_started
     * order_completed
     */
    source_activity_type:
      sourceActivityType,
  };

  const { error } = await supabase
    .from("analytics_events")
    .insert(analyticsRow);

  if (error) {
    console.error(
      "[NearbyPulse] Unable to save analytics event:",
      error,
    );

    return Response.json(
      {
        success: false,
        error:
          "Unable to record analytics event",
      },
      {
        status: 500,
      },
    );
  }

  return Response.json({
    success: true,
    eventType,
    messageType,
    sourceActivityType,
  });
}
