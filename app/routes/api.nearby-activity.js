import { authenticate } from "../shopify.server";
import { supabase } from "../services/supabase.server";

import {
  getClientIp,
  getLocationFromIp,
} from "../services/geo.server";


/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const ALLOWED_ANALYTICS_EVENT_TYPES =
  new Set([
    "widget_shown",
    "widget_clicked",
  ]);

const ALLOWED_STOREFRONT_EVENT_TYPES =
  new Set([
    "product_viewed",
    "add_to_cart",
    "checkout_started",
  ]);
const ALLOWED_ACTIVITY_EVENT_TYPES = [
  "order_completed",
  "checkout_started",
  "add_to_cart",
  "product_viewed",
];


/*
 * Event importance is deliberately kept much smaller
 * than the freshness score.
 *
 * This prevents a 6-day-old purchase from always
 * beating a product view from 2 minutes ago.
 */
const ACTIVITY_VALUE_SCORE = {
  order_completed: 40,
  checkout_started: 30,
  add_to_cart: 20,
  product_viewed: 10,
};


/*
 * Default freshness windows.
 *
 * Later these values can be controlled from Settings.
 */
const DEFAULT_FRESHNESS = {
  order_completed: {
    milliseconds:
      7 * 24 * 60 * 60 * 1000,
  },

  checkout_started: {
    milliseconds:
      24 * 60 * 60 * 1000,
  },

  add_to_cart: {
    milliseconds:
      12 * 60 * 60 * 1000,
  },

  product_viewed: {
    milliseconds:
      3 * 60 * 60 * 1000,
  },
};


/*
|--------------------------------------------------------------------------
| Default activity templates
|--------------------------------------------------------------------------
|
| These are used only when the merchant does not have
| a suitable custom template.
|
| Notice that we maintain separate templates for:
|
| 1. City available
| 2. City unavailable
|
| We never insert "your area".
|--------------------------------------------------------------------------
*/

const DEFAULT_TEMPLATES_WITH_CITY = {
  order_completed: [
    "Someone near {city} purchased {product} {time} ago.",
    "A customer near {city} ordered {product} {time} ago.",
  ],

  checkout_started: [
    "A shopper near {city} started checkout with {product} {time} ago.",
    "Someone near {city} recently started checkout with {product}.",
  ],

  add_to_cart: [
    "A shopper near {city} added {product} to their cart {time} ago.",
    "Someone near {city} recently added {product} to their cart.",
  ],

  product_viewed: [
    "Someone near {city} viewed {product} {time} ago.",
    "{product} recently received attention near {city}.",
  ],
};


const DEFAULT_TEMPLATES_WITHOUT_CITY = {
  order_completed: [
    "Someone recently purchased {product}.",
    "{product} was purchased {time} ago.",
  ],

  checkout_started: [
    "A shopper recently started checkout with {product}.",
    "Someone started checkout with {product} {time} ago.",
  ],

  add_to_cart: [
    "A shopper recently added {product} to their cart.",
    "Someone added {product} to their cart {time} ago.",
  ],

  product_viewed: [
    "Someone recently viewed {product}.",
    "{product} was viewed {time} ago.",
  ],
};


const DEFAULT_RESPONSE = {
  shouldShow: false,
  message: null,
};


/*
 * Used only for converting activity coordinates into
 * an approximate nearby city.
 *
 * This is NOT the merchant's social-proof radius.
 */
const CITY_RESOLUTION_RADIUS_KM = 50;


/*
|--------------------------------------------------------------------------
| Generic helpers
|--------------------------------------------------------------------------
*/

function cleanString(
  value,
  maximumLength = 255,
) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(
    0,
    maximumLength,
  );
}


function toFiniteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
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


function normaliseProductId(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const productId =
    String(value).trim();

  if (!productId) {
    return null;
  }

  return productId.replace(
    "gid://shopify/Product/",
    "",
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
    Math.floor(
      Math.random() * items.length,
    )
  ];
}


/*
|--------------------------------------------------------------------------
| HTML / product-title helpers
|--------------------------------------------------------------------------
*/

function decodeHtmlEntities(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(
      /&#(\d+);/g,
      (_, code) => {
        const characterCode =
          Number(code);

        if (
          !Number.isFinite(
            characterCode,
          )
        ) {
          return _;
        }

        return String.fromCodePoint(
          characterCode,
        );
      },
    );
}


