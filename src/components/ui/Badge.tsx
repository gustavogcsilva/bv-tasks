interface BadgeProps {
  label: string;
  color: string;
  backgroundColor: string;
}

export function Badge({ label, color, backgroundColor }: BadgeProps) {
  return (
    <span
      className="inline-flex items-center self-start rounded-lg px-2.5 py-1 text-[11px] font-bold tracking-tight"
      style={{ backgroundColor, color }}
    >
      {label}
    </span>
  );
}
