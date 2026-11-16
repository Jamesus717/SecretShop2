import { useEffect, useState } from 'react';
import { fetchTeamLogoMap, type LogoMap } from '../lib/teamlogo';

// One shared fetch per page load.
let shared: Promise<LogoMap> | null = null;
export function loadLogoMap(): Promise<LogoMap> {
  if (!shared) shared = fetchTeamLogoMap();
  return shared;
}

/** Uploaded team logos (name_key -> url). null until loaded; never rejects. */
export function useTeamLogos(): LogoMap | null {
  const [map, setMap] = useState<LogoMap | null>(null);
  useEffect(() => {
    let live = true;
    loadLogoMap().then((m) => { if (live) setMap(m); });
    return () => { live = false; };
  }, []);
  return map;
}
