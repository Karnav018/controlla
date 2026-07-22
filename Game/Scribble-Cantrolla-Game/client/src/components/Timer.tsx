interface TimerProps {
  time: number;
  maxTime?: number;
}

export default function Timer({ time, maxTime = 80 }: TimerProps) {
  const percentage = Math.max(0, Math.min(100, (time / maxTime) * 100));

  let color = "var(--leaf)";
  if (percentage <= 50) color = "var(--sun)";
  if (percentage <= 25) color = "var(--coral)";

  return (
    <div className="flex flex-col gap-1 w-48 md:w-64">
      <div className="flex justify-between items-center text-xs font-mono font-bold">
        <span className="uppercase text-[var(--ink)] opacity-70">TIME</span>
        <span className="text-[var(--ink)]">{time}s</span>
      </div>
      <div className="timer-bar-track">
        <div
          className="timer-bar-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}
