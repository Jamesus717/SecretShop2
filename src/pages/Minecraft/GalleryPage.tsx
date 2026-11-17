import Button from '../../components/Button/Button';
import InfoPage from '../../components/InfoPage/InfoPage';
import { DISCORD_URL } from '../../config';
import { MINECRAFT_GALLERY } from '../../data/minecraftGallery';
import styles from './Gallery.module.css';

export default function GalleryPage() {
  return (
    <InfoPage eyebrow="Minecraft" title="Gallery" lede="Builds and screenshots from the SecretLeague server.">
      {MINECRAFT_GALLERY.length === 0 ? (
        <div className={styles.empty}>
          <p>No screenshots yet. Share yours in the Discord and we'll add the best ones here.</p>
          <Button href={DISCORD_URL}>Join the Discord</Button>
        </div>
      ) : (
        <ul className={styles.grid}>
          {MINECRAFT_GALLERY.map((s) => (
            <li key={s.src}>
              <a href={s.src} target="_blank" rel="noopener noreferrer" className={styles.item}>
                <img src={s.src} alt={s.title} loading="lazy" />
                <span className={styles.caption}>
                  <strong>{s.title}</strong>
                  {s.by && <span> by {s.by}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </InfoPage>
  );
}
