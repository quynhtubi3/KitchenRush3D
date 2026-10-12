/**
 * Shared visual identity tokens for the Chaotic Pop pass.
 * These colors are presentation-only: station geometry and gameplay coordinates stay authored elsewhere.
 */
export const popCore = {
  ink: '#25243A',
  cream: '#FFF1D2',
  chili: '#F4513D',
  mustard: '#FFC72C',
  grape: '#6937C8',
  teal: '#159B88',
  mint: '#8BE0BD',
  sky: '#65C9DB',
  cocoa: '#65382F',
  paper: '#FFF9E9',
} as const;

export const popSemantic = {
  background: popCore.ink,
  surface: popCore.paper,
  accent: popCore.mustard,
  danger: '#D84235',
  success: '#19734F',
  warning: '#B66A00',
} as const;

export const restaurantPopThemes = {
  'little-sun': {
    cabinet: '#15545C',
    wood: '#704035',
    accent: '#FFC72C',
    secondary: '#F4513D',
    floor: '#EAD8B0',
    wall: '#F5D27B',
    room: '#F0D994',
  },
  tide: {
    cabinet: '#075B75',
    wood: '#A9533E',
    accent: '#FFD447',
    secondary: '#F16B55',
    floor: '#B9E0DF',
    wall: '#C4E9DF',
    room: '#BDE7E3',
  },
  olive: {
    cabinet: '#536B3E',
    wood: '#70402E',
    accent: '#F0B93B',
    secondary: '#D94937',
    floor: '#E3CF9D',
    wall: '#E8D9A8',
    room: '#D9E1B2',
  },
  lantern: {
    cabinet: '#A2382C',
    wood: '#392B38',
    accent: '#FFC52E',
    secondary: '#32A98A',
    floor: '#C78253',
    wall: '#EDC68A',
    room: '#EAB27B',
  },
  orbit: {
    cabinet: '#4937A9',
    wood: '#292944',
    accent: '#D1FF43',
    secondary: '#42CBE4',
    floor: '#8387CF',
    wall: '#A8E8EA',
    room: '#929BE3',
  },
} as const;

export type RestaurantPopTheme = (typeof restaurantPopThemes)[keyof typeof restaurantPopThemes];

export function restaurantPopTheme(id: string): RestaurantPopTheme {
  return (
    restaurantPopThemes[id as keyof typeof restaurantPopThemes] ?? restaurantPopThemes['little-sun']
  );
}
