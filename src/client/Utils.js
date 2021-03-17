import proj4 from "proj4";

export const proj4326 = proj4.defs("EPSG:4326");
export const proj3857 = proj4.defs("EPSG:3857");
import * as THREE from "three";

export const ZOOM_RES_L93 = [
  156543.033928041,
  78271.5169640205,
  39135.7584820102,
  19567.8792410051,
  9783.9396205026,
  4891.9698102513,
  2445.9849051256,
  1222.9924525628,
  611.4962262814,
  305.7481131407,
  152.8740565704,
  76.4370282852,
  38.2185141426,
  19.1092570713,
  9.5546285356,
  4.7773142678,
  2.3886571339,
  1.194328567,
  0.5971642835,
  0.2985821417,
  0.1492910709,
  0.0746455354
];

const DEGS_TO_RADS = Math.PI / 180;
const DIGIT_0 = 48,
  DIGIT_9 = 57,
  COMMA = 44,
  SPACE = 32,
  PERIOD = 46,
  MINUS = 45;
export function transformSVGPath(pathStr) {
  const path = new THREE.ShapePath();

  let idx = 1,
    activeCmd,
    x = 0,
    y = 0,
    nx = 0,
    ny = 0,
    firstX = null,
    firstY = null,
    x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0,
    rx = 0,
    ry = 0,
    xar = 0,
    laf = 0,
    sf = 0,
    cx,
    cy;

  const len = pathStr.length;

  function eatNum() {
    let sidx,
      c,
      isFloat = false,
      s;

    // eat delims

    while (idx < len) {
      c = pathStr.charCodeAt(idx);

      if (c !== COMMA && c !== SPACE) break;

      idx++;
    }

    if (c === MINUS) {
      sidx = idx++;
    } else {
      sidx = idx;
    }

    // eat number

    while (idx < len) {
      c = pathStr.charCodeAt(idx);

      if (DIGIT_0 <= c && c <= DIGIT_9) {
        idx++;
        continue;
      } else if (c === PERIOD) {
        idx++;
        isFloat = true;
        continue;
      }

      s = pathStr.substring(sidx, idx);
      return isFloat ? parseFloat(s) : parseInt(s);
    }

    s = pathStr.substring(sidx);
    return isFloat ? parseFloat(s) : parseInt(s);
  }

  function nextIsNum() {
    let c;

    // do permanently eat any delims...

    while (idx < len) {
      c = pathStr.charCodeAt(idx);

      if (c !== COMMA && c !== SPACE) break;

      idx++;
    }

    c = pathStr.charCodeAt(idx);
    return c === MINUS || (DIGIT_0 <= c && c <= DIGIT_9);
  }

  let canRepeat;
  activeCmd = pathStr[0];

  while (idx <= len) {
    canRepeat = true;

    switch (activeCmd) {
      // moveto commands, become lineto's if repeated
      case "M":
        x = eatNum();
        y = eatNum();
        path.moveTo(x, y);
        activeCmd = "L";
        firstX = x;
        firstY = y;
        break;

      case "m":
        x += eatNum();
        y += eatNum();
        path.moveTo(x, y);
        activeCmd = "l";
        firstX = x;
        firstY = y;
        break;

      case "Z":
      case "z":
        canRepeat = false;
        if (x !== firstX || y !== firstY) path.lineTo(firstX, firstY);
        break;

      // - lines!
      case "L":
      case "H":
      case "V":
        nx = activeCmd === "V" ? x : eatNum();
        ny = activeCmd === "H" ? y : eatNum();
        path.lineTo(nx, ny);
        x = nx;
        y = ny;
        break;

      case "l":
      case "h":
      case "v":
        nx = activeCmd === "v" ? x : x + eatNum();
        ny = activeCmd === "h" ? y : y + eatNum();
        path.lineTo(nx, ny);
        x = nx;
        y = ny;
        break;

      // - cubic bezier
      case "C":
        x1 = eatNum();
        y1 = eatNum();

      case "S":
        if (activeCmd === "S") {
          x1 = 2 * x - x2;
          y1 = 2 * y - y2;
        }

        x2 = eatNum();
        y2 = eatNum();
        nx = eatNum();
        ny = eatNum();
        path.bezierCurveTo(x1, y1, x2, y2, nx, ny);
        x = nx;
        y = ny;
        break;

      case "c":
        x1 = x + eatNum();
        y1 = y + eatNum();

      case "s":
        if (activeCmd === "s") {
          x1 = 2 * x - x2;
          y1 = 2 * y - y2;
        }

        x2 = x + eatNum();
        y2 = y + eatNum();
        nx = x + eatNum();
        ny = y + eatNum();
        path.bezierCurveTo(x1, y1, x2, y2, nx, ny);
        x = nx;
        y = ny;
        break;

      // - quadratic bezier
      case "Q":
        x1 = eatNum();
        y1 = eatNum();

      case "T":
        if (activeCmd === "T") {
          x1 = 2 * x - x1;
          y1 = 2 * y - y1;
        }
        nx = eatNum();
        ny = eatNum();
        path.quadraticCurveTo(x1, y1, nx, ny);
        x = nx;
        y = ny;
        break;

      case "q":
        x1 = x + eatNum();
        y1 = y + eatNum();

      case "t":
        if (activeCmd === "t") {
          x1 = 2 * x - x1;
          y1 = 2 * y - y1;
        }

        nx = x + eatNum();
        ny = y + eatNum();
        path.quadraticCurveTo(x1, y1, nx, ny);
        x = nx;
        y = ny;
        break;

      // - elliptical arc
      case "A":
        rx = eatNum();
        ry = eatNum();
        xar = eatNum() * DEGS_TO_RADS;
        laf = eatNum();
        sf = eatNum();
        nx = eatNum();
        ny = eatNum();
        if (rx !== ry)
          console.warn("Forcing elliptical arc to be a circular one:", rx, ry);

        // SVG implementation notes does all the math for us! woo!
        // http://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes

        // step1, using x1 as x1'

        x1 = (Math.cos(xar) * (x - nx)) / 2 + (Math.sin(xar) * (y - ny)) / 2;
        y1 = (-Math.sin(xar) * (x - nx)) / 2 + (Math.cos(xar) * (y - ny)) / 2;

        // step 2, using x2 as cx'

        let norm = Math.sqrt(
          (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) /
            (rx * rx * y1 * y1 + ry * ry * x1 * x1)
        );

        if (laf === sf) norm = -norm;

        x2 = (norm * rx * y1) / ry;
        y2 = (norm * -ry * x1) / rx;

        // step 3

        cx = Math.cos(xar) * x2 - Math.sin(xar) * y2 + (x + nx) / 2;
        cy = Math.sin(xar) * x2 + Math.cos(xar) * y2 + (y + ny) / 2;

        const u = new THREE.Vector2(1, 0);
        const v = new THREE.Vector2((x1 - x2) / rx, (y1 - y2) / ry);

        let startAng = Math.acos(u.dot(v) / u.length() / v.length());

        if (u.x * v.y - u.y * v.x < 0) startAng = -startAng;

        // we can reuse 'v' from start angle as our 'u' for delta angle
        u.x = (-x1 - x2) / rx;
        u.y = (-y1 - y2) / ry;

        let deltaAng = Math.acos(v.dot(u) / v.length() / u.length());

        // This normalization ends up making our curves fail to triangulate...

        if (v.x * u.y - v.y * u.x < 0) deltaAng = -deltaAng;
        if (!sf && deltaAng > 0) deltaAng -= Math.PI * 2;
        if (sf && deltaAng < 0) deltaAng += Math.PI * 2;

        path.absarc(cx, cy, rx, startAng, startAng + deltaAng, sf);
        x = nx;
        y = ny;
        break;

      default:
        throw new Error("Wrong path command: " + activeCmd);
    }

    // just reissue the command

    if (canRepeat && nextIsNum()) continue;

    activeCmd = pathStr[idx++];
  }

  return path;
}

var thirdPi = Math.PI / 3,
  angles = [0, thirdPi, 2 * thirdPi, 3 * thirdPi, 4 * thirdPi, 5 * thirdPi];
export function hexagon(radius) {
  var x0 = 0,
    y0 = 0;
  return angles.map(function(angle) {
    var x1 = Math.sin(angle) * radius,
      y1 = -Math.cos(angle) * radius,
      dx = x1 - x0,
      dy = y1 - y0;
    (x0 = x1), (y0 = y1);
    return [dx, dy];
  });
}
