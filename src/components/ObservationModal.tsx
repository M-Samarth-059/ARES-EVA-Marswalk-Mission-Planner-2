import React, { useState } from 'react';
import { Crosshair, X } from 'lucide-react';
import { FieldObservation, SiteDataset } from '../types/mission';
import { mapToLatLon, sampleTerrainAt } from '../utils/terrainEngine';

interface ObservationModalProps {
  site: SiteDataset;
  coords: { x: number; y: number };
  onClose: () => void;
  onSave: (obs: FieldObservation) => void;
}

const SAMPLE_TYPES: FieldObservation['sampleType'][] = [
  'Core',
  'Regolith',
  'Spectral Scan',
  'Photo',
];

export const ObservationModal: React.FC<ObservationModalProps> = ({
  site,
  coords,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [sampleType, setSampleType] = useState<FieldObservation['sampleType']>('Core');
  const [notes, setNotes] = useState('');

  const terrain = sampleTerrainAt(site, coords.x, coords.y);
  const ll = mapToLatLon(site, coords.x, coords.y);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const obs: FieldObservation = {
      id: `obs-${Date.now()}`,
      title: title.trim() || `${site.shortName.split(' ')[0]} Specimen #${Math.floor(Math.random() * 90 + 10)}`,
      sampleType,
      notes: notes.trim() || `Collected on ${terrain.mineralName || 'basaltic regolith'} at ${terrain.elevationM}m.`,
      x: coords.x,
      y: coords.y,
      elevationM: terrain.elevationM,
      slopeDeg: terrain.slopeDeg,
      timestampUtc: new Date().toISOString().slice(11, 19) + ' UTC',
      sol: site.sol,
    };
    onSave(obs);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121721] border border-[#232B3A] rounded shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-[#0B0E14] border-b border-[#1E293B] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-[#DDB7FF]" />
            <h2 className="text-sm font-semibold text-[#DEE2F1]">
              Log Field Observation / Specimen
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-[#86948A] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          <div className="bg-[#0B0E14] border border-[#1E293B] rounded px-3 py-2 text-[11px] font-mono-tabular text-[#BBCABF] flex items-center justify-between">
            <span>
              {ll.lat} · {ll.lon}
            </span>
            <span className="text-[#7BD0FF]">
              {terrain.elevationM}m · {terrain.slopeDeg}°
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#BBCABF] mb-1">
              Observation Title
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Laminated Hematite Vein VRR-07"
              className="w-full bg-[#0B0E14] border border-[#232B3A] focus:border-[#38BDF8] rounded px-3 py-2 text-xs font-mono-tabular text-[#DEE2F1] placeholder-[#86948A] outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#BBCABF] mb-1">
              Sample / Acquisition Type
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {SAMPLE_TYPES.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSampleType(st)}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border transition-colors ${
                    sampleType === st
                      ? 'bg-[#1A2230] border-[#10B981] text-[#6FFBAE]'
                      : 'bg-[#0B0E14] border-[#1E293B] text-[#BBCABF] hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#BBCABF] mb-1">
              Geological Field Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe grain texture, mineral coloration, stratigraphic context..."
              className="w-full bg-[#0B0E14] border border-[#232B3A] focus:border-[#38BDF8] rounded px-3 py-2 text-xs text-[#DEE2F1] placeholder-[#86948A] outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded bg-[#1A2230] border border-[#232B3A] text-xs font-medium text-[#DEE2F1] hover:border-[#38BDF8]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-[#10B981] hover:bg-[#4EDEA3] text-[#0B0E14] text-xs font-semibold uppercase tracking-wide"
            >
              Save Specimen Marker
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
