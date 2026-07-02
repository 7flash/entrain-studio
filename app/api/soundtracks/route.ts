import { allTemplates, templatesByCategory } from '@/lib/templates';
import { json } from '@/lib/http';

export function GET() {
  return json({ ok: true, soundtracks: allTemplates().map(({ session, ...meta }) => meta), groups: templatesByCategory().map((g) => ({ category: g.category, count: g.templates.length })) });
}
