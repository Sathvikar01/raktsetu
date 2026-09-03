import { describe, expect, it } from "vitest";
import {
  boundingBox,
  haversineKm,
  quantizeCoordinate,
  approximateDistanceKm,
} from "@/packages/domain/geo";

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    const p = { latitude: 18.5204, longitude: 73.8567 };
    expect(haversineKm(p, p)).toBe(0);
  });

  it("measures a known Pune distance with sane accuracy", () => {
    // Pune (Deccan) → Pune Airport: roughly 8–9 km straight line.
    const km = haversineKm(
      { latitude: 18.529, longitude: 73.856 },
      { latitude: 18.5822, longitude: 73.9197 }
    );
    expect(km).toBeGreaterThan(7);
    expect(km).toBeLessThan(10);
  });

  it("measures long distances (Mumbai → Delhi ≈ 1150 km)", () => {
    const km = haversineKm(
      { latitude: 19.076, longitude: 72.8777 },
      { latitude: 28.6139, longitude: 77.209 }
    );
    expect(km).toBeGreaterThan(1050);
    expect(km).toBeLessThan(1250);
  });

  it("is symmetric", () => {
    const a = { latitude: 10, longitude: 20 };
    const b = { latitude: 11, longitude: 21 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });
});

describe("boundingBox", () => {
  it("contains all points within the radius and excludes far ones", () => {
    const center = { latitude: 18.52, longitude: 73.86 };
    const box = boundingBox(center, 5);

    // 0.03° lat ≈ 3.3 km — inside a 5 km box.
    expect(box.minLat).toBeLessThan(18.52 - 0.03);
    expect(box.maxLat).toBeGreaterThan(18.52 + 0.03);

    // 0.5° lat ≈ 55 km — must fall outside a 5 km box.
    expect(box.maxLat).toBeLessThan(19.02);
    expect(box.minLat).toBeGreaterThan(18.02);

    // Longitude tolerance widens with cos(latitude): at 18°N, 1° lng ≈ 106 km.
    expect(box.minLng).toBeLessThan(73.86 - 0.045);
    expect(box.maxLng).toBeGreaterThan(73.86 + 0.045);
  });

  it("clamps latitude at the poles", () => {
    const box = boundingBox({ latitude: 89.99, longitude: 0 }, 100);
    expect(box.maxLat).toBeLessThanOrEqual(90);
  });
});

describe("quantizeCoordinate", () => {
  it("snaps to a ~1km grid (2 decimals)", () => {
    expect(quantizeCoordinate(18.5204123)).toBe(18.52);
    expect(quantizeCoordinate(73.8567123)).toBe(73.86);
  });

  it("clamps to valid coordinate ranges", () => {
    expect(quantizeCoordinate(500)).toBe(180);
    expect(quantizeCoordinate(-500)).toBe(-180);
  });
});

describe("approximateDistanceKm", () => {
  it("rounds to whole kilometres and floors at 0", () => {
    expect(approximateDistanceKm(0.4)).toBe(1); // sub-km stays honest at ~1
    expect(approximateDistanceKm(1.4)).toBe(1);
    expect(approximateDistanceKm(3.6)).toBe(4);
    expect(approximateDistanceKm(0)).toBe(0);
    expect(approximateDistanceKm(Number.NaN)).toBe(0);
  });
});
