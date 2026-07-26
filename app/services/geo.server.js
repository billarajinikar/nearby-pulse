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

    // Local/private IP — allow overriding via env vars for development
    if (
      ipAddress === "127.0.0.1" ||
      ipAddress === "::1" ||
      ipAddress.startsWith("192.168.") ||
      ipAddress.startsWith("10.")
    ) {
      if (process.env.DEV_GEO_LAT && process.env.DEV_GEO_LNG) {
        return {
          city: process.env.DEV_GEO_CITY || "Test City",
          countryCode: process.env.DEV_GEO_COUNTRY || "US",
          latitude: parseFloat(process.env.DEV_GEO_LAT),
          longitude: parseFloat(process.env.DEV_GEO_LNG),
          source: "dev",
        };
      }
      return null;
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
    return null;
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
