/** Shared stylized surface/light rules. Used only while constructing visuals. */
export const materialArchetypes = {
  paintedMetal: { roughness: 0.68, metallic: 0 },
  ceramic: { roughness: 0.48, metallic: 0 },
  wood: { roughness: 0.86, metallic: 0 },
  fabric: { roughness: 0.96, metallic: 0 },
  plastic: { roughness: 0.68, metallic: 0 },
  food: { roughness: 0.68, metallic: 0 },
  glass: { roughness: 0.28, metallic: 0 },
  stone: { roughness: 0.86, metallic: 0 },
  panel: { roughness: 0.68, metallic: 0.18 },
  metal: { roughness: 0.48, metallic: 0.7 },
  skin: { roughness: 0.68, metallic: 0 },
} as const;

export type MaterialFamily = keyof typeof materialArchetypes;

export function surfaceFamily(name: string, food = false): MaterialFamily | null {
  const n = name.toLowerCase();
  if (/hand-thrown ceramic plate|plate fine gold rim/.test(n) || n === 'stack') return 'ceramic';
  if (food) return 'food';
  if (
    /apron|jacket|shirt|sleeve|toque|cuff|trouser|upholster|cushion|linen|napkin|woven|noren/.test(
      n,
    ) ||
    n === 'body'
  )
    return 'fabric';
  if (/round face|ear|cheek|nose|hand$|thumb/.test(n)) return 'skin';
  if (/glass|water surface/.test(n)) return 'glass';
  if (/steel|chrome|faucet|knife|bell|pot handle|wok loop|tap wing|tap handle|brass/.test(n))
    return 'metal';
  if (/porcelain|ceramic|rice cooker/.test(n)) return 'ceramic';
  if (/induction|titanium|structural rib|illuminated control/.test(n)) return 'panel';
  if (
    /wood|timber|bamboo|chopping board|board grip|bin slat|table leg|table rail|pedestal|skirting|baseboard/.test(
      n,
    )
  )
    return 'wood';
  if (/plaster|arch pillar|wall$|foundation|plinth/.test(n)) return 'stone';
  if (/hair|fringe|curl|shoe|handle|dial/.test(n)) return 'plastic';
  if (/enamel|cabinet|station accent|pull|dispenser front/.test(n)) return 'paintedMetal';
  return null;
}

const lightProfiles = {
  'little-sun': {
    fill: 0.66,
    fillColor: '#fff7e8',
    ground: '#817587',
    key: 1.15,
    keyColor: '#fff2dc',
    shadow: 0.36,
  },
  tide: {
    fill: 0.72,
    fillColor: '#eef9ff',
    ground: '#6a7d8a',
    key: 1.08,
    keyColor: '#fff9ec',
    shadow: 0.4,
  },
  olive: {
    fill: 0.68,
    fillColor: '#faf5e7',
    ground: '#827760',
    key: 1.12,
    keyColor: '#ffedda',
    shadow: 0.38,
  },
  lantern: {
    fill: 0.78,
    fillColor: '#eef1ff',
    ground: '#74677e',
    key: 1.15,
    keyColor: '#ffe7ce',
    shadow: 0.46,
  },
  orbit: {
    fill: 0.75,
    fillColor: '#edf2ff',
    ground: '#687c9d',
    key: 1.12,
    keyColor: '#fff2de',
    shadow: 0.42,
  },
} as const;

export function restaurantLighting(id: string) {
  return lightProfiles[id as keyof typeof lightProfiles] ?? lightProfiles['little-sun'];
}

export const visualGroundY = 0;

/** Dedicated replacement roots preserve pivots and never equip or own a cosmetic. */
export const characterArtContract = {
  version: 'chef-procedural-v1',
  slots: ['hat', 'hair', 'apron'] as const,
  faceBounds: { halfWidth: 0.32, halfHeight: 0.275 },
  heldAnchor: { x: 0, y: 0.78, z: 0.51 },
};
