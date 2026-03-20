export default function StatusBadge({ percentage }) {
  const className = percentage > 100 ? 'badge badge-danger' : 'badge badge-success';
  return <span className={className}>{percentage}%</span>;
}
