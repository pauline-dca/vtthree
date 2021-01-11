var turf = require("@turf/turf");
var proj4 = require("proj4");
const fs = require("fs");

const proj4326 = proj4.defs("EPSG:4326");
const proj3857 = proj4.defs("EPSG:3857");

var geometry = {
  type: "Polygon",
  coordinates: [
    [
      proj4(proj3857, proj4326, [259239, 6248476]),
      proj4(proj3857, proj4326, [259266, 6248502]),
      proj4(proj3857, proj4326, [259306, 6248293]),
      proj4(proj3857, proj4326, [259275, 6248267]),
      proj4(proj3857, proj4326, [259239, 6248476])
    ]
  ]
};


result = [];
var feature = turf.feature(geometry);
var options = { units: "kilometers" };
let grid = turf.squareGrid(turf.bbox(feature), 0.0025, options);

//AJOUT NATHAN POUR VENT PSEUDO-REEL LÉGÈREMENT INCLINÉ
let alpha = Math.PI/2

for (let item of grid.features) {
  if (turf.booleanContains(feature, item)) {
    let bbox = turf.bbox(item);
    let x = (bbox[2] + bbox[0]) / 2;
    let y = (bbox[3] + bbox[1]) / 2;

    //AJOUT NATHAN : RANDOMLY PRODUCED DIRECTION
    /*
    let randomDirU = Math.random() < 0.5 ? -1 : 1;
    let randomDirV = Math.random() < 0.5 ? -1 : 1;
    let randomU = randomDirU * Math.random()*5;
    let randomV = randomDirV * Math.random()*5;
    let randomZ = Math.random()*10;
    */

    //AJOUT NATHAN : VENT PSEUDO-RÉEL, LÉGÈREMENT INCLINÉ
    let randomCoef = 2*Math.random() //permet de faire varier la vitesse tout en gardant la même direction
    let dirU = randomCoef * -4*Math.sin(alpha);
    let dirV = randomCoef * 4*Math.cos(alpha);
    alpha -= 5/grid.features.length;
    let Z = Math.random()*80;

    result.push({ lat: y, lon: x, z: Z, u: dirU, v: dirV });
  }
}

console.log(result);
fs.writeFileSync("data/wind.json", JSON.stringify(result));
