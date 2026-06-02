import { usePTTStore } from './store';

export function AudioMeter() {
  const { audioLevel, isMicEnabled } = usePTTStore();

  const bars = 20;
  const activeBars = Math.floor(audioLevel * bars);

  return (
    <div className="flex items-center gap-0.5" style={{ height: 32 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-2 rounded-full transition-all duration-50"
          style={{
            height: 32,
            backgroundColor:
              isMicEnabled && i < activeBars
                ? i < bars * 0.6
                  ? '#22c55e'
                  : i < bars * 0.85
                    ? '#eab308'
                    : '#ef4444'
                : '#313244',
            opacity: isMicEnabled && i < activeBars ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  );
}
