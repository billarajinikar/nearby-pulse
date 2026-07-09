import path from "path";
import { Reader } from "@maxmind/geoip2-node";

const dbPath = path.join(process.cwd(), "storage", "GeoLite2-City.mmdb");

let geoReader = null;

async function getGeoReader() {
  if (!geoReader) {
    geoReader = await Reader.open(dbPath);
  }

  return geoReader;
}

export async function getLocationFromIp(ipAddress) {
  try {
    if (!ipAddress) return null;

    // Useful for local testing
    if (
      ipAddress === "127.0.0.1" ||
      ipAddress === "::1" ||
      ipAddress.startsWith("192.168.") ||
      ipAddress.startsWith("10.")
    ) {
      return {
        city: "Västerås",
        countryCode: "SE",
        latitude: 59.6099,
        longitude: 16.5448,
        source: "fallback",
      };
    }

    const reader = await getGeoReader();
    const result = reader.city(ipAddress);

    return {
      city: result.city?.names?.en || null,
      countryCode: result.country?.isoCode || null,
      latitude: result.location?.latitude || null,
      longitude: result.location?.longitude || null,
      timezone: result.location?.timeZone || null,
      source: "maxmind",
    };
  } catch (error) {
    console.error("MaxMind lookup failed:", error);

    return {
      city: "Västerås",
      countryCode: "SE",
      latitude: 59.6099,
      longitude: 16.5448,
      source: "fallback",
    };
  }
}

export function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    null
  );
}
