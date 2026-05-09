export interface Avatar {
  id: number;
  name: string;
  title: string;
  color: string;
}

export const AVATARS: Avatar[] = [
  { id: 0, name: 'The Captain', title: 'Red bandana', color: '#ef4444' },
  { id: 1, name: 'First Mate', title: 'Blue tricorn', color: '#3b82f6' },
  { id: 2, name: 'Navigator', title: 'Green vest', color: '#22c55e' },
  { id: 3, name: 'Quartermaster', title: 'Purple coat', color: '#a855f7' },
  { id: 4, name: 'Powder Monkey', title: 'Orange shirt', color: '#f97316' },
  { id: 5, name: 'Bosun', title: 'Cyan kerchief', color: '#06b6d4' },
  { id: 6, name: 'Cabin Girl', title: 'Pink ribbon', color: '#ec4899' },
  { id: 7, name: 'Cook', title: 'Lime apron', color: '#84cc16' },
];
