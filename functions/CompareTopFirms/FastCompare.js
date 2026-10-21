// /CompareTopFirms/FastCompare from the scraper's copy in D1, or FastCompare.html when
// there is none (see api/pfb/_lib.js).
import { servePage } from "../api/pfb/_lib.js";

export const onRequestGet = (context) => servePage(context, "/CompareTopFirms/FastCompare");
