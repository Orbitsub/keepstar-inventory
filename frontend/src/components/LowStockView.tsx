import type { LowStockEntry } from '../api';
import { formatIsk, formatNumber, formatDuration, formatDate } from '../format';
import { EmptyState } from './StateViews';

const SEVERITY_LABEL: Record<LowStockEntry['severity'], string> = {
  critical: 'Critical',
  warning: 'Warning',
  stable: 'Stable',
};

export function LowStockView({ items }: { items: LowStockEntry[] }) {
  if (items.length === 0) {
    return <EmptyState message="No items are running low right now." />;
  }

  return (
    <div className="table-wrap glass">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th>Severity</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Avg Daily Sales</th>
            <th>Time to Empty</th>
            <th>Est. Stockout</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.type_id}>
              <td className="cell-primary">{item.name}</td>
              <td className="cell-muted">{item.category_name}</td>
              <td>
                <span className={`badge badge-${item.severity === 'critical' ? 'red' : item.severity === 'warning' ? 'gold' : 'green'}`}>
                  {SEVERITY_LABEL[item.severity]}
                </span>
              </td>
              <td>{formatNumber(item.current_quantity)}</td>
              <td>{formatIsk(item.current_price)}</td>
              <td>{formatNumber(item.avg_daily_sales)}</td>
              <td>{formatDuration(item.time_to_empty_hours)}</td>
              <td className="cell-muted">{formatDate(item.estimated_stockout_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
