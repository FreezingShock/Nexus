// The one place the game's version is written. The title screen reads it; tests check package.json agrees.
export const VERSION = '0.9.0';
export const AUTHOR = 'nate';
export const AUTHOR_HANDLE = 'FreezingShock';

// "What is new", newest first, shown under Changes on the title screen. Plain sentences, no jargon.
export const CHANGES = [
  { v: '0.9.0', items: ['A title screen, with the town turning behind it, and a progress screen that opens onto your town.', 'Photo and cinematic mode on O: viewpoints, filters, frames and slow camera moves.', 'A month-grid calendar on K with holidays you can skip to.'] },
  { v: '0.8.0', items: ['Milestones on M: 28 goals that add up as your town grows.', 'A cozy sky with a sun or moon, stars and painted clouds.', 'Varied daily lives: townsfolk, tractors and forklifts keep their own hours.'] },
  { v: '0.7.0', items: ['Districts: name areas of the town, give them a flag and paint them on.', 'Services, parks and landmarks that lift happiness and income.'] },
];
