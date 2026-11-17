import { Link } from 'react-router-dom';
import InfoPage from '../../components/InfoPage/InfoPage';
import { MINECRAFT_INFO, MINECRAFT_RULES } from './content';
import styles from './Gallery.module.css';

export default function MinecraftPage() {
  return (
    <InfoPage
      eyebrow="Minecraft"
      title="Rules & Info"
      lede={<>Everything you need for the SecretLeague server. See what people have built in the <Link to="/minecraft/gallery">gallery</Link>.</>}
      sections={MINECRAFT_INFO}
    >
      <h2 className={styles.rulesHead}>Server rules</h2>
      <ol className={styles.rules}>
        {MINECRAFT_RULES.map((r) => (
          <li key={r.id} id={r.id}>
            <strong>{r.title}.</strong> {r.paras.flat().join(' ')}
          </li>
        ))}
      </ol>
    </InfoPage>
  );
}
