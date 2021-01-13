var turf = require("@turf/turf");
var proj4 = require("proj4");
const fs = require("fs");

const proj4326 = proj4.defs("EPSG:4326");
const proj3857 = proj4.defs("EPSG:3857");

var geometry = {
  type: "Polygon",
  coordinates: [
    [
      proj4(proj3857, proj4326, [259000, 6248700]),
      proj4(proj3857, proj4326, [259000, 6248100]),
      proj4(proj3857, proj4326, [259500, 6248100]),
      proj4(proj3857, proj4326, [259500, 6248700]),
    ]
  ]
};


result = [];
var feature = turf.feature(geometry);
var options = { units: "kilometers" };
let grid = turf.squareGrid(turf.bbox(feature), 0.01, options);
console.log(grid.features)

//AJOUT NATHAN POUR VENT PSEUDO-REEL LÉGÈREMENT INCLINÉ
let alpha = Math.PI/2
let i = 1

for (let item of grid.features) {
  if (turf.booleanContains(feature, item)) {
    let bbox = turf.bbox(item);
    let x = (bbox[2] + bbox[0]) / 2;
    let y = (bbox[3] + bbox[1]) / 2;

    //AJOUT NATHAN : VENT PSEUDO-RÉEL, LÉGÈREMENT INCLINÉ
    //let Z = 5 + Math.random()*50; //on utilise la hauteur pour
    //let Z = 0
    let randomCoef = Math.log10(i);
    let Z = 20 + i/10*Math.cos(alpha);
    //let randomCoef = 3*Math.random() //permet de faire varier la vitesse tout en gardant la même direction, et en fonction de la hauteur (pour l'exemple)
    let dirU = randomCoef * -4*Math.sin(alpha);
    let dirV = randomCoef * 4*Math.cos(alpha);
    let dirW = randomCoef * 4*Math.cos(1.3*alpha);
    alpha -= 4/grid.features.length;

    result.push({ lat: y, lon: x, z: Z, u: dirU, v: dirV, w : dirW});
    i = i + 1
  }
}

fs.writeFileSync("data/wind.json", JSON.stringify(result));
