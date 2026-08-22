import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ArbitrageEntry } from '../api';
import { formatIsk, formatNumber } from '../format';
import { EmptyState } from './StateViews';

const CARGO_M3_KEY = 'cargoFlow.cargoM3';
const DIRECTION_KEY = 'cargoFlow.direction';

type Direction = 'primary' | 'secondary'; // the location to buy at

function loadCargoM3(): number {
  const stored = Number(localStorage.getItem(CARGO_M3_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : 5000;
}

function loadDirection(): Direction {
  const stored = localStorage.getItem(DIRECTION_KEY);
  return stored === 'secondary' ? 'secondary' : 'primary';
}

interface CargoPlanEntry {
  item: ArbitrageEntry;
  quantity: number;
  totalVolume: number;
  totalCost: number;
  expectedProfit: number;
}

/**
 * Greedily fills the cargo hold with the highest profit-per-m3 items first, capped by
 * both available tradable quantity and remaining cargo space. Not an exact knapsack
 * solution, but a good approximation for haul planning purposes.
 */
function buildCargoPlan(items: ArbitrageEntry[], direction: Direction, cargoM3: number): CargoPlanEntry[] {
  const candidates = items.filter(
    item => item.buy_at === direction && item.packaged_volume !== null && item.packaged_volume > 0,
  );

  const sorted = [...candidates].sort(
    (a, b) => b.net_profit_per_unit / (b.packaged_volume as number) - a.net_profit_per_unit / (a.packaged_volume as number),
  );

  const plan: CargoPlanEntry[] = [];
  let remainingM3 = cargoM3;

  for (const item of sorted) {
    const volume = item.packaged_volume as number;
    const maxByVolume = Math.floor(remainingM3 / volume);
    const quantity = Math.min(item.tradable_quantity, maxByVolume);
    if (quantity <= 0) continue;

    const totalVolume = quantity * volume;
    plan.push({
      item,
      quantity,
      totalVolume,
      totalCost: quantity * item.buy_price,
      expectedProfit: quantity * item.net_profit_per_unit,
    });
    remainingM3 -= totalVolume;
  }

  return plan;
}

export function CargoFlowView({ items }: { items: ArbitrageEntry[] }) {
  const [cargoM3, setCargoM3] = useState(loadCargoM3);
  const [direction, setDirection] = useState<Direction>(loadDirection);

  function updateCargoM3(value: number) {
    setCargoM3(value);
    localStorage.setItem(CARGO_M3_KEY, String(value));
  }

  function updateDirection(value: Direction) {
    setDirection(value);
    localStorage.setItem(DIRECTION_KEY, value);
  }

  const plan = useMemo(() => buildCargoPlan(items, direction, cargoM3), [items, direction, cargoM3]);

  const totals = useMemo(
    () =>
      plan.reduce(
        (acc, entry) => ({
          volume: acc.volume + entry.totalVolume,
          cost: acc.cost + entry.totalCost,
          profit: acc.profit + entry.expectedProfit,
        }),
        { volume: 0, cost: 0, profit: 0 },
      ),
    [plan],
  );

  const sellAt: Direction = direction === 'primary' ? 'secondary' : 'primary';

  return (
    <>
      <div className="cargo-controls glass">
        <label className="field">
          <span>Cargo Hold (m³)</span>
          <input
            type="number"
            min={1}
            value={cargoM3}
            onChange={e => updateCargoM3(Math.max(1, parseFloat(e.target.value) || 0))}
          />
        </label>

        <div className="cargo-direction">
          <span className="cargo-direction-label">Transfer Direction</span>
          <div className="cargo-direction-toggle">
            <button
              type="button"
              className={`btn ${direction === 'primary' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => updateDirection('primary')}
            >
              Primary <ArrowRight size={14} /> Secondary
            </button>
            <button
              type="button"
              className={`btn ${direction === 'secondary' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => updateDirection('secondary')}
            >
              Secondary <ArrowRight size={14} /> Primary
            </button>
          </div>
        </div>

        <div className="cargo-summary">
          <div className="cargo-summary-stat">
            <span>Volume Used</span>
            <strong>{formatNumber(totals.volume)} / {formatNumber(cargoM3)} m³</strong>
          </div>
          <div className="cargo-summary-stat">
            <span>Total Cost</span>
            <strong>{formatIsk(totals.cost)}</strong>
          </div>
          <div className="cargo-summary-stat">
            <span>Expected Profit</span>
            <strong className="cell-positive">{formatIsk(totals.profit)}</strong>
          </div>
        </div>
      </div>

      {plan.length === 0 ? (
        <EmptyState message="No haul plan available. Try a larger cargo hold, or check that arbitrage data exists for this direction." />
      ) : (
        <div className="table-wrap glass">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Buy Price ({direction})</th>
                <th>Sell Price ({sellAt})</th>
                <th>Quantity to Buy</th>
                <th>Volume Used</th>
                <th>Total Cost</th>
                <th>Expected Profit</th>
              </tr>
            </thead>
            <tbody>
              {plan.map(entry => (
                <tr key={entry.item.type_id}>
                  <td className="cell-primary">{entry.item.name}</td>
                  <td className="cell-muted">{entry.item.category_name}</td>
                  <td>{formatIsk(entry.item.buy_price)}</td>
                  <td>{formatIsk(entry.item.sell_price)}</td>
                  <td>{formatNumber(entry.quantity)}</td>
                  <td>{formatNumber(entry.totalVolume)} m³</td>
                  <td>{formatIsk(entry.totalCost)}</td>
                  <td className="cell-positive">{formatIsk(entry.expectedProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
