import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'ghost';
type Common = { variant?: Variant; children: ReactNode; className?: string };
type AnchorProps = Common & { href: string } & AnchorHTMLAttributes<HTMLAnchorElement>;
type BtnProps = Common & { href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>;

export default function Button(props: AnchorProps | BtnProps) {
  const { variant = 'primary', className, children, ...rest } = props;
  const cls = `${styles.btn} ${styles[variant]} ${className ?? ''}`;
  if ('href' in rest && rest.href) {
    const a = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    const external = /^https?:/.test(rest.href);
    return (
      <a {...a} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    );
  }
  return <button type="button" {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)} className={cls}>{children}</button>;
}
