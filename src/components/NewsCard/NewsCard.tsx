import { Link } from 'react-router-dom';
import DivisionTag from '../DivisionTag/DivisionTag';
import { formatPostDate, thumbUrl, type NewsPost } from '../../lib/news';
import styles from './NewsCard.module.css';

export default function NewsCard({ post }: { post: NewsPost }) {
  const img = thumbUrl(post);
  return (
    <Link to="/news" className={styles.card}>
      <span className={styles.media}>{img && <img src={img} alt="" loading="lazy" decoding="async" />}</span>
      <span className={styles.body}>
        <span className={styles.meta}>
          {post.division && <DivisionTag division={post.division} />}
          <time dateTime={post.created_at} className={styles.date}>{formatPostDate(post.created_at)}</time>
        </span>
        <span className={styles.title}>{post.title}</span>
      </span>
    </Link>
  );
}
