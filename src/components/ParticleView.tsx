import { MeasurementMap } from '../simulator/types';

type ParticleViewProps = {
  qubitCount: number;
  measurements: MeasurementMap;
};

export function ParticleView({ qubitCount, measurements }: ParticleViewProps) {
  return (
    <section className="panel particles" aria-labelledby="particles-title">
      <div className="section-heading">
        <p className="eyebrow">Particle renderer</p>
        <h2 id="particles-title">Qubit states</h2>
      </div>
      <div className="particle-grid">
        {Array.from({ length: qubitCount }, (_, qubit) => {
          const measured = measurements[qubit];
          return (
            <div className={`particle-card ${measured !== undefined ? 'collapsed' : ''}`} key={qubit}>
              <div className="qubit-label">q{qubit}</div>
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
    </section>
  );
}
