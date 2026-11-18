export type ChangeKind = 'buff' | 'nerf' | 'rework' | 'neutral';
export interface Segment { text: string; bold: boolean }
export interface ParsedChange { stat: string; direction: 'up' | 'down' | null; from: number; to: number }
export function cleanNote(raw: string | null | undefined): string;
export function toSegments(text: string): Segment[];
export function parseChange(text: string): ParsedChange | null;
export function magnitudeFor(from: number, to: number): 1 | 2 | 3;
export function statPolarity(stat: string): 'higherBetter' | 'lowerBetter';
export function classifyLine(text: string): { kind: ChangeKind; magnitude: 1 | 2 | 3; directional: boolean };
