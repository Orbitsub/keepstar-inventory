import type { ArbitrageEntry } from '../api';
import { formatIsk, formatNumber, formatPercent } from '../format';
import { EmptyState } from './StateViews';

const LOCATION_LABEL: Record<ArbitrageEntry['buy_at'], string> = {
  primary: 'Primary',
  secondary: 'Secondary',
};

export function ArbitrageView({ items }: { items: ArbitrageEntry[] }) {
  if (items.length === 0) {
    return (
      <EmptyState message="No arbitrage opportunities yet. Configure a secondary structure ID in Settings and run a poll." />
    );
  }

  return (
    <div className="table-wrap glass">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th>Buy At</th>
            <th>Buy Price</th>
            <th>Sell At</th>
            <th>Sell Price</th>
            <th>Fees</th>
            <th>Net Profit/Unit</th>
            <th>Margin</th>
            <th>Tradable Qty</th>
            <th>Total Potential Profit</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.type_id}>
              <td className="cell-primary">{item.name}</td>
              <td className="cell-muted">{item.category_name}</td>
              <td>{LOCATION_LABEL[item.buy_at]}</td>
              <td>{formatIsk(item.buy_price)}</td>
              <td>{LOCATION_LABEL[item.sell_at]}</td>
              <td>{formatIsk(item.sell_price)}</td>
              <td>{formatIsk(item.fees_per_unit)}</td>
              <td className="cell-positive">{formatIsk(item.net_profit_per_unit)}</td>
              <td>{formatPercent(item.margin_pct)}</td>
              <td>{formatNumber(item.tradable_quantity)}</td>
              <td className="cell-positive">{formatIsk(item.total_potential_profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
