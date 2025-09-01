import React, { useMemo, useState } from "react";

/**
 * Shipping Cost Calculator
 * - DIM rules:
 *   • UPS Fast: DIM / 6000 (yellow rates)
 *   • UPS Slow: DIM / 6000
 *   • FedEx (HK): DIM / 5000
 * - Billed weight = ceil(max(actual, DIM)) to next 0.5 kg
 * - USPS singles (RMB) per pair: 100×kg + 64
 * - Preset cartons by pair-count + Custom L×W×H override
 */

/* ---------- Rate tables (RMB) ---------- */
// UPS Fast — yellow column (billed kg → RMB)
const UPS_FAST: Record<number, number> = {
  0.5: 310,
  1.0: 347,
  1.5: 388,
  2.0: 425,
  2.5: 438,
  3.0: 456,
  3.5: 510,
  4.0: 565,
  4.5: 612,
  5.0: 656,
  5.5: 706,
  6.0: 752,
  6.5: 812,
  7.0: 870,
  7.5: 921,
  8.0: 978,
  8.5: 1034,
  9.0: 1081,
  9.5: 1124,
  10.0: 1161,
  10.5: 1161,
  11.0: 1209,
  11.5: 1246,
  12.0: 1294,
  12.5: 1331,
  13.0: 1379,
  13.5: 1415,
  14.0: 1493,
  14.5: 1530,
  15.0: 1584,
  15.5: 1594,
  16.0: 1640,
  16.5: 1678,
  17.0: 1726,
  17.5: 1763,
  18.0: 1811,
  18.5: 1842,
  19.0: 1888,
  19.5: 1925,
  20.0: 1967,
};

const UPS_SLOW: Record<number, number> = {
  0.5: 150,
  1.0: 185,
  1.5: 220,
  2.0: 256,
  2.5: 292,
  3.0: 326,
  3.5: 360,
  4.0: 394,
  4.5: 428,
  5.0: 482,
  5.5: 516,
  6.0: 560,
  6.5: 594,
  7.0: 638,
  7.5: 672,
  8.0: 716,
  8.5: 750,
  9.0: 794,
  9.5: 828,
  10.0: 872,
  10.5: 906,
  11.0: 950,
  11.5: 984,
  12.0: 1028,
  12.5: 1062,
  13.0: 1106,
  13.5: 1140,
  14.0: 1184,
  14.5: 1218,
  15.0: 1262,
  15.5: 1296,
  16.0: 1340,
  16.5: 1374,
  17.0: 1418,
  17.5: 1452,
  18.0: 1496,
  18.5: 1530,
  19.0: 1574,
  19.5: 1608,
  20.0: 1652,
};

const FEDEX: Record<number, number> = {
  0.5: 240,
  1.0: 255,
  1.5: 280,
  2.0: 305,
  2.5: 330,
  3.0: 359,
  3.5: 392,
  4.0: 426,
  4.5: 459,
  5.0: 512,
  5.5: 577,
  6.0: 623,
  6.5: 659,
  7.0: 705,
  7.5: 742,
  8.0: 788,
  8.5: 824,
  9.0: 870,
  9.5: 897,
  10.0: 953,
  10.5: 1009,
  11.0: 1054,
  11.5: 1089,
  12.0: 1135,
  12.5: 1183,
  13.0: 1227,
  13.5: 1247,
  14.0: 1308,
  14.5: 1391,
  15.0: 1438,
};

// USPS singles (RMB) per pair, linear fit from your data
const uspsSinglesPerPair = (kgPerPair: number) => 100 * kgPerPair + 64;

/* ---------- Preset cartons (cm) ---------- */
const PRESET_CARTONS: Record<number, { L: number; W: number; H: number }> = {
  1: { L: 37.0, W: 27.0, H: 14.5 },
  2: { L: 37.0, W: 27.0, H: 27.5 },
  3: { L: 37.0, W: 27.0, H: 40.5 },
  4: { L: 37.0, W: 52.5, H: 27.5 },
  5: { L: 37.0, W: 27.0, H: 66.5 },
  6: { L: 37.0, W: 52.5, H: 40.5 },
  7: { L: 37.0, W: 27.0, H: 92.5 },
  8: { L: 37.0, W: 52.5, H: 53.5 },
  9: { L: 37.0, W: 78.0, H: 40.5 },
  10: { L: 37.0, W: 52.5, H: 66.5 },
};

