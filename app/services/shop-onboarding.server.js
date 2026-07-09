import { supabase } from "./supabase.server";

const defaultTemplates = [
  "Someone from {city} purchased this item {minutes} minutes ago.",
  "A customer in {city} just placed an order.",
  "This product is trending in {city}.",
];

export async function ensureShopSetup(shop) {
  if (!shop) return null;

  const { data: shopRow, error: shopError } = await supabase
    .from("shops")
    .upsert(
      {
        shop,
        status: "active",
        uninstalled_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop" }
    )
    .select()
    .single();

  if (shopError) {
    console.error("Shop upsert error:", shopError);
    return null;
  }

  const { data: existingSettings } = await supabase
    .from("shop_settings")
    .select("id")
    .eq("shop", shop)
    .maybeSingle();

  if (!existingSettings) {
    await supabase.from("shop_settings").insert({
      shop,
      is_enabled: true,
      radius_km: 100,
      city_mode: "random",
      message_mode: "random",
      fixed_message: "Someone near {city} recently bought this item.",
      max_per_product_per_hour: 2,
      cooldown_minutes: 4,
      display_seconds: 10,
    });
  }

  const { count } = await supabase
    .from("message_templates")
    .select("*", { count: "exact", head: true })
    .eq("shop", shop);

  if (!count) {
    await supabase.from("message_templates").insert(
      defaultTemplates.map((template, index) => ({
        shop,
        template,
        sort_order: index + 1,
        is_enabled: true,
      }))
    );
  }

  return shopRow;
}
