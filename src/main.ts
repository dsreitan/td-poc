import { createGame, seedFromUrl } from "./render/Game.ts";

createGame("game", seedFromUrl(window.location.search));
