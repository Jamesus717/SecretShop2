import { Suspense } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Header from './Header';
import LiveStrip from './LiveStrip';
import Footer from './Footer';
import ConsentBanner from '../components/ConsentBanner/ConsentBanner';
import styles from './Layout.module.css';

export default function Layout() {
  const { pathname } = useLocation();
  // useOutlet keeps the outgoing page mounted while it fades out.
  const outlet = useOutlet();

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <LiveStrip />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          id="main"
          key={pathname}
          className={styles.main}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <Suspense fallback={<div className={styles.loading} aria-busy="true" />}>{outlet}</Suspense>
        </motion.main>
      </AnimatePresence>
      <Footer />
      <ConsentBanner />
    </>
  );
}
