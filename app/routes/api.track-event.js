import { supabase } from "../services/supabase.server";

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