function formatProductForMessage(
  value,
  maximumLength = 60,
) {
  const title =
    decodeHtmlEntities(
      cleanString(value, 255) ||
        "this product",
    ).trim();

  if (
    title.length <= maximumLength
  ) {
    return title;
  }

  return (
    title
      .slice(
        0,
        maximumLength - 1,
      )
      .trim()
      .replace(
        /[\s,;:.-]+$/,
        "",
      ) + "…"
  );
}


/*
|--------------------------------------------------------------------------
| Time formatting
|--------------------------------------------------------------------------
*/

function formatTimeSince(createdAt) {
  const createdTimestamp =
    new Date(
      createdAt,
    ).getTime();

  if (
    !Number.isFinite(
      createdTimestamp,
    )
  ) {
    return "recently";
  }

  const differenceMilliseconds =
    Math.max(
      0,
      Date.now() -
        createdTimestamp,
    );

  const differenceMinutes =
    Math.floor(
      differenceMilliseconds /
        60000,
    );

  /*
   * Avoid pretending something happened
   * exactly one minute ago when it may
   * only have happened seconds ago.
   */
  if (differenceMinutes < 2) {
    return "1 minute";
  }

  if (
    differenceMinutes < 60
  ) {
    return `${differenceMinutes} minutes`;
  }

  const differenceHours =
    Math.floor(
      differenceMinutes / 60,
    );

  if (differenceHours < 24) {
    return differenceHours === 1
      ? "1 hour"
      : `${differenceHours} hours`;
  }

  const differenceDays =
    Math.floor(
      differenceHours / 24,
    );

  return differenceDays === 1
    ? "1 day"
    : `${differenceDays} days`;
}


/*
|--------------------------------------------------------------------------
| Template helpers
|--------------------------------------------------------------------------
*/

function templateContainsCity(
  template,
) {
  return String(
    template || "",
  ).includes("{city}");
}


function applyTemplate(
  template,
  {
    city,
    time,
    product,
  },
) {
  let result =
    String(template || "");

  /*
   * City placeholders are only rendered
   * when an actual activity city exists.
   */
  if (city) {
    result =
      result.replaceAll(
        "{city}",
        city,
      );
  }

  result = result
    .replaceAll(
      "{time}",
      time || "recently",
    )
    .replaceAll(
      "{minutes}",
      time || "recently",
    )
    .replaceAll(
      "{product}",
      product ||
        "this product",
    );

  /*
   * Final safety check.
   *
   * Never return an unresolved placeholder
   * to the storefront.
   */
  if (/{[^}]+}/.test(result)) {
    return null;
  }

  return result
    .replace(/\s+/g, " ")
    .trim();
}


/*
|--------------------------------------------------------------------------
| Geo helpers
|--------------------------------------------------------------------------
*/

function calculateDistanceKm(
  firstLatitude,
  firstLongitude,
  secondLatitude,
  secondLongitude,
) {
  const latitude1 =
    toFiniteNumber(
      firstLatitude,
    );

  const longitude1 =
    toFiniteNumber(
      firstLongitude,
    );

  const latitude2 =
    toFiniteNumber(
      secondLatitude,
    );

  const longitude2 =
    toFiniteNumber(
      secondLongitude,
    );

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
    ((latitude2 -
      latitude1) *
      Math.PI) /
    180;

  const longitudeDifference =
    ((longitude2 -
      longitude1) *
      Math.PI) /
    180;

  const latitude1Radians =
    (latitude1 *
      Math.PI) /
    180;

  const latitude2Radians =
    (latitude2 *
      Math.PI) /
    180;

  const haversineValue =
    Math.sin(
      latitudeDifference / 2,
    ) **
      2 +
    Math.cos(
      latitude1Radians,
    ) *
      Math.cos(
        latitude2Radians,
      ) *
      Math.sin(
        longitudeDifference / 2,
      ) **
        2;

  const angularDistance =
    2 *
    Math.atan2(
      Math.sqrt(
        haversineValue,
      ),
      Math.sqrt(
        1 - haversineValue,
      ),
    );

  return (
    earthRadiusKm *
    angularDistance
  );
}


function isActivityNearby({
  activity,
  visitor,
  radiusKm,
}) {
  if (
    !activity ||
    !visitor
  ) {
    return false;
  }

  const distance =
    calculateDistanceKm(
      visitor.latitude,
      visitor.longitude,
      activity.latitude,
      activity.longitude,
    );

  /*
   * Coordinate distance is preferred.
   */
  if (distance !== null) {
    return (
      distance <= radiusKm
    );
  }

  /*
   * If coordinates are unavailable,
   * exact city matching is acceptable.
   */
  const activityCity =
    cleanString(
      activity.visitor_city,
      150,
    )?.toLowerCase();

  const visitorCity =
    cleanString(
      visitor.city,
      150,
    )?.toLowerCase();

  if (
    !activityCity ||
    !visitorCity
  ) {
    return false;
  }

  return (
    activityCity ===
    visitorCity
  );
}


