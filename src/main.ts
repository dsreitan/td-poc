import { CONTENT, selectPack } from "./content/index.ts";
import { createGame, seedFromUrl } from "./render/Game.ts";

selectPack(new URLSearchParams(window.location.search).get("pack"));
document.title = CONTENT.title;
createGame("game", seedFromUrl(window.location.search));
