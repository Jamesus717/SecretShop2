import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { mmrToRank } from '../../lib/rosters';
import { MAX_MMR, POSITIONS, parseMmr } from './registration';
import styles from './form.module.css';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
}

/** Labelled text input with inline error. The label is a real <label>, the error is linked via aria-describedby. */
export function Field({ label, value, onChange, error, required, optional, hint, id, ...rest }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const eid = `${fid}-err`;
  const hid = `${fid}-hint`;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fid}>
        {label}
        {required && <span className={styles.req} aria-hidden="true">*</span>}
        {optional && <span className={styles.opt}>(optional)</span>}
      </label>
      <input
        {...rest}
        id={fid}
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? eid : '', hint ? hid : ''].filter(Boolean).join(' ') || undefined}
      />
      {hint && <p id={hid} className={styles.hint}>{hint}</p>}
      {error && <p id={eid} className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

/** MMR input with a live rank-medal preview. */
export function MmrField({ value, onChange, error, label = 'MMR', id }: { value: string; onChange: (v: string) => void; error?: string; label?: string; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const eid = `${fid}-err`;
  const n = parseMmr(value);
  const rank = n ? mmrToRank(n) : null;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fid}>{label}<span className={styles.req} aria-hidden="true">*</span></label>
      <div className={styles.mmrRow}>
        <input
          id={fid}
          className={styles.input}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_MMR}
          placeholder="e.g. 3400"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? eid : undefined}
        />
        <span className={styles.rankPreview} aria-live="polite">
          {rank && <><img src={rank.icon} alt="" width={36} height={36} />{rank.label}</>}
        </span>
      </div>
      {error && <p id={eid} className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

interface SingleProps { legend: string; name: string; value: string; onChange: (v: string) => void; error?: string }
/** One position (radio buttons styled as chips). */
export function PositionRadio({ legend, name, value, onChange, error }: SingleProps) {
  return (
    <fieldset className={styles.pos} aria-invalid={error ? true : undefined}>
      <legend>{legend}<span className={styles.req} aria-hidden="true">*</span></legend>
      {POSITIONS.map((p) => (
        <label key={p} className={styles.posOpt}>
          <input type="radio" name={name} value={p} checked={value === p} onChange={() => onChange(p)} />
          <span>Pos {p}</span>
        </label>
      ))}
      {error && <p className={styles.error} role="alert" style={{ flexBasis: '100%' }}>{error}</p>}
    </fieldset>
  );
}

interface MultiProps { legend: string; name: string; value: string[]; onChange: (v: string[]) => void; error?: string }
/** Any number of positions; pick order matters (first = primary). */
export function PositionMulti({ legend, name, value, onChange, error }: MultiProps) {
  const toggle = (p: string) => onChange(value.includes(p) ? value.filter((v) => v !== p) : [...value, p]);
  return (
    <fieldset className={styles.pos} aria-invalid={error ? true : undefined}>
      <legend>{legend}<span className={styles.req} aria-hidden="true">*</span></legend>
      {POSITIONS.map((p) => {
        const order = value.indexOf(p);
        return (
          <label key={p} className={styles.posOpt}>
            <input type="checkbox" name={name} value={p} checked={order !== -1} onChange={() => toggle(p)} />
            <span>
              Pos {p}
              {order !== -1 && <span className={styles.badge}>{order === 0 ? '★ primary' : `#${order + 1}`}</span>}
            </span>
          </label>
        );
      })}
      {error && <p className={styles.error} role="alert" style={{ flexBasis: '100%' }}>{error}</p>}
    </fieldset>
  );
}
