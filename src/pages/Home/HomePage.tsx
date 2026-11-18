import PatchBanner from './PatchBanner';
import Hero from './Hero';
import Champions from './Champions';
import About from './About';
import Shorts from './Shorts';
import Latest from './Latest';
import Support from './Support';
import Sponsors from './Sponsors';

export default function HomePage() {
  return (
    <>
      <PatchBanner />
      <Hero />
      <Champions />
      <About />
      <Shorts />
      <Latest />
      <Support />
      <Sponsors />
    </>
  );
}
