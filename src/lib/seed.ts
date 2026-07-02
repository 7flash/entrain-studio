import { seedIfNeeded } from './templates';
const seeded = await seedIfNeeded();
console.log(seeded ? 'Seeded ENTRAIN soundtracks.' : 'Soundtracks already present.');
