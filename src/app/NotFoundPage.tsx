import { Link } from 'react-router-dom';
import Button from '../components/Button/Button';
import styles from './NotFoundPage.module.css';

export default function NotFoundPage() {
  return (
    <div className="container">
      <div className={styles.wrap}>
        <p className={styles.code} aria-hidden="true">404</p>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.text}>That link doesn&apos;t lead anywhere. It may have moved when the site was rebuilt.</p>
        <Link to="/" style={{ textDecoration: 'none' }}><Button>Back to home</Button></Link>
      </div>
    </div>
  );
}
