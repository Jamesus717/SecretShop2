import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

export default function Skeleton({ width, height = 16, className }: { width?: number | string; height?: number | string; className?: string }) {
  const style: CSSProperties = { width, height };
  return <span className={`${styles.sk} ${className ?? ''}`} style={style} aria-hidden="true" />;
}
