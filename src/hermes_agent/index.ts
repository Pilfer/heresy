import { Heresy } from "./heresy";


const heresy = new Heresy('REPLACED_VIA_CODE');

heresy.init();

(globalThis as any).heresy = heresy;
