import type { FuelPrice } from '../types';

export default function FuelCard({ fuels }: { fuels: FuelPrice[] }) {
  return (
    <div className="kpi-row three">
      {fuels.map((f) => (
        <div key={f.fuelType} className="kpi">
          <div className="label">{labelFor(f.fuelType)}</div>
          <div className="value">GHS {f.priceGhs.toFixed(2)}</div>
          <div className="sub">{f.source}</div>
        </div>
      ))}
    </div>
  );
}

function labelFor(t: string): string {
  if (t === 'petrol') return 'Petrol / L';
  if (t === 'diesel') return 'Diesel / L';
  if (t === 'lpg') return 'LPG / kg';
  return t;
}
