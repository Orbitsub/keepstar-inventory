import { AlertTriangle, Loader2, Inbox } from 'lucide-react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state-panel">
      <Loader2 size={24} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state-panel state-error">
      <AlertTriangle size={24} />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="state-panel">
      <Inbox size={24} />
      <span>{message}</span>
    </div>
  );
}
