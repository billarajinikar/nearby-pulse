import { supabase } from "../services/supabase.server";
import { getClientIp, getLocationFromIp } from "../services/geo.server";

export async function loader({ request }) {
  const url = new URL(request.url);

  const ip = getClientIp(request);
  const visitor = await getLocationFromIp(ip);

  const shop =
  url.searchParams.get("shop") ||
  request.headers.get("x-shopify-shop-domain");
  if (!shop) {
  return Response.json({ shouldShow: false, message: null });
}

  const productId = url.searchParams.get("product_id");
  const productTitle = url.searchParams.get("product_title");

  const { data: settings, error: settingsError } = await supabase
    .from("shop_settings")
    .select("*")
    .eq("shop", shop)
    .single();

  if (settingsError || !settings || !settings.is_enabled) {
    return Response.json({
      shouldShow: false,
      message: null,
    });
  }

  const fallbackResponse = {
    shouldShow: true,
    message: "Someone nearby recently bought this item.",
    cities: [],
    displaySeconds: settings.display_seconds,
    cooldownMinutes: settings.cooldown_minutes,
    maxPerProductPerHour: settings.max_per_product_per_hour,
  };

  if (!visitor || !visitor.latitude || !visitor.longitude) {
    await supabase.from("analytics_events").insert({
      shop,
      event_type: "widget_shown",
      product_id: productId,
      product_title: productTitle,
      visitor_city: null,
      visitor_country: null,
      displayed_city: null,
      message_text: fallbackResponse.message,
    });

    return Response.json(fallbackResponse);
  }

  const { data: nearbyCities, error: nearbyError } = await supabase.rpc(
    "nearby_cities",
    {
      input_lat: visitor.latitude,
      input_lng: visitor.longitude,
      radius_meters: settings.radius_km * 1000,
    }
  );

  if (nearbyError || !nearbyCities || nearbyCities.length === 0) {
    console.error("Nearby cities error:", nearbyError);

    const message = `Someone near ${
      visitor.city || "you"
    } recently bought this item.`;

    await supabase.from("analytics_events").insert({
      shop,
      event_type: "widget_shown",
      product_id: productId,
      product_title: productTitle,
      visitor_city: visitor.city,
      visitor_country: visitor.countryCode,
      displayed_city: visitor.city,
      message_text: message,
    });

    return Response.json({
      ...fallbackResponse,
      message,
    });
  }

  const selectedCity =
    settings.city_mode === "nearest"
      ? nearbyCities[0]
      : nearbyCities[Math.floor(Math.random() * nearbyCities.length)];

  const minutes = [2, 3, 5, 7, 9, 12, 15, 18, 21, 25, 32, 41, 54];
  const randomMinutes = minutes[Math.floor(Math.random() * minutes.length)];

  const { data: templates, error: templatesError } = await supabase
    .from("message_templates")
    .select("template")
    .eq("shop", shop)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  if (templatesError) {
    console.error("Message templates error:", templatesError);
  }

  const fallbackTemplates = [
    "Someone from {city} purchased this item {minutes} minutes ago.",
    "A customer in {city} just placed an order.",
    "This product is trending in {city}.",
  ];

  const availableTemplates =
    templates && templates.length > 0
      ? templates.map((item) => item.template)
      : fallbackTemplates;

  const selectedTemplate =
    settings.message_mode === "fixed" && settings.fixed_message
      ? settings.fixed_message
      : availableTemplates[Math.floor(Math.random() * availableTemplates.length)];

  const message = selectedTemplate
    .replaceAll("{city}", selectedCity.name)
    .replaceAll("{minutes}", String(randomMinutes));



  return Response.json({
  shouldShow: true,
  visitor,
  nearbyCities,
  cityMode: settings.city_mode,
  selectedCity,
  message,
  tracking: {
    shop,
    productId,
    productTitle,
    visitorCity: visitor.city,
    visitorCountry: visitor.countryCode,
    displayedCity: selectedCity.name,
    messageText: message,
  },
  displaySeconds: settings.display_seconds,
  cooldownMinutes: settings.cooldown_minutes,
  maxPerProductPerHour: settings.max_per_product_per_hour,
});
}
export async function action({ request }) {
  const body = await request.json();

  await supabase.from("analytics_events").insert({
    shop: body.shop,
    event_type: body.event_type || "widget_shown",
    product_id: body.productId,
    product_title: body.productTitle,
    visitor_city: body.visitorCity,
    visitor_country: body.visitorCountry,
    displayed_city: body.displayedCity,
    message_text: body.messageText,
  });

  return Response.json({ success: true });
}