/*
|--------------------------------------------------------------------------
| Freshness
|--------------------------------------------------------------------------
*/

function getFreshnessWindowMs(
  eventType,
  settings,
) {
  switch (eventType) {
    case "order_completed": {
      const days =
        clampNumber(
          settings
            ?.activity_max_age_purchase_days,
          1,
          30,
          7,
        );

      return (
        days *
        24 *
        60 *
        60 *
        1000
      );
    }

    case "checkout_started": {
      const hours =
        clampNumber(
          settings
            ?.activity_max_age_checkout_hours,
          1,
          168,
          24,
        );

      return (
        hours *
        60 *
        60 *
        1000
      );
    }

    case "add_to_cart": {
      const hours =
        clampNumber(
          settings
            ?.activity_max_age_cart_hours,
          1,
          168,
          12,
        );

      return (
        hours *
        60 *
        60 *
        1000
      );
    }

    case "product_viewed": {
      const hours =
        clampNumber(
          settings
            ?.activity_max_age_view_hours,
          1,
          72,
          3,
        );

      return (
        hours *
        60 *
        60 *
        1000
      );
    }

    default:
      return 0;
  }
}


function isActivityFresh(
  activity,
  settings,
) {
  const maxAge =
    getFreshnessWindowMs(
      activity.event_type,
      settings,
    );

  if (maxAge <= 0) {
    return false;
  }

  const createdTimestamp =
    new Date(
      activity.created_at,
    ).getTime();

  if (
    !Number.isFinite(
      createdTimestamp,
    )
  ) {
    return false;
  }

  const age =
    Date.now() -
    createdTimestamp;

  return (
    age >= 0 &&
    age <= maxAge
  );
}


function calculateActivityScore(
  activity,
  settings,
) {
  const maxAge =
    getFreshnessWindowMs(
      activity.event_type,
      settings,
    );

  if (maxAge <= 0) {
    return -Infinity;
  }

  const createdTimestamp =
    new Date(
      activity.created_at,
    ).getTime();

  if (
    !Number.isFinite(
      createdTimestamp,
    )
  ) {
    return -Infinity;
  }

  const age =
    Math.max(
      0,
      Date.now() -
        createdTimestamp,
    );

  const remainingRatio =
    Math.max(
      0,
      1 - age / maxAge,
    );

  /*
   * Freshness contributes 0–100.
   *
   * Activity value contributes only
   * 10–40.
   *
   * Therefore very recent activity can
   * beat much older high-value activity.
   */
  const freshnessScore =
    remainingRatio * 100;

  const valueScore =
    ACTIVITY_VALUE_SCORE[
      activity.event_type
    ] || 0;

  return (
    freshnessScore +
    valueScore
  );
}


function selectBestActivity(
  activities,
  settings,
) {
  if (
    !Array.isArray(
      activities,
    ) ||
    activities.length === 0
  ) {
    return null;
  }

  return [...activities]
    .map((activity) => ({
      activity,
      score:
        calculateActivityScore(
          activity,
          settings,
        ),
    }))
    .sort(
      (first, second) =>
        second.score -
        first.score,
    )[0]?.activity || null;
}


/*
|--------------------------------------------------------------------------
| Load storefront activities
|--------------------------------------------------------------------------
*/