/* ---------- Helpers ---------- */
function roundUpToHalfKg(w: number) {
  return Math.ceil(w * 2) / 2;
}
function billedWeight(actualKg: number, dimKg: number) {
  return roundUpToHalfKg(Math.max(actualKg, dimKg));
}
function lookupRate(table: Record<number, number>, billed: number) {
  const keys = Object.keys(table)
    .map(parseFloat)
    .sort((a, b) => a - b);
  for (const k of keys) if (billed <= k + 1e-9) return table[k];
  return undefined; // beyond table
}

/* ---------- Component ---------- */
export default function App() {
  const [pairs, setPairs] = useState<number>(2);
  const [totalWeight, setTotalWeight] = useState<number>(3.2); // kg (all pairs combined)
  const [mode, setMode] = useState<"Preset" | "Custom">("Preset");
  const [customL, setCustomL] = useState<number>(37);
  const [customW, setCustomW] = useState<number>(26);
  const [customH, setCustomH] = useState<number>(28);
  const [fx, setFx] = useState<number>(0); // RMB→USD (optional)

  const carton = useMemo(() => {
    if (mode === "Preset") return PRESET_CARTONS[pairs] ?? PRESET_CARTONS[1];
    return { L: customL, W: customW, H: customH };
  }, [mode, pairs, customL, customW, customH]);

  const calc = useMemo(() => {
    const avgPerPair = totalWeight / Math.max(1, pairs);
    const uspsTotal = pairs * uspsSinglesPerPair(avgPerPair);

    const vol = carton.L * carton.W * carton.H; // cm³
    const dimFast = vol / 6000; // UPS Fast
    const dimSlow = vol / 6000; // UPS Slow
    const dimFdx = vol / 5000; // FedEx

    const billedFast = billedWeight(totalWeight, dimFast);
    const billedSlow = billedWeight(totalWeight, dimSlow);
    const billedFdx = billedWeight(totalWeight, dimFdx);

    const priceFast = lookupRate(UPS_FAST, billedFast);
    const priceSlow = lookupRate(UPS_SLOW, billedSlow);
    const priceFdx = lookupRate(FEDEX, billedFdx);

    const rows = [
      {
        carrier: "USPS (singles)",
        billedKg: "— (per-pair)",
        costRmb: uspsTotal,
        note: `= ${pairs} × (100×${avgPerPair.toFixed(2)} + 64)`,
      },
      {
        carrier: "UPS Fast",
        billedKg: billedFast,
        costRmb: priceFast,
        note: "DIM /6000",
      },
      {
        carrier: "UPS Slow",
        billedKg: billedSlow,
        costRmb: priceSlow,
        note: "DIM /6000",
      },
      {
        carrier: "FedEx (HK)",
        billedKg: billedFdx,
        costRmb: priceFdx,
        note: "DIM /5000 (≤15 kg)",
      },
    ];

    const best = rows
      .filter((r) => typeof r.costRmb === "number")
      .reduce(
        (min: any, r) => (r.costRmb! < (min?.costRmb ?? Infinity) ? r : min),
        undefined as any
      );

    return {
      avgPerPair,
      vol,
      dimFast,
      dimSlow,
      dimFdx,
      billedFast,
      billedSlow,
      billedFdx,
      rows,
      best,
    };
  }, [pairs, totalWeight, carton]);

  const money = (v?: number) =>
    typeof v === "number" ? `¥${v.toFixed(0)}` : "—";
  const usd = (v?: number) =>
    fx > 0 && typeof v === "number" ? `$${(v / fx).toFixed(2)}` : "";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Shipping Cost Calculator</h1>
      <p className="text-sm text-gray-600">
        Enter the <b>number of pairs</b> and the <b>total actual weight (kg)</b>
        . Choose a preset carton by pair-count or switch to <b>Custom</b> to
        override <b>L×W×H</b>. DIM rules: <b>UPS Fast /6000</b>,{" "}
        <b>UPS Slow /6000</b>, <b>FedEx /5000</b>. Billed weight rounds up to
        the next 0.5 kg.
      </p>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Pairs (1–10)</label>
          <input
            type="number"
            min={1}
            max={10}
            value={pairs}
            onChange={(e) =>
              setPairs(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
            }
            className="w-full rounded-2xl border p-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">
            Total actual weight (kg)
          </label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={totalWeight}
            onChange={(e) =>
              setTotalWeight(Math.max(0, Number(e.target.value) || 0))
            }
            className="w-full rounded-2xl border p-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Carton mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            className="w-full rounded-2xl border p-2"
          >
            <option>Preset</option>
            <option>Custom</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">FX (RMB→USD) — optional</label>
          <input
            type="number"
            step="0.0001"
            min={0}
            value={fx}
            onChange={(e) => setFx(Math.max(0, Number(e.target.value) || 0))}
            className="w-full rounded-2xl border p-2"
          />
        </div>
      </div>

      {mode === "Preset" ? (
        <div className="rounded-2xl border p-3 text-sm">
          Carton for {pairs} pair(s):{" "}
          <b>
            {PRESET_CARTONS[pairs]?.L} × {PRESET_CARTONS[pairs]?.W} ×{" "}
            {PRESET_CARTONS[pairs]?.H} cm
          </b>{" "}
          — Volume:{" "}
          <b>
            {(
              PRESET_CARTONS[pairs]!.L *
              PRESET_CARTONS[pairs]!.W *
              PRESET_CARTONS[pairs]!.H
            ).toLocaleString()}
          </b>{" "}
          cm³
        </div>
      ) : (
        <div className="rounded-2xl border p-3 grid md:grid-cols-3 gap-3 text-sm">
          <div>
            <label className="block">Length L (cm)</label>
            <input
              type="number"
              step="0.1"
              value={customL}
              onChange={(e) => setCustomL(Number(e.target.value) || 0)}
              className="w-full rounded-2xl border p-2"
            />
          </div>
          <div>
            <label className="block">Width W (cm)</label>
            <input
              type="number"
              step="0.1"
              value={customW}
              onChange={(e) => setCustomW(Number(e.target.value) || 0)}
              className="w-full rounded-2xl border p-2"
            />
          </div>
          <div>
            <label className="block">Height H (cm)</label>
            <input
              type="number"
              step="0.1"
              value={customH}
              onChange={(e) => setCustomH(Number(e.target.value) || 0)}
              className="w-full rounded-2xl border p-2"
            />
          </div>
          <div className="md:col-span-3 text-xs text-gray-600">
            Current carton volume:{" "}
            <b>{(carton.L * carton.W * carton.H).toLocaleString()}</b> cm³
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 text-sm">
        <div className="rounded-2xl border p-3">
          <div>
            DIM (UPS Fast /6000):{" "}
            <b>{((carton.L * carton.W * carton.H) / 6000).toFixed(2)} kg</b>
          </div>
          <div>
            Billed weight (UPS Fast): <b>{calc.billedFast.toFixed(1)} kg</b>
          </div>
        </div>
        <div className="rounded-2xl border p-3">
          <div>
            DIM (UPS Slow /6000):{" "}
            <b>{((carton.L * carton.W * carton.H) / 6000).toFixed(2)} kg</b>
          </div>
          <div>
            Billed weight (UPS Slow): <b>{calc.billedSlow.toFixed(1)} kg</b>
          </div>
        </div>
        <div className="rounded-2xl border p-3">
          <div>
            DIM (FedEx /5000):{" "}
            <b>{((carton.L * carton.W * carton.H) / 5000).toFixed(2)} kg</b>
          </div>
          <div>
            Billed weight (FedEx): <b>{calc.billedFdx.toFixed(1)} kg</b>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Carrier</th>
              <th className="text-right p-2">Billed kg</th>
              <th className="text-right p-2">Cost (RMB)</th>
              {fx > 0 && <th className="text-right p-2">Cost (USD)</th>}
              <th className="text-left p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {calc.rows.map((r) => (
              <tr key={r.carrier} className="border-t">
                <td className="p-2">{r.carrier}</td>
                <td className="p-2 text-right">
                  {typeof r.billedKg === "number"
                    ? r.billedKg.toFixed(1)
                    : r.billedKg}
                </td>
                <td className="p-2 text-right">{money(r.costRmb)}</td>
                {fx > 0 && <td className="p-2 text-right">{usd(r.costRmb)}</td>}
                <td className="p-2">{r.note}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t">
              <td className="p-2 font-semibold">Best price</td>
              <td className="p-2 text-right">
                {typeof calc.best?.billedKg === "number"
                  ? calc.best.billedKg.toFixed(1)
                  : calc.best?.billedKg || "—"}
              </td>
              <td className="p-2 text-right font-semibold">
                {money(calc.best?.costRmb)}
              </td>
              {fx > 0 && (
                <td className="p-2 text-right font-semibold">
                  {usd(calc.best?.costRmb)}
                </td>
              )}
              <td className="p-2">{calc.best?.carrier || "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        <div>
          USPS singles formula uses average kg per pair: total = pairs ×
          (100×avg + 64).
        </div>
        <div>
          FedEx table caps at billed 15 kg; UPS tables go to 20 kg. Beyond cap
          shows “—”.
        </div>
      </div>
    </div>
  );
}
