import { useTranslation } from "react-i18next";
import * as Slider from "@radix-ui/react-slider";
import { useApp } from "../../context/AppContext";

/* ──────────────────────────────────────────────
 *  Score / weight input controls.
 *
 *  Two rendering modes, chosen by `resolvedScoringInputStyle`:
 *    - "buttons" — classic 1–5 button row (integer values)
 *    - "slider"  — continuous 1–5 slider (0.1 step, fractional)
 *
 *  Slider mode is auto-forced for profiles that contain fractional
 *  values (e.g. merged profiles), so values display faithfully
 *  regardless of the user's setting.
 * ────────────────────────────────────────────── */

const SLIDER_STEP = 0.1;
const SLIDER_MIN = 1;
const SLIDER_MAX = 5;

/** Round to 1 decimal to keep storage clean. */
function roundTo1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Color bucket (1–5) for a continuous 1–5 value. */
function colorBucket(value: number): 1 | 2 | 3 | 4 | 5 {
  if (value < 1.5) return 1;
  if (value < 2.5) return 2;
  if (value < 3.5) return 3;
  if (value < 4.5) return 4;
  return 5;
}

interface RangeSliderProps {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}

/** Shared 1–5 continuous slider used for both scores and weights. */
function RangeSlider({ value, onChange, ariaLabel }: RangeSliderProps) {
  const bucket = colorBucket(value);
  return (
    <div className="flex items-center gap-2">
      <Slider.Root
        className="score-slider-root relative flex items-center select-none touch-none w-[140px] h-5"
        value={[value]}
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={SLIDER_STEP}
        onValueChange={(vs) => onChange(roundTo1(vs[0]))}
        aria-label={ariaLabel}
        dir="ltr"
      >
        <Slider.Track className="score-slider-track bg-gray-200 relative grow rounded-full h-1.5">
          <Slider.Range
            className="score-slider-range absolute rounded-full h-full"
            data-score={bucket}
          />
        </Slider.Track>
        <Slider.Thumb
          className="score-slider-thumb block w-4 h-4 bg-white border-2 rounded-full shadow
                     focus:outline-none focus:ring-2 focus:ring-blue-400"
          data-score={bucket}
        />
      </Slider.Root>
      <span
        className="score-slider-value text-xs font-mono tabular-nums min-w-[24px] text-end"
        data-score={bucket}
      >
        {value.toFixed(1)}
      </span>
    </div>
  );
}

interface ScoreButtonGroupProps {
  paramId: string;
  valueKey: string;
}

/**
 * Input for a single value's score. Renders as buttons (integer 1–5) or
 * a continuous slider depending on `resolvedScoringInputStyle`.
 */
export function ScoreButtonGroup({ paramId, valueKey }: ScoreButtonGroupProps) {
  const { scores, setScore, resolvedScoringInputStyle } = useApp();
  const currentScore = scores[paramId]?.[valueKey] ?? 3;

  if (resolvedScoringInputStyle === "slider") {
    return (
      <RangeSlider
        value={currentScore}
        onChange={(v) => setScore(paramId, valueKey, v)}
        ariaLabel={`${valueKey} score`}
      />
    );
  }

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          className="score-btn"
          data-score={score}
          data-active={currentScore === score}
          onClick={() => setScore(paramId, valueKey, score)}
          aria-label={`${valueKey} - ${score}`}
        >
          {score}
        </button>
      ))}
    </div>
  );
}

interface WeightSliderProps {
  paramId: string;
}

/**
 * Input for a parameter's importance weight (1–5). Renders as buttons or
 * a continuous slider depending on `resolvedScoringInputStyle`.
 */
export function WeightSlider({ paramId }: WeightSliderProps) {
  const { t } = useTranslation();
  const { weights, setWeight, resolvedScoringInputStyle } = useApp();
  const currentWeight = weights[paramId] ?? 3;

  if (resolvedScoringInputStyle === "slider") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 min-w-[60px]">
          {t("scoring.weight")}:
        </span>
        <RangeSlider
          value={currentWeight}
          onChange={(v) => setWeight(paramId, v)}
          ariaLabel={t("scoring.weight")}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 min-w-[60px]">
        {t("scoring.weight")}:
      </span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((w) => (
          <button
            key={w}
            onClick={() => setWeight(paramId, w)}
            aria-label={`${t("scoring.weight")} ${w}`}
            className={`w-8 h-8 rounded-md text-xs font-medium border transition-colors
              ${
                currentWeight === w
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}
