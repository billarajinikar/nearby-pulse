import { authenticate } from "../shopify.server";
import { supabase } from "../services/supabase.server";
import {
  getClientIp,
  getLocationFromIp,
} from "../services/geo.server";

const ALLOWED_EVENT_TYPES = new Set([
  "product_viewed",
  "add_to_cart",
  "checkout_started",
]);

function cleanString(value, maxLength = 255) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
}

function normaliseProductId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value)
    .trim()
    .replace("gid://shopify/Product/", "");
}

export async function action({ request }) {
  let shop;

  try {
    const proxy = await authenticate.public.appProxy(request);
    shop = proxy.session?.shop;
  } catch (error) {
    console.error("Track-event authentication failed:", error);

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

  const eventType = cleanString(body.event_type, 50);
  const productId = normaliseProductId(body.product_id);

  if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
    return Response.json(
      {
        success: false,
        error: "Invalid event type",
      },
      {
        status: 400,
      },
    );
  }

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

  const clientIp = getClientIp(request);

  let location = null;

  try {
    location = await getLocationFromIp(clientIp);
  } catch (error) {
    console.error("Unable to resolve tracking location:", error);
  }

  const activity = {
    shop,
    event_type: eventType,
    product_id: productId,
    product_title: cleanString(body.product_title, 255),
    variant_id: cleanString(body.variant_id, 100),
    visitor_city: cleanString(location?.city, 150),
    visitor_country: cleanString(
      location?.countryCode || location?.country,
      10,
    ),
    latitude:
      Number.isFinite(Number(location?.latitude))
        ? Number(location.latitude)
        : null,
    longitude:
      Number.isFinite(Number(location?.longitude))
        ? Number(location.longitude)
        : null,
    source: "theme_extension",
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("storefront_activities")
    .insert(activity)
    .select("id")
    .single();

  if (error) {
    console.error("Unable to save storefront activity:", error);

    return Response.json(
      {
        success: false,
        error: error.message,
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
