/**
 * Geographic primitives for nearby blood-bank / donor search.
 *
 * Pure functions only. Real great-circle distance via haversine; a lat/lng
 * bounding-box prefilter that translates into plain Prisma range queries on
 * portable databases (no PostGIS dependency). Donor coordinates are stored
 * quantized to a ~1km grid so the platform never holds a precise home point.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Great-circle distance in kilometres (haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Square prefilter around a point — candidates outside it are farther than
 * `radiusKm` for sure (planar approximation; latitude clamped to the poles,
 * longitude wrapped modulo 360 is deliberately NOT handled: searches are
 * local, and the haversine filter re-checks every candidate anyway).
 */
export function boundingBox(center: GeoPoint, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / 111.32;
  const cosLat = Math.max(0.01, Math.cos(toRad(center.latitude)));
  const lngDelta = radiusKm / (111.32 * cosLat);
  return {
    minLat: Math.max(-90, center.latitude - latDelta),
    maxLat: Math.min(90, center.latitude + latDelta),
    minLng: Math.max(-180, center.longitude - lngDelta),
    maxLng: Math.min(180, center.longitude + lngDelta),
  };
}

/**
 * Quantize a coordinate to a ~1.1km grid. Donor positions are stored at this
 * precision so a database leak cannot reveal exact home locations, and
 * distances are only ever displayed approximately.
 */
export function quantizeCoordinate(value: number): number {
  const clamped = Math.max(-180, Math.min(180, value));
  return Math.round(clamped * 100) / 100;
}

/**
 * Human-facing distance: whole kilometres, minimum 1 — matching the stored
 * coordinate precision. The "~" prefix on display communicates approximation.
 */
export function approximateDistanceKm(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return Math.max(1, Math.round(distanceKm));
}
