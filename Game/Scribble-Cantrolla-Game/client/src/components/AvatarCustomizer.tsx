import React from 'react';
import {
  Avatar,
  AvatarConfig,
  AVATAR_COLORS,
  EYES_COUNT,
  MOUTH_COUNT,
  POSE_COUNT,
  EYES_NAMES,
  MOUTH_NAMES,
  POSE_NAMES,
  serializeAvatarConfig,
} from './Avatar';
import { DiceIcon } from './Icons';

interface AvatarCustomizerProps {
  config: AvatarConfig;
  onChange: (config: AvatarConfig, serialized: string) => void;
}

export const AvatarCustomizer: React.FC<AvatarCustomizerProps> = ({
  config,
  onChange,
}) => {
  const updateConfig = (newConfig: Partial<AvatarConfig>) => {
    const updated: AvatarConfig = { ...config, ...newConfig };
    onChange(updated, serializeAvatarConfig(updated));
  };

  const handlePrevEyes = () => {
    const eyes = (config.eyes - 1 + EYES_COUNT) % EYES_COUNT;
    updateConfig({ eyes });
  };

  const handleNextEyes = () => {
    const eyes = (config.eyes + 1) % EYES_COUNT;
    updateConfig({ eyes });
  };

  const handlePrevMouth = () => {
    const mouth = (config.mouth - 1 + MOUTH_COUNT) % MOUTH_COUNT;
    updateConfig({ mouth });
  };

  const handleNextMouth = () => {
    const mouth = (config.mouth + 1) % MOUTH_COUNT;
    updateConfig({ mouth });
  };

  const handlePrevPose = () => {
    const pose = ((config.pose || 0) - 1 + POSE_COUNT) % POSE_COUNT;
    updateConfig({ pose });
  };

  const handleNextPose = () => {
    const pose = ((config.pose || 0) + 1) % POSE_COUNT;
    updateConfig({ pose });
  };

  const handlePrevColor = () => {
    const color = (config.color - 1 + AVATAR_COLORS.length) % AVATAR_COLORS.length;
    updateConfig({ color });
  };

  const handleNextColor = () => {
    const color = (config.color + 1) % AVATAR_COLORS.length;
    updateConfig({ color });
  };

  const handleRandomize = () => {
    const randomConfig: AvatarConfig = {
      color: Math.floor(Math.random() * AVATAR_COLORS.length),
      eyes: Math.floor(Math.random() * EYES_COUNT),
      mouth: Math.floor(Math.random() * MOUTH_COUNT),
      pose: Math.floor(Math.random() * POSE_COUNT),
    };
    onChange(randomConfig, serializeAvatarConfig(randomConfig));
  };

  const currentColor = AVATAR_COLORS[config.color % AVATAR_COLORS.length] || AVATAR_COLORS[0];
  const currentPose = config.pose || 0;

  return (
    <div className="flex flex-col items-center gap-2 p-2 sm:p-2.5 panel-sm bg-[var(--paper)]">
      <div className="w-full flex items-center justify-between px-1">
        <label className="label mb-0 text-[10px]">Customize Avatar</label>
        <button
          type="button"
          onClick={handleRandomize}
          className="text-[10px] font-bold text-[var(--coral)] hover:underline flex items-center gap-1"
          title="Randomize Avatar"
        >
          <DiceIcon size={12} />
          <span>Random Avatar</span>
        </button>
      </div>

      {/* Preview and Quick Controls Wrapper */}
      <div className="w-full flex items-center gap-2.5">
        {/* Main Avatar Preview Display */}
        <div className="relative p-1 bg-[var(--panel)] rounded-xl border-2 border-[var(--ink)] shadow-sm shrink-0">
          <Avatar avatar={config} size={58} animated={true} />
        </div>

        {/* 2-Column Responsive Controls Grid */}
        <div className="flex-1 grid grid-cols-2 gap-1.5 min-w-0">
          {/* EYES */}
          <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 bg-white border-2 border-[var(--ink)] rounded-lg">
            <button
              type="button"
              onClick={handlePrevEyes}
              className="w-4.5 h-4.5 flex items-center justify-center bg-[var(--paper)] hover:bg-[var(--sun)] border border-[var(--ink)] rounded text-[var(--ink)] font-bold text-[9px] transition-all active:scale-90 shrink-0"
              title="Previous Eyes"
            >
              ❮
            </button>

            <div className="flex-1 text-center min-w-0">
              <span className="text-[8px] font-extrabold uppercase tracking-wider text-[var(--grape)] block leading-none">Eyes</span>
              <span className="text-[10px] font-bold text-[var(--ink)] truncate block leading-tight">
                #{config.eyes + 1}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextEyes}
              className="w-4.5 h-4.5 flex items-center justify-center bg-[var(--paper)] hover:bg-[var(--sun)] border border-[var(--ink)] rounded text-[var(--ink)] font-bold text-[9px] transition-all active:scale-90 shrink-0"
              title="Next Eyes"
            >
              ❯
            </button>
          </div>

          {/* MOUTH */}
          <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 bg-white border-2 border-[var(--ink)] rounded-lg">
            <button
              type="button"
              onClick={handlePrevMouth}
              className="w-4.5 h-4.5 flex items-center justify-center bg-[var(--paper)] hover:bg-[var(--coral)] hover:text-white border border-[var(--ink)] rounded text-[var(--ink)] font-bold text-[9px] transition-all active:scale-90 shrink-0"
              title="Previous Mouth"
            >
              ❮
            </button>

            <div className="flex-1 text-center min-w-0">
              <span className="text-[8px] font-extrabold uppercase tracking-wider text-[var(--coral)] block leading-none">Mouth</span>
              <span className="text-[10px] font-bold text-[var(--ink)] truncate block leading-tight">
                #{config.mouth + 1}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextMouth}
              className="w-4.5 h-4.5 flex items-center justify-center bg-[var(--paper)] hover:bg-[var(--coral)] hover:text-white border border-[var(--ink)] rounded text-[var(--ink)] font-bold text-[9px] transition-all active:scale-90 shrink-0"
              title="Next Mouth"
            >
              ❯
            </button>
          </div>

          {/* POSE */}
          <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 bg-white border-2 border-[var(--ink)] rounded-lg">
            <button
              type="button"
              onClick={handlePrevPose}
              className="w-4.5 h-4.5 flex items-center justify-center bg-[var(--paper)] hover:bg-[var(--leaf)] hover:text-white border border-[var(--ink)] rounded text-[var(--ink)] font-bold text-[9px] transition-all active:scale-90 shrink-0"
              title="Previous Pose"
            >
              ❮
            </button>

            <div className="flex-1 text-center min-w-0">
              <span className="text-[8px] font-extrabold uppercase tracking-wider text-[var(--leaf)] block leading-none">Pose</span>
              <span className="text-[10px] font-bold text-[var(--ink)] truncate block leading-tight">
                #{currentPose + 1}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextPose}
              className="w-4.5 h-4.5 flex items-center justify-center bg-[var(--paper)] hover:bg-[var(--leaf)] hover:text-white border border-[var(--ink)] rounded text-[var(--ink)] font-bold text-[9px] transition-all active:scale-90 shrink-0"
              title="Next Pose"
            >
              ❯
            </button>
          </div>

          {/* COLOR */}
          <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 bg-white border-2 border-[var(--ink)] rounded-lg">
            <button
              type="button"
              onClick={handlePrevColor}
              className="w-4.5 h-4.5 flex items-center justify-center bg-[var(--paper)] hover:bg-[var(--sky)] hover:text-white border border-[var(--ink)] rounded text-[var(--ink)] font-bold text-[9px] transition-all active:scale-90 shrink-0"
              title="Previous Color"
            >
              ❮
            </button>

            <div className="flex-1 text-center flex items-center justify-center gap-1 min-w-0">
              <div
                className="w-2.5 h-2.5 rounded-full border border-[var(--ink)] shrink-0"
                style={{ backgroundColor: currentColor.base }}
              />
              <span className="text-[10px] font-bold text-[var(--ink)] truncate block leading-tight">
                {currentColor.name}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextColor}
              className="w-4.5 h-4.5 flex items-center justify-center bg-[var(--paper)] hover:bg-[var(--sky)] hover:text-white border border-[var(--ink)] rounded text-[var(--ink)] font-bold text-[9px] transition-all active:scale-90 shrink-0"
              title="Next Color"
            >
              ❯
            </button>
          </div>
        </div>
      </div>

      {/* QUICK COLOR PALETTE SWATCHES */}
      <div className="flex justify-center gap-1.5 pt-0.5 w-full">
        {AVATAR_COLORS.map((col, idx) => (
          <button
            key={col.name}
            type="button"
            onClick={() => updateConfig({ color: idx })}
            className={`w-4 h-4 rounded-full transition-all hover:scale-125 border border-[var(--ink)] ${
              config.color === idx
                ? 'ring-2 ring-[var(--ink)] scale-110'
                : 'opacity-80'
            }`}
            style={{ backgroundColor: col.base }}
            title={col.name}
          />
        ))}
      </div>
    </div>
  );
};
