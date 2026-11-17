/** Static number (count-up animation removed: it read as template-y). */
export default function CountUp({ value }: { value: number; duration?: number }) {
  return <span className="num">{value}</span>;
}
