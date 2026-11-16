import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import NewsCard from '../../components/NewsCard/NewsCard';
import Section from '../../components/Section/Section';
import { loadLatestPosts, type NewsPost } from '../../lib/news';
import styles from './Latest.module.css';

/** Hidden entirely while loading, when the feed is empty, or when it fails. */
export default function Latest() {
  const [posts, setPosts] = useState<NewsPost[]>([]);

  useEffect(() => {
    let live = true;
    loadLatestPosts(3).then((p) => { if (live) setPosts(p); });
    return () => { live = false; };
  }, []);

  if (!posts.length) return null;
  return (
    <Section id="latest" title="Latest">
      <ul className={styles.grid}>
        {posts.map((p) => <li key={p.id}><NewsCard post={p} /></li>)}
      </ul>
      <p className={styles.more}><Link to="/news">All news</Link></p>
    </Section>
  );
}
