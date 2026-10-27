// The home page (/) from the scraper's copy in D1: index.html from main with the firm
// table filled from the scraped prices. index.html when there is none (see api/pfb/_lib.js).
import { servePage } from "./api/pfb/_lib.js";

export const onRequestGet = (context) => servePage(context, "/");
