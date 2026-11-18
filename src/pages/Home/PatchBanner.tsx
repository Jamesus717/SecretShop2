import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import btn from '../../components/Button/Button.module.css';
import styles from './PatchBanner.module.css';

export const PATCH_VERSION = '7.42';
export const PATCH_PATH = `/patch/${PATCH_VERSION}`;

// Small clip, shown at 160x88 (files are 2x for sharp screens).
const W = 160;
const H = 88;

export default function PatchBanner() {
  const reduce = useReducedMotion();
  return (
    <section className={styles.banner} aria-labelledby="patch-title">
      <div className={`container ${styles.inner}`}>
        <p className={styles.kicker}>Patch {PATCH_VERSION} is out</p>
        <h2 id="patch-title" className={styles.headline}>Finally the patch is here</h2>
        <div className={styles.row}>
          {reduce ? (
            <img className={styles.media} src="/patch/smart-poster.webp" width={W} height={H} alt="" />
          ) : (
            <video
              className={styles.media}
              width={W}
              height={H}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster="/patch/smart-poster.webp"
              aria-hidden="true"
              tabIndex={-1}
            >
              <source src="/patch/smart.webm" type="video/webm" />
              <source src="/patch/smart.mp4" type="video/mp4" />
            </video>
          )}
          <p className={styles.sub}>Learn the patch the smart way</p>
        </div>
        <Link to={PATCH_PATH} className={`${btn.btn} ${btn.primary} ${styles.cta}`}>
          Read the {PATCH_VERSION} patch notes
        </Link>
      </div>
    </section>
  );
}