async function loadProductActivities({
  shop,
  productId,
  visitor,
  radiusKm,
  settings,
  currentSessionId,
}) {
  /*
   * Maximum possible age from all
   * configured activity types.
   */
  const freshnessWindows =
    ALLOWED_ACTIVITY_EVENT_TYPES.map(
      (eventType) =>
        getFreshnessWindowMs(
          eventType,
          settings,
        ),
    );

  const maximumAgeMs =
    Math.max(
      ...freshnessWindows,
      0,
    );

  const oldestAllowedDate =
    new Date(
      Date.now() -
        maximumAgeMs,
    ).toISOString();

  const {
    data,
    error,
  } = await supabase
    .from(
      "storefront_activities",
    )
    .select(
      `
        id,
    event_type,
    product_id,
    product_title,
    visitor_session_id,
    visitor_city,
    visitor_country,
    latitude,
    longitude,
    source,
    verified,
    created_at
      `,
    )
    .eq(
      "shop",
      shop,
    )
    .eq(
      "product_id",
      productId,
    )
    .in(
      "event_type",
      ALLOWED_ACTIVITY_EVENT_TYPES,
    )
    .gte(
      "created_at",
      oldestAllowedDate,
    )
    .order(
      "created_at",
      {
        ascending: false,
      },
    )
    .limit(100);

  if (error) {
    console.error(
      "[NearbyPulse] Unable to load storefront activities:",
      error,
    );

    return [];
  }

  return (data || []).filter(
  (activity) => {

    /*
    |--------------------------------------------------------------------------
    | Self-activity exclusion
    |--------------------------------------------------------------------------
    |
    | Never show a shopper an activity generated
    | by their own current anonymous session.
    |
    | Old records with NULL session IDs remain eligible.
    |--------------------------------------------------------------------------
    */

    const activitySessionId =
      normaliseSessionId(
        activity.visitor_session_id,
      );

    if (
      currentSessionId &&
      activitySessionId &&
      activitySessionId ===
        currentSessionId
    ) {
      return false;
    }


    /*
     * Browser-generated purchase activity is
     * never considered verified.
     */
    if (
      activity.event_type ===
        "order_completed" &&
      activity.verified !== true
    ) {
      return false;
    }


    if (
      !isActivityFresh(
        activity,
        settings,
      )
    ) {
      return false;
    }


    return isActivityNearby({
      activity,
      visitor,
      radiusKm,
    });
  },
);
}


/*
|--------------------------------------------------------------------------
| Activity city resolution
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| The city is resolved from the ACTIVITY,
| never from the current visitor.
|--------------------------------------------------------------------------
*/

async function resolveActivityCity(
  activity,
) {
  const storedActivityCity =
    cleanString(
      activity?.visitor_city,
      150,
    );

  if (storedActivityCity) {
    return storedActivityCity;
  }

  const latitude =
    toFiniteNumber(
      activity?.latitude,
    );

  const longitude =
    toFiniteNumber(
      activity?.longitude,
    );

  if (
    latitude === null ||
    longitude === null
  ) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    "nearby_cities",
    {
      input_lat: latitude,
      input_lng: longitude,
      radius_meters:
        CITY_RESOLUTION_RADIUS_KM *
        1000,
    },
  );

  if (error) {
    console.error(
      "[NearbyPulse] Unable to resolve activity city:",
      error,
    );

    return null;
  }

  if (
    !Array.isArray(data) ||
    data.length === 0
  ) {
    return null;
  }

  return cleanString(
    data[0]?.name,
    150,
  );
}


/*
|--------------------------------------------------------------------------
| Templates
|--------------------------------------------------------------------------
*/

async function loadActivityTemplates(
  shop,
  eventType,
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      "message_templates",
    )
    .select(
      `
        id,
        template,
        sort_order
      `,
    )
    .eq(
      "shop",
      shop,
    )
    .eq(
      "event_type",
      eventType,
    )
    .eq(
      "is_announcement",
      false,
    )
    .eq(
      "is_enabled",
      true,
    )
    .order(
      "sort_order",
      {
        ascending: true,
      },
    );

  if (error) {
    console.error(
      `[NearbyPulse] Unable to load ${eventType} templates:`,
      error,
    );

    return [];
  }

  return (data || [])
    .map((row) => ({
      id: row.id,
      template:
        cleanString(
          row.template,
          500,
        ),
    }))
    .filter(
      (row) =>
        Boolean(row.template),
    );
}


async function loadAnnouncements(
  shop,
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      "message_templates",
    )
    .select(
      `
        id,
        template,
        sort_order
      `,
    )
    .eq(
      "shop",
      shop,
    )
    .eq(
      "event_type",
      "announcement",
    )
    .eq(
      "is_announcement",
      true,
    )
    .eq(
      "is_enabled",
      true,
    )
    .order(
      "sort_order",
      {
        ascending: true,
      },
    );

  if (error) {
    console.error(
      "[NearbyPulse] Unable to load merchant announcements:",
      error,
    );

    return [];
  }

  /*
   * Announcements may not masquerade as
   * activity through placeholders.
   */
  return (data || [])
    .map((row) => ({
      id: row.id,

      template:
        cleanString(
          row.template,
          500,
        ),
    }))
    .filter(
      (row) =>
        row.template &&
        !/{[^}]+}/.test(
          row.template,
        ),
    );
}


