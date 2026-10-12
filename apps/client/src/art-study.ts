import { KitchenScene } from './game/scene';
import { defaultPreferences } from './preferences';
import { faceExpressions } from './game/character-face';
import { recipes } from '../../../packages/content/src/campaign';

const requested = new URLSearchParams(location.search).get('mode');
const mode =
  requested === 'food' || requested === 'customers' || requested === 'equipment'
    ? requested
    : 'faces';
const scene = new KitchenScene(document.querySelector('canvas')!);
scene.configure(defaultPreferences(true));
document.querySelector('#legend')!.textContent =
  mode === 'food'
    ? recipes.map((recipe) => recipe.name.en).join(' · ')
    : mode === 'equipment'
      ? 'Runtime Little Sun level 10 equipment kit — offline asset inspection, not gameplay'
      : mode === 'faces'
        ? faceExpressions.join(' · ')
        : 'Four deterministic customer styles / shared expression system';
void scene.renderArtStudy(mode);
window.addEventListener('pagehide', () => scene.dispose(), { once: true });
