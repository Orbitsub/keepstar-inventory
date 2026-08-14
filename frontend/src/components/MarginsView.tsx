import type { MarginEntry } from '../api';
import { formatIsk, formatNumber, formatPercent, formatDuration } from '../format';
import { EmptyState } from './StateViews';

export function MarginsView({ items }: { items: MarginEntry[] }) {
  if (items.length === 0) {
    return <EmptyState message="No margin data yet. Margins need both a structure price and a Jita source price." />;
  }

  return (
    <div className="table-wrap glass">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th>Qty</th>
            <th>Sell Price</th>
            <th>Source Cost</th>
            <th>Hauling</th>
            <th>Fees</th>
            <th>Net Profit</th>
            <th>Margin</th>
            <th>Profit/m³</th>
            <th>Est. Daily Profit</th>
            <th>Time to Empty</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.type_id}>
              <td className="cell-primary">{item.name}</td>
              <td className="cell-muted">{item.category_name}</td>
              <td>{formatNumber(item.current_quantity)}</td>
              <td>{formatIsk(item.current_price)}</td>
              <td>{formatIsk(item.source_cost)}</td>
              <td>{formatIsk(item.hauling_cost_per_unit)}</td>
              <td>{formatIsk(item.fees_per_unit)}</td>
              <td className={(item.net_profit_per_unit ?? 0) >= 0 ? 'cell-positive' : 'cell-negative'}>
                {formatIsk(item.net_profit_per_unit)}
              </td>
              <td>{formatPercent(item.margin_pct)}</td>
              <td>{formatIsk(item.profit_per_m3)}</td>
              <td className={(item.est_daily_profit ?? 0) >= 0 ? 'cell-positive' : 'cell-negative'}>
                {formatIsk(item.est_daily_profit)}
              </td>
              <td>{formatDuration(item.time_to_empty_hours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
