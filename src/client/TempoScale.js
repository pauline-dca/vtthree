import { VTThreeViewer, RENDER_MODE } from "./VTThreeViewer";
import * as THREE from "three";
import { OLViewer, IGN_STYLES } from "./OLViewer";
import Feature from "ol/Feature";
import { ZOOM_RES_L93 } from "./Utils";
export class TempoScale {
  constructor(
    min,
    max
  ) {
    this.min = min;
    this.max = max;
  }

}
