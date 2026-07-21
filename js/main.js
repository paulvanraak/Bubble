import { Game } from './game.js';
import { UI } from './ui.js';

const canvas = document.getElementById('scene');
const game = new Game(canvas);
const ui = new UI(game);

game.start();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') game.saveNow();
});
window.addEventListener('beforeunload', () => game.saveNow());
