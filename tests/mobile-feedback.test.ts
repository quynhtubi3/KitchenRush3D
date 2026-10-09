import { describe, expect, it } from 'vitest';
import {
  stickDirection,
  keyboardDirection,
  movementTarget,
  nearbyStation,
  expectedInteraction,
} from '../apps/client/src/mobile-controls';
import { customerUrgent, stationFeedback, FeedbackCues } from '../apps/client/src/feedback';
import { Game } from '../apps/server/src/simulation/game';
import { parsePreferences } from '../apps/client/src/preferences';

describe('joystick intents', () => {
  it('quantizes all eight directions, rejects invalid input and has a neutral dead zone', () => {
    expect(stickDirection(0.1, 0.1)).toBeNull();
    expect(stickDirection(NaN, 0)).toBeNull();
    const directions = Array.from({ length: 8 }, (_, i) =>
      stickDirection(Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)),
    );
    expect(new Set(directions.map((d) => JSON.stringify(d))).size).toBe(8);
  });
  it('maps held WASD and arrow keys to screen-relative movement', () => {
    expect(keyboardDirection(new Set(['w', 'd']))).toEqual({ x: 1, z: -1 });
    expect(keyboardDirection(new Set(['arrowleft', 'arrowdown']))).toEqual({ x: -1, z: 1 });
    expect(keyboardDirection(new Set())).toBeNull();
  });
  it('maps screen directions to the camera and sends ordinary server-validated grid moves', () => {
    const game = new Game({ id: 'little-sun-01' });
    game.addChef('p');
    const chef = game.state.chefs.p;
    const target = movementTarget(chef, { x: 1, z: 0 }, game.state.stations, Math.PI / 2);
    expect(target).toEqual({ x: 6, z: 8 });
    game.intent('p', { type: 'move', ...target! });
    for (let i = 0; i < 10; i++) game.tick(0.05);
    expect(chef.x).toBe(6);
    expect(chef.z).toBe(8);
    expect(chef.item).toBeNull();
    expect(game.state.score).toBe(0);
  });
  it('does not steer into walls, through blocked corners or toward distant interaction targets', () => {
    const game = new Game();
    game.addChef('p');
    const chef = game.state.chefs.p;
    chef.x = 1;
    chef.z = 2;
    expect(movementTarget(chef, { x: 1, z: 0 }, [], Math.PI / 2)).toBeNull();
    const wall = { ...game.station('rack'), x: 2, z: 2 };
    expect(movementTarget(chef, { x: -1, z: 1 }, [wall], Math.PI / 2)).toEqual({ x: 1, z: 3 });
    expect(nearbyStation(chef, [{ ...wall, x: 9, z: 8 }])).toBeUndefined();
    expect(nearbyStation(chef, [wall])?.id).toBe('rack');
  });
  it('keeps a selected station stable around equal-distance interaction candidates', () => {
    const game = new Game();
    game.addChef('p');
    const chef = game.state.chefs.p;
    chef.x = 1;
    chef.z = 5;
    const rack = game.station('rack');
    const sink = game.station('sink');
    expect(nearbyStation(chef, game.state.stations)?.id).toBe('rack');
    chef.z = 5.03;
    expect(nearbyStation(chef, game.state.stations, 'rack')?.id).toBe('rack');
    chef.z = 5.3;
    expect(nearbyStation(chef, game.state.stations, rack.id)?.id).toBe(sink.id);
  });
  it('shows a contextual action hint without applying the interaction on the client', () => {
    const game = new Game({ id: 'little-sun-01' });
    game.addChef('p');
    const chef = game.state.chefs.p;
    const stove = game.station('stove');
    chef.item = { id: 'meat-hint', kind: 'meat', parts: [] };
    const before = JSON.stringify(game.state);
    expect(expectedInteraction(chef, stove, game.state, true)).toBe('Bắt đầu nấu');
    expect(JSON.stringify(game.state)).toBe(before);
    expect(chef.item?.kind).toBe('meat');
    expect(stove.item).toBeNull();
  });
  it('defaults old preferences to tap and preserves joystick selection', () => {
    expect(parsePreferences('{}').touchControls).toBe('tap');
    expect(parsePreferences('{"touchControls":"joystick"}').touchControls).toBe('joystick');
  });
});
describe('snapshot feedback', () => {
  it('warns waiting and queued customers but never eating/departing customers', () => {
    const game = new Game();
    const c = game.state.customers[0];
    c.state = 'WaitingForFood';
    c.patience = 20;
    c.maxPatience = 100;
    expect(customerUrgent(c)).toBe(true);
    c.state = 'Queueing';
    expect(customerUrgent(c)).toBe(true);
    c.state = 'Eating';
    expect(customerUrgent(c)).toBe(false);
    c.state = 'WaitingForFood';
    c.patience = 21;
    expect(customerUrgent(c)).toBe(false);
  });
  it('derives ready/burn warnings from configured recipe duration and deduplicates cues', () => {
    const game = new Game();
    const s = game.station('stove');
    s.item = { id: 'food1', kind: 'cookedMeat', parts: [] };
    s.process = { output: 'cookedMeat', seconds: 7, taps: 0 };
    s.phase = 'ready';
    s.elapsed = 7;
    const cues = new FeedbackCues();
    expect(stationFeedback(s, 14)).toBe('ready');
    expect(cues.update(game.state, 14)).toContain('foodReady');
    expect(cues.update(game.state, 14)).toEqual([]);
    s.elapsed = 18;
    expect(stationFeedback(s, 14)).toBe('burn-soon');
    expect(cues.update(game.state, 14)).toContain('burnWarning');
    game.state.phase = 'paused';
    expect(cues.update(game.state, 14)).toEqual([]);
    game.state.phase = 'playing';
    expect(cues.update(game.state, 14)).toEqual([]);
    s.phase = 'burnt';
    expect(stationFeedback(s, 14)).toBeNull();
    cues.update(game.state, 14);
    s.phase = 'ready';
    s.elapsed = 7;
    s.item.id = 'food2';
    expect(cues.update(game.state, 14)).toContain('foodReady');
  });
});
