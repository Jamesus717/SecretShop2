import type { Patch, TopMover } from '../../data/patches';
import { AdminNote, Hl, Icon, LineList, Marker, Rich } from './Lines';
import { viewCreeps, viewItems, viewSections, type CreepView, type ItemView, type SectionView } from './patchSearch';
import styles from './Patch.module.css';

export function Empty({ what }: { what: string }) {
  return <p className={styles.empty}>No {what} match your search.</p>;
}

function Sections({ views, q }: { views: SectionView[]; q: string }) {
  return (
    <div className={styles.cards}>
      {views.map(({ section, lines }) => (
        <section key={section.title} className={styles.card} aria-label={section.title}>
          <h3 className={styles.h3}><Hl text={section.title} q={q} /></h3>
          <LineList lines={lines} q={q} />
        </section>
      ))}
    </div>
  );
}

export function General({ patch, q }: { patch: Patch; q: string }) {
  const v = viewSections(patch.general, q);
  return v.length ? <Sections views={v} q={q} /> : <Empty what="general changes" />;
}

function ItemCard({ v, q }: { v: ItemView; q: string }) {
  const { item, lines } = v;
  return (
    <article className={styles.card}>
      <div className={styles.heroHead}>
        <Icon src={item.icon} name={item.name} className={styles.itemIcon} />
        <h3 className={styles.heroName}><Hl text={item.name} q={q} /></h3>
        {item.label && <span className={styles.badge}><Hl text={item.label} q={q} /></span>}
      </div>
      <LineList lines={lines} q={q} />
    </article>
  );
}

export function Items({ patch, q }: { patch: Patch; q: string }) {
  const views = viewItems(patch.items, q);
  if (!views.length) return <Empty what="items" />;
  const groups = new Map<string, ItemView[]>();
  for (const v of views) {
    const g = v.item.group ?? 'Items';
    groups.set(g, [...(groups.get(g) ?? []), v]);
  }
  return (
    <div className={styles.stack}>
      {[...groups].map(([g, list]) => (
        <section key={g} aria-label={g}>
          <h2 className={styles.h2}>{g} <span className={styles.n}>{list.length}</span></h2>
          <div className={styles.cards}>{list.map((v) => <ItemCard key={v.item.id} v={v} q={q} />)}</div>
        </section>
      ))}
    </div>
  );
}

export function NeutralItems({ patch, q }: { patch: Patch; q: string }) {
  const sections = viewSections(patch.neutral_items.sections, q);
  const items = viewItems(patch.neutral_items.items, q);
  if (!sections.length && !items.length) return <Empty what="neutral items" />;
  return (
    <div className={styles.stack}>
      {sections.length > 0 && <Sections views={sections} q={q} />}
      {items.length > 0 && (
        <section aria-label="Neutral item changes">
          <h2 className={styles.h2}>Items <span className={styles.n}>{items.length}</span></h2>
          <div className={styles.cards}>{items.map((v) => <ItemCard key={v.item.id} v={v} q={q} />)}</div>
        </section>
      )}
    </div>
  );
}

function CreepCard({ v, q }: { v: CreepView; q: string }) {
  return (
    <article className={styles.card}>
      <div className={styles.heroHead}>
        <Icon src={null} name={v.creep.name} className={styles.itemIcon} />
        <h3 className={styles.heroName}><Hl text={v.creep.name} q={q} /></h3>
      </div>
      <LineList lines={v.lines} q={q} />
    </article>
  );
}

export function NeutralCreeps({ patch, q }: { patch: Patch; q: string }) {
  const sections = viewSections(patch.neutral_creeps.sections, q);
  const creeps = viewCreeps(patch.neutral_creeps.creeps, q);
  if (!sections.length && !creeps.length) return <Empty what="neutral creeps" />;
  return (
    <div className={styles.stack}>
      {sections.length > 0 && <Sections views={sections} q={q} />}
      {creeps.length > 0 && (
        <section aria-label="Creep camps">
          <h2 className={styles.h2}>Creeps <span className={styles.n}>{creeps.length}</span></h2>
          <div className={styles.cards}>{creeps.map((v) => <CreepCard key={v.creep.shortName} v={v} q={q} />)}</div>
        </section>
      )}
    </div>
  );
}

const plain = (s: string): string => s.replace(/\*\*/g, '').toLowerCase();

function Movers({ list, kind, q }: { list: TopMover[]; kind: 'buff' | 'nerf'; q: string }) {
  const rows = list.filter((m) => !q || m.name.toLowerCase().includes(q) || m.lines.some((l) => plain(l).includes(q)));
  if (!rows.length) return <Empty what={kind === 'buff' ? 'buffs' : 'nerfs'} />;
  return (
    <ol className={styles.movers}>
      {rows.map((m) => {
        const i = list.indexOf(m) + 1;
        const nameHit = !q || m.name.toLowerCase().includes(q);
        return (
          <li key={m.ref} className={styles.card}>
            <div className={styles.heroHead}>
              <span className={styles.rank}><span className="visually-hidden">Number </span>{i}</span>
              <Icon src={m.icon} name={m.name} className={m.type === 'hero' ? styles.heroIcon : styles.itemIcon} />
              <h3 className={styles.heroName}><Hl text={m.name} q={q} /></h3>
              <span className={`${styles.badge} ${kind === 'buff' ? styles.k_buff : styles.k_nerf}`}>
                <span aria-hidden="true">{kind === 'buff' ? '▲' : '▼'}</span> {m.type}
              </span>
            </div>
            <ul className={styles.lines}>
              {m.lines.filter((l) => nameHit || plain(l).includes(q)).map((l, j) => (
                <li key={j} className={styles.line}>
                  <Marker kind={kind} magnitude={2} />
                  <span className={styles.lineBody}><span><Rich text={l} q={q} /></span></span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

export function Biggest({ patch, q }: { patch: Patch; q: string }) {
  const h = patch.highlights;
  return (
    <div className={styles.stack}>
      <AdminNote />
      <div className={styles.two}>
        <section aria-label="Biggest buffs">
          <h2 className={styles.h2}>Biggest buffs</h2>
          <Movers list={h.topBuffs} kind="buff" q={q} />
        </section>
        <section aria-label="Biggest nerfs">
          <h2 className={styles.h2}>Biggest nerfs</h2>
          <Movers list={h.topNerfs} kind="nerf" q={q} />
        </section>
      </div>
    </div>
  );
}
