import { useEffect, useState } from 'react';
import { resolveTeamImage, teamInitials } from '../../lib/teamlogo';
import { useTeamLogos } from '../../hooks/useTeamLogos';
import type { DivisionKey } from '../../lib/news';
import styles from './Crest.module.css';

interface Props {
  name: string;
  /** Height in px; width is 0.866 of it (pointy-top hexagon). */
  size?: number;
  division?: DivisionKey;
  className?: string;
}

/**
 * Team crest. Resolves uploaded logo -> assets/teaminfoimgs file -> initials in a
 * division-coloured hexagon. A failed image load (onError) drops to the initials.
 */
export default function Crest({ name, size = 64, division, className }: Props) {
  const logos = useTeamLogos();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    resolveTeamImage(name, logos).then((s) => { if (live) setSrc(s); });
    return () => { live = false; };
  }, [name, logos]);

  const showImg = src && !failed;
  return (
    <span
      className={`${styles.crest} ${className ?? ''}`}
      data-div={division}
      style={{ height: size, width: Math.round(size * 0.866) }}
      role="img"
      aria-label={`${name} crest`}
    >
      <span className={styles.inner}>
        {showImg ? (
          <img src={src} alt="" className={styles.img} loading="lazy" decoding="async" onError={() => setFailed(true)} />
        ) : (
          <span className={styles.initials} style={{ fontSize: size * 0.34 }}>{teamInitials(name)}</span>
        )}
      </span>
    </span>
  );
}
