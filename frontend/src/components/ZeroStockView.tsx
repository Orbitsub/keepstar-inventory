import type { ZeroStockEntry } from '../api';
import { formatIsk, formatNumber, formatDate } from '../format';
import { EmptyState } from './StateViews';

export function ZeroStockView({ items }: { items: ZeroStockEntry[] }) {
  if (items.length === 0) {
    return <EmptyState message="Nothing is currently stocked out. All baseline items have stock." />;
  }

  return (
    <div className="table-wrap glass">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th>Days Out</th>
            <th>Last Qty</th>
            <th>Last Price</th>
            <th>Last Seen</th>
            <th>Avg Daily Sales</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.type_id}>
              <td className="cell-primary">{item.name}</td>
              <td className="cell-muted">{item.category_name}</td>
              <td>
                <span className={item.days_since_stockout > 7 ? 'badge badge-red' : 'badge badge-gold'}>
                  {item.days_since_stockout.toFixed(1)}d
                </span>
              </td>
              <td>{formatNumber(item.last_seen_quantity)}</td>
              <td>{formatIsk(item.last_seen_price)}</td>
              <td className="cell-muted">{formatDate(item.last_seen_at)}</td>
              <td className="cell-muted">
                {item.sales_trusted && item.avg_daily_sales !== null ? formatNumber(item.avg_daily_sales) : 'insufficient data'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