function selectTemplate(
  templates,
  messageMode,
) {
  if (
    !Array.isArray(
      templates,
    ) ||
    templates.length === 0
  ) {
    return null;
  }

  if (
    messageMode === "first"
  ) {
    return templates[0];
  }

  return getRandomItem(
    templates,
  );
}


/*
|--------------------------------------------------------------------------
| Build activity message
|--------------------------------------------------------------------------
*/

async function buildActivityMessage({
  shop,
  settings,
  activity,
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

  const city =
    await resolveActivityCity(
      activity,
    );

  const merchantTemplates =
    await loadActivityTemplates(
      shop,
      eventType,
    );


  /*
   * When city is unavailable:
   *
   * Do not use a merchant template containing {city},
   * because we would have to invent a location.
   */
  let usableMerchantTemplates =
    merchantTemplates;

  if (!city) {
    usableMerchantTemplates =
      merchantTemplates.filter(
        (template) =>
          !templateContainsCity(
            template.template,
          ),
      );
  }


  let selectedTemplate =
    selectTemplate(
      usableMerchantTemplates,
      settings.message_mode,
    );


  /*
   * Merchant has no suitable template.
   *
   * Fall back to truthful defaults.
   */
  if (!selectedTemplate) {
    const defaults = city
      ? DEFAULT_TEMPLATES_WITH_CITY[
          eventType
        ]
      : DEFAULT_TEMPLATES_WITHOUT_CITY[
          eventType
        ];

    const selectedDefault =
      selectTemplate(
        defaults,
        settings.message_mode,
      );

    if (!selectedDefault) {
      return null;
    }

    selectedTemplate = {
      id: null,
      template:
        selectedDefault,
    };
  }


  const formattedProduct =
    formatProductForMessage(
      activity.product_title ||
        productTitle ||
        "this product",
    );

  const message =
    applyTemplate(
      selectedTemplate.template,
      {
        city,
        time:
          formatTimeSince(
            activity.created_at,
          ),
        product:
          formattedProduct,
      },
    );

  if (!message) {
    return null;
  }

  return {
    message,

    messageType:
      "activity",

    displayedCity:
      city || null,

    sourceActivityId:
      activity.id,

    sourceActivityType:
      eventType,

    templateId:
      selectedTemplate.id ||
      null,
  };
}


/*
|--------------------------------------------------------------------------
| Merchant announcements
|--------------------------------------------------------------------------
*/

function buildAnnouncementMessage({
  announcements,
  settings,
}) {
  const selected =
    selectTemplate(
      announcements,
      settings.message_mode,
    );

  if (
    !selected?.template
  ) {
    return null;
  }

  return {
    message:
      selected.template,

    messageType:
      "announcement",

    displayedCity:
      null,

    sourceActivityId:
      null,

    sourceActivityType:
      null,

    templateId:
      selected.id || null,
  };
}


/*
|--------------------------------------------------------------------------
| Server-side impression
|--------------------------------------------------------------------------
*/

async function createWidgetImpression({
  shop,
  productId,
  productTitle,
  selectedMessage,
  visitorSessionId,
}) {
  const displayToken =
    crypto.randomUUID();

  const impressionRow = {
    display_token:
      displayToken,

    shop,

    product_id:
      productId,

    product_title:
      cleanString(
        decodeHtmlEntities(
          productTitle || "",
        ),
        255,
      ),
    visitor_session_id:
    visitorSessionId ||
    null,

    activity_id:
      selectedMessage
        .sourceActivityId ||
      null,

    template_id:
      selectedMessage
        .templateId ||
      null,

    message_type:
      selectedMessage
        .messageType,

    source_activity_type:
      selectedMessage
        .sourceActivityType ||
      null,

    displayed_city:
      selectedMessage
        .displayedCity ||
      null,

    rendered_message:
      selectedMessage.message,
  };

  const {
    data,
    error,
  } = await supabase
    .from(
      "widget_impressions",
    )
    .insert(
      impressionRow,
    )
    .select(
      `
        id,
        display_token
      `,
    )
    .single();

  if (error) {
    console.error(
      "[NearbyPulse] Unable to create widget impression:",
      error,
    );

    return null;
  }

  return {
    id: data.id,
    displayToken:
      data.display_token,
  };
}


/*
|--------------------------------------------------------------------------
| Resolve visitor safely
|--------------------------------------------------------------------------
*/

async function resolveVisitor(
  request,
) {
  const clientIp =
    getClientIp(request);

  if (!clientIp) {
    return null;
  }

  try {
    const location =
      await getLocationFromIp(
        clientIp,
      );

    if (!location) {
      return null;
    }

    return {
      ...location,

      latitude:
        toFiniteNumber(
          location.latitude,
        ),

      longitude:
        toFiniteNumber(
          location.longitude,
        ),

      city:
        cleanString(
          location.city,
          150,
        ),

      countryCode:
        cleanString(
          location.countryCode ||
            location.country,
          10,
        ),
    };
  } catch (error) {
    console.error(
      "[NearbyPulse] Visitor geolocation unavailable:",
      error,
    );

    return null;
  }
}


/*
|--------------------------------------------------------------------------
| GET /api/nearby-activity
|--------------------------------------------------------------------------
|
| Called through the Shopify app proxy.
|
| Responsibilities:
|
| - authenticate shop
| - load settings
| - optionally resolve visitor location
| - find truthful nearby activity
| - select announcement/activity
| - create server-side widget impression
| - return rendered message + display token
|--------------------------------------------------------------------------
*/

export async function loader({
  request,
}) {
  let shop;

  try {
    const proxy =
      await authenticate.public.appProxy(
        request,
      );

    shop =
      proxy.session?.shop ||
      new URL(
        request.url,
      ).searchParams.get(
        "shop",
      );
  } catch (error) {
    console.error(
      "[NearbyPulse] App proxy authentication failed:",
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
    return Response.json(
      DEFAULT_RESPONSE,
    );
  }


  const requestUrl =
    new URL(
      request.url,
    );

  const currentSessionId =
  normaliseSessionId(
    requestUrl.searchParams.get(
      "session_id",
    ),
  );

  const productId =
    normaliseProductId(
      requestUrl.searchParams.get(
        "product_id",
      ),
    );

  const productTitle =
    cleanString(
      requestUrl.searchParams.get(
        "product_title",
      ),
      255,
    );


  if (!productId) {
    return Response.json(
      DEFAULT_RESPONSE,
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Settings
  |--------------------------------------------------------------------------
  */

  const {
    data: settings,
    error: settingsError,
  } = await supabase
    .from(
      "shop_settings",
    )
    .select("*")
    .eq(
      "shop",
      shop,
    )
    .maybeSingle();


  if (settingsError) {
    console.error(
      "[NearbyPulse] Unable to load shop settings:",
      settingsError,
    );

    return Response.json(
      DEFAULT_RESPONSE,
    );
  }


  if (
    !settings ||
    settings.is_enabled !== true
  ) {
    return Response.json(
      DEFAULT_RESPONSE,
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Announcements
  |--------------------------------------------------------------------------
  |
  | Load these regardless of geolocation.
  |
  | This means merchants can still show:
  |
  | "Free shipping over £50"
  |
  | even when the visitor cannot be geolocated.
  |--------------------------------------------------------------------------
  */

  const announcements =
    await loadAnnouncements(
      shop,
    );


  /*
  |--------------------------------------------------------------------------
  | Visitor location
  |--------------------------------------------------------------------------
  */

  const visitor =
    await resolveVisitor(
      request,
    );


  let selectedActivity =
    null;


  /*
  |--------------------------------------------------------------------------
  | Real nearby activity
  |--------------------------------------------------------------------------
  |
  | Activity messages require enough location information
  | to prove that the underlying activity is actually nearby.
  |--------------------------------------------------------------------------
  */

  if (visitor) {
    const radiusKm =
      clampNumber(
        settings.radius_km,
        1,
        1000,
        100,
      );

    const activities =
      await loadProductActivities({
        shop,
    productId,
    visitor,
    radiusKm,
    settings,
    currentSessionId,
      });

    selectedActivity =
      selectBestActivity(
        activities,
        settings,
      );
  }


  /*
  |--------------------------------------------------------------------------
  | Decide between store announcement and activity
  |--------------------------------------------------------------------------
  */

  const announcementPercentage =
    clampNumber(
      settings
        .announcement_percentage,
      0,
      100,
      20,
    );


  const shouldPreferAnnouncement =
    announcements.length > 0 &&
    Math.random() * 100 <
      announcementPercentage;


  let selectedMessage =
    null;


  if (
    shouldPreferAnnouncement
  ) {
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
        productTitle,
      });
  }


  /*
   * If there was no usable activity,
   * merchant announcements can still appear.
   */
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


  /*
   * IMPORTANT:
   *
   * No activity.
   * No merchant announcement.
   *
   * Show nothing.
   *
   * We do NOT manufacture social proof.
   */
  if (
    !selectedMessage ||
    !selectedMessage.message
  ) {
    return Response.json(
      DEFAULT_RESPONSE,
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Create trusted server-side impression
  |--------------------------------------------------------------------------
  */

  const impression =
    await createWidgetImpression({
      shop,
  productId,
  productTitle,
  selectedMessage,
  visitorSessionId:
  currentSessionId,
    });


  /*
   * If we cannot create a trusted impression,
   * don't show an untrackable message.
   */
  if (!impression) {
    return Response.json(
      DEFAULT_RESPONSE,
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Storefront response
  |--------------------------------------------------------------------------
  */

  return Response.json({
    shouldShow: true,

    message:
      selectedMessage.message,

    messageType:
      selectedMessage.messageType,

    /*
     * Step 3 will make the theme extension
     * return this token when it actually
     * displays the message.
     */
    displayToken:
      impression.displayToken,

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
        settings
          .max_per_product_per_hour,
        1,
        20,
        3,
      ),
  });
}


/*
|--------------------------------------------------------------------------
| Trusted widget analytics
|--------------------------------------------------------------------------
*/

async function recordWidgetAnalytics({
  shop,
  eventType,
  displayToken,
  request,
}) {
  /*
   * Lookup the server-created impression.
   *
   * The browser cannot decide:
   *
   * - displayed city
   * - message
   * - activity type
   * - activity ID
   * - template ID
   */
  const {
    data: impression,
    error:
      impressionError,
  } = await supabase
    .from(
      "widget_impressions",
    )
    .select(
      `
        id,
        display_token,
        shop,
        product_id,
        product_title,
        activity_id,
        template_id,
        message_type,
        source_activity_type,
        displayed_city,
        rendered_message,
        shown_at,
        clicked_at
      `,
    )
    .eq(
      "shop",
      shop,
    )
    .eq(
      "display_token",
      displayToken,
    )
    .maybeSingle();


  if (impressionError) {
    console.error(
      "[NearbyPulse] Unable to load widget impression:",
      impressionError,
    );

    return {
      success: false,
      status: 500,
      error:
        "Unable to validate display token",
    };
  }


  if (!impression) {
    return {
      success: false,
      status: 404,
      error:
        "Unknown display token",
    };
  }


  /*
   * Resolve visitor geography server-side.
   *
   * This replaces browser-provided
   * visitorCity / visitorCountry.
   */
  const visitor =
    await resolveVisitor(
      request,
    );


  const analyticsRow = {
    shop,

    event_type:
      eventType,

    display_token:
      displayToken,

    activity_id:
      impression.activity_id,

    template_id:
      impression.template_id,

    /*
     * Retain legacy analytics columns for now
     * so app.analytics.jsx continues working.
     *
     * The critical difference is that these
     * values now come from our trusted
     * widget_impressions row.
     */
    product_id:
      impression.product_id,

    product_title:
      impression.product_title,

    visitor_city:
      visitor?.city ||
      null,

    visitor_country:
      visitor?.countryCode ||
      null,

    displayed_city:
      impression.displayed_city,

    message_text:
      impression.rendered_message,

    message_type:
      impression.message_type,

    source_activity_id:
      impression.activity_id,

    source_activity_type:
      impression.source_activity_type,
  };


  /*
   * Composite uniqueness:
   *
   * display_token + event_type
   *
   * prevents duplicate widget_shown events
   * while still allowing a widget_clicked.
   */
  const {
    error:
      analyticsError,
  } = await supabase
    .from(
      "analytics_events",
    )
    .upsert(
      analyticsRow,
      {
        onConflict:
          "display_token,event_type",

        ignoreDuplicates:
          true,
      },
    );


  if (analyticsError) {
    console.error(
      "[NearbyPulse] Unable to record widget analytics:",
      analyticsError,
    );

    return {
      success: false,
      status: 500,
      error:
        "Unable to record analytics",
    };
  }


  /*
   * Update the corresponding impression timestamp.
   */
  const timestamp =
    new Date().toISOString();


  if (
    eventType ===
    "widget_shown" &&
    !impression.shown_at
  ) {
    const {
      error: updateError,
    } = await supabase
      .from(
        "widget_impressions",
      )
      .update({
        shown_at:
          timestamp,
      })
      .eq(
        "id",
        impression.id,
      )
      .is(
        "shown_at",
        null,
      );

    if (updateError) {
      console.error(
        "[NearbyPulse] Unable to update shown_at:",
        updateError,
      );
    }
  }


  if (
    eventType ===
    "widget_clicked" &&
    !impression.clicked_at
  ) {
    const {
      error: updateError,
    } = await supabase
      .from(
        "widget_impressions",
      )
      .update({
        clicked_at:
          timestamp,
      })
      .eq(
        "id",
        impression.id,
      )
      .is(
        "clicked_at",
        null,
      );

    if (updateError) {
      console.error(
        "[NearbyPulse] Unable to update clicked_at:",
        updateError,
      );
    }
  }


  return {
    success: true,
    status: 200,
  };
}


/*
|--------------------------------------------------------------------------
| POST /api/nearby-activity
|--------------------------------------------------------------------------
|
| Step 2:
|
| Only trusted display-token analytics are accepted here.
|
| Genuine storefront events belong in api.track-event.js.
|--------------------------------------------------------------------------
*/

export async function action({
  request,
}) {
  let shop;


  try {
    const proxy =
      await authenticate.public.appProxy(
        request,
      );

    shop =
      proxy.session?.shop ||
      new URL(
        request.url,
      ).searchParams.get(
        "shop",
      );
  } catch (error) {
    console.error(
      "[NearbyPulse] Analytics app-proxy authentication failed:",
      error,
    );

    return Response.json(
      {
        success: false,
        error:
          "Unauthorized",
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
        error:
          "Missing shop",
      },
      {
        status: 400,
      },
    );
  }


  let body;

  try {
    body =
      await request.json();
  } catch {
    return Response.json(
      {
        success: false,
        error:
          "Invalid JSON body",
      },
      {
        status: 400,
      },
    );
  }


  const eventType =
    cleanString(
      body.event_type ||
        body.eventType,
      50,
    );

    /*
  |--------------------------------------------------------------------------
  | Genuine storefront activity
  |--------------------------------------------------------------------------
  |
  | These events create source activity.
  |
  | IMPORTANT:
  | order_completed is intentionally NOT accepted here.
  | Purchases must eventually come from a trusted Shopify webhook.
  |--------------------------------------------------------------------------
  */

  if (
    ALLOWED_STOREFRONT_EVENT_TYPES.has(
      eventType,
    )
  ) {
    const productId =
      normaliseProductId(
        body.product_id ||
          body.productId,
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

    const visitor =
      await resolveVisitor(
        request,
      );

    const activityRow = {
  shop,

  event_type:
    eventType,

  product_id:
    productId,

  product_title:
    cleanString(
      body.product_title ||
        body.productTitle,
      255,
    ),

  visitor_session_id:
    normaliseSessionId(
      body.session_id ||
        body.sessionId,
    ),

  visitor_city:
    visitor?.city ||
    null,

  visitor_country:
    visitor?.countryCode ||
    null,

  latitude:
    visitor?.latitude ??
    null,

  longitude:
    visitor?.longitude ??
    null,

  source:
    "theme_extension",

  verified:
    false,

  created_at:
    new Date().toISOString(),
};

    const {
      data,
      error,
    } = await supabase
      .from(
        "storefront_activities",
      )
      .insert(
        activityRow,
      )
      .select("id")
      .single();

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
      activityId: data.id,
    });
  }

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


  const displayToken =
    cleanString(
      body.display_token ||
        body.displayToken,
      100,
    );


  if (!displayToken) {
    /*
     * Your existing theme extension still sends
     * the old analytics payload.
     *
     * Step 3 will update it to send the token.
     */
    return Response.json(
      {
        success: false,
        error:
          "Missing display token",
      },
      {
        status: 400,
      },
    );
  }


  const result =
    await recordWidgetAnalytics({
      shop,
      eventType,
      displayToken,
      request,
    });


  return Response.json(
    {
      success:
        result.success,

      ...(result.error
        ? {
            error:
              result.error,
          }
        : {}),
    },
    {
      status:
        result.status,
    },
  );
}
function normaliseSessionId(value) {
  const sessionId =
    cleanString(
      value,
      100,
    );

  if (!sessionId) {
    return null;
  }

  /*
   * Browser-generated UUIDs and our fallback
   * contain only safe URL/token characters.
   */
  if (
    !/^[A-Za-z0-9_-]{8,100}$/.test(
      sessionId,
    )
  ) {
    return null;
  }

  return sessionId;
}
