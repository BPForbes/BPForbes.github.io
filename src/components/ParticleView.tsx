import { CircuitGate, MeasurementMap, ParticleStartState } from '../simulator/types';

type ParticleViewProps = {
  qubitCount: number;
  measurements: MeasurementMap;
  gates?: CircuitGate[];
  activeStep?: number;
  startStates?: ParticleStartState[];
  // Issue #2 fix (qubit index mismatch): Optional array of human-readable labels derived
  // from the compiler's tokenMap (e.g. "q0 · A0", "q1 · B0").  When provided, each
  // particle card shows the token name instead of the bare qubit index so users can
  // identify which wire corresponds to which protocol parameter.
  qubitLabels?: string[];
};

const seededColor = (index: number): [number, number, number] => {
  const hue = ((index * 137.508) % 360) / 60;
  const chroma = 0.76;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const [r, g, b] = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = 0.22;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

const srgbToLinear = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (value: number) => {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round((clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055) * 255);
};

const rgbToOklab = ([r, g, b]: [number, number, number]) => {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};

const oklabToCss = ([L, a, b]: number[]) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rLin = 4.0767416621 * l - 3.3077115903 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return `rgb(${linearToSrgb(rLin)} ${linearToSrgb(gLin)} ${linearToSrgb(bLin)})`;
};

const mixedColor = (qubits: number[]) => {
  const labs = qubits.map((qubit) => rgbToOklab(seededColor(qubit)));
  const average = labs[0].map((_, channel) => labs.reduce((sum, lab) => sum + lab[channel], 0) / labs.length);
  return oklabToCss(average);
};

// Issue #2 fix: `qubitLabels` defaults to an empty array; the JSX below falls back to
// `q${qubit}` for any index without a label so the component works in both workbench
// (manual) and compiled-protocol modes.
export function ParticleView({ qubitCount, measurements, gates = [], activeStep = -1, startStates = [], qubitLabels = [] }: ParticleViewProps) {
  const sorted = gates.slice().sort((a, b) => a.step - b.step);

  return (
    <section className="panel particles" aria-labelledby="particles-title">
      <div className="section-heading">
        <p className="eyebrow">Particle renderer</p>
        <h2 id="particles-title">Qubit states and execution progress</h2>
      </div>
      <div className="particle-grid">
        {Array.from({ length: qubitCount }, (_, qubit) => {
          const measured = measurements[qubit];
          const baseColor = oklabToCss(rgbToOklab(seededColor(qubit)));
          return (
            <div className={`particle-card ${measured !== undefined ? 'collapsed' : ''}`} key={qubit} style={{ ['--particle-color' as string]: baseColor }}>
              {/* Issue #2 fix: use the token-name label when available so the particle
                  card matches the start-state picker label in the workbench. */}
              <div className="qubit-label">{qubitLabels[qubit] ?? `q${qubit}`} · {startStates[qubit] ?? '0p'}</div>
              {measured === undefined ? (
                <div className="sphere" aria-label={`q${qubit} unmeasured quantum sphere`} />
              ) : (
                <div className="state-card" aria-label={`q${qubit} measured ${measured}`}>
                  {measured}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {sorted.length > 0 && (
        <div className="execution-timeline" aria-label="Circuit execution timeline">
          {sorted.map((gate) => {
            const touched = [...gate.controls, ...gate.targets];
            return (
              <div className={`timeline-step ${activeStep === gate.step ? 'active' : ''} ${activeStep >= gate.step ? 'done' : ''}`} key={gate.id} style={{ ['--mix-color' as string]: mixedColor(touched.length ? touched : gate.targets) }}>
                <span>{gate.step + 1}</span>
                <strong>{gate.type}</strong>
                <small>{touched.map((qubit) => `q${qubit}`).join(' + ')}</small>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
