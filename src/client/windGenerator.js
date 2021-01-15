var turf = require("@turf/turf");
var proj4 = require("proj4");
const fs = require("fs");

const proj4326 = proj4.defs("EPSG:4326");
const proj3857 = proj4.defs("EPSG:3857");

var geometryCorridor = {
  type: "Polygon",
  coordinates: [
    [
      proj4(proj3857, proj4326, [259306, 6248165.5]),
      proj4(proj3857, proj4326, [259332.57, 6248166.44]),
      proj4(proj3857, proj4326, [259230.68, 6248724.81]),
      proj4(proj3857, proj4326, [259201.62, 6248706.88]),
    ]
  ]
};

var geometrySky = {
  type: "Polygon",
  coordinates: [
    [
      proj4(proj3857, proj4326, [259200, 6248115.5]),
      proj4(proj3857, proj4326, [259382.57, 6248116.44]),
      proj4(proj3857, proj4326, [259200.68, 6248850.81]),
      proj4(proj3857, proj4326, [259151.62, 6248850.88]),
    ]
  ]
};

result = [];
var options = { units: "kilometers" };

var featureCorridor = turf.feature(geometryCorridor);
let gridCorridor = turf.squareGrid(turf.bbox(featureCorridor), 0.006, options);

var featureSky = turf.feature(geometrySky);
let gridSky = turf.squareGrid(turf.bbox(featureSky), 0.01, options);

//AJOUT NATHAN POUR VENT PSEUDO-REEL LÉGÈREMENT INCLINÉ
let alpha = Math.PI/2
let i = 1

for (let item of gridCorridor.features) {
  if (turf.booleanContains(featureCorridor, item)) {
    let bbox = turf.bbox(item);
    let x = (bbox[2] + bbox[0]) / 2;
    let y = (bbox[3] + bbox[1]) / 2;

    //AJOUT NATHAN : VENT PSEUDO-RÉEL, LÉGÈREMENT INCLINÉ
    //let Z = 5 + Math.random()*50; //on utilise la hauteur pour
    //let Z = 0
    let randomCoef = Math.log10(i);
    //let Z = 5 + i/10*Math.cos(alpha);
    let Z = Math.random()/5;
    //let randomCoef = 3*Math.random() //permet de faire varier la vitesse tout en gardant la même direction, et en fonction de la hauteur (pour l'exemple)
    let dirU = randomCoef * -4*Math.sin(alpha);
    let dirV = randomCoef * 4*Math.cos(alpha);
    //let dirW = randomCoef * 4*Math.cos(1.3*alpha);
    let dirW = 0;
    alpha -= 4/gridCorridor.features.length;

    result.push({ lat: y, lon: x, z: Z, u: dirU, v: dirV, w : dirW});
    i = i + 1
  }
}

alpha = Math.PI/2
i = 0

for (let item of gridSky.features) {
  if (turf.booleanContains(featureSky, item)) {
    let bbox = turf.bbox(item);
    let x = (bbox[2] + bbox[0]) / 2;
    let y = (bbox[3] + bbox[1]) / 2;

    //AJOUT NATHAN : VENT PSEUDO-RÉEL, LÉGÈREMENT INCLINÉ
    //let Z = 5 + Math.random()*50; //on utilise la hauteur pour
    //let Z = 0
    let randomCoef = Math.log10(i);
    //let Z = 5 + i/10*Math.cos(alpha);
    let Z = 60;
    //let randomCoef = 3*Math.random() //permet de faire varier la vitesse tout en gardant la même direction, et en fonction de la hauteur (pour l'exemple)
    let dirU = randomCoef * -4*Math.sin(alpha);
    let dirV = randomCoef * 4*Math.cos(alpha);
    //let dirW = randomCoef * 4*Math.cos(1.3*alpha);
    let dirW = 0;
    alpha -= 4/gridSky.features.length;

    result.push({ lat: y, lon: x, z: Z, u: dirU, v: dirV, w : dirW});
    i = i + 1
  }
}

fs.writeFileSync("data/wind.json", JSON.stringify(result));
