// ---------------------------------------------------------------------------------------------------- //


/* Note :

If anything is to be modified in this file, such as the number of scales, the alpha angle etc... it
is likely that nothing would be coherent anymore. It would be working, but hard to visualise.
It required a lot of manual tweaking.

- "u" represents the speed in X
- "v" in Y
- "w" in Z

*/

var turf = require("@turf/turf");
var proj4 = require("proj4");
const fs = require("fs");

// To compute quantiles easily (finally useless)
//var quantiles = require( 'compute-quantiles' );
const { point } = require("@turf/turf");

const proj4326 = proj4.defs("EPSG:4326");
const proj3857 = proj4.defs("EPSG:3857");

// Extent for the street flows
var geometryCorridor = {
  type: "Polygon",
  coordinates: [
    [
      proj4(proj3857, proj4326, [259296, 6248165.5]),
      proj4(proj3857, proj4326, [259332.57, 6248166.44]),
      proj4(proj3857, proj4326, [259230.68, 6248724.81]),
      proj4(proj3857, proj4326, [259191.62, 6248706.88]),
    ]
  ]
};

// Extent for the sky flows
var geometrySky = {
  type: "Polygon",
  coordinates: [
    [
      proj4(proj3857, proj4326, [258500, 6247500.5]),
      proj4(proj3857, proj4326, [259900.57, 6247500.44]),
      proj4(proj3857, proj4326, [259900.68, 6249200.81]),
      proj4(proj3857, proj4326, [258500.62, 6249200.88]),
    ]
  ]
};

// ---------------------------------------------------------------------------------------------------- //

// "result" will contain the final objects to produce the JSON
result = [];
var options = { units: "kilometers" };

var nbScale = 3 //number of different scales (arbitrary)

for (var j = 1; j < nbScale + 1; j++){

  var modifier = 2**(j - 1); //the higher the scale number, the bigger the flows
  var featureCorridor = turf.feature(geometryCorridor);
  let gridCorridor = turf.squareGrid(turf.bbox(featureCorridor), 0.006*modifier, options); // 0.006 is arbitrary, not to have too much or too less flows.
  // It is advised not to reduce this 0.006 to prevent huge number of flows at low scale.

  var featureSky = turf.feature(geometrySky);
  let gridSky = turf.squareGrid(turf.bbox(featureSky), 0.01*modifier, options);

  //initial angle from the Y axis (anticlockwise direction)
  let alpha = Math.PI/16;
  var lstVit = []; //useful for relative sizes computing

  // LOOP FOR STREET FLOWS
  for (let item of gridCorridor.features) {
    if (turf.booleanContains(featureCorridor, item)) {
      let bbox = turf.bbox(item);
      let x = (bbox[2] + bbox[0]) / 2;
      let y = (bbox[3] + bbox[1]) / 2;

      // random aspect of the flows
      let randomCoef = modifier;

      // constant Z in the street
      let Z = 15;

      let dirU = randomCoef * -4*Math.sin(alpha);
      let dirV = randomCoef * 4*Math.cos(alpha);

      // no Z speed
      let dirW = 0;

      lstVit.push(Math.sqrt(dirU**2 + dirV**2 + dirW**2));
      result.push({ lat: y, lon: x, z: Z, u: dirU, v: dirV, w : dirW});
    }
  }

  // initial angle for sky flows
  alpha = Math.PI/2;

  //lowest height for sky flows
  var finalZ = 60;

  //LOOP FOR SKY FLOWS
  for (let item of gridSky.features) {
    if (turf.booleanContains(featureSky, item)) {
      let bbox = turf.bbox(item);
      let x = (bbox[2] + bbox[0]) / 2;
      let y = (bbox[3] + bbox[1]) / 2;

      let randomCoef = modifier*(Math.random() + 0.2);
      let dirU = randomCoef * -4*Math.sin(alpha);
      let dirV = randomCoef * 4*Math.cos(alpha);

      //here for the demo, Z = f(u), meaning altitude varies depending on the speed in X. This is unreal, but it creates these pretty waves
      //the formula are a bit complicated and arbitrary but work quite well in this particular case
      if (Math.abs(dirU)/Math.abs(dirV) >= 0){
        if (dirU < 0){
          var Z = Math.max(finalZ, finalZ + 200*Math.log(Math.abs(dirU)/(Math.abs(dirV) + Math.log((Math.abs(dirU)/(Math.abs(dirV)))))));
        }
        else{
          var Z = Math.max(finalZ, finalZ + 50*Math.log(Math.abs(dirU)/(Math.abs(dirV) + Math.log((Math.abs(dirU)/(Math.abs(dirV)))))));
        }
        if (Math.abs(dirV) < 1 || Z == finalZ){
          var dirW = 0
        }
        else if (dirV >= 1){
          var dirW = Math.sqrt(dirU**2 + dirV**2)/2;
        }
        else{
         var dirW = -Math.sqrt(dirU**2 + dirV**2)/2;
        }
      }
      else{
        var Z = finalZ + Math.abs(dirU);
        var dirW = Math.abs(dirU);
      }

      alpha -= 6*j/gridSky.features.length/j;
      lstVit.push(Math.sqrt(dirU**2 + dirV**2 + dirW**2));
      result.push({ lat: y, lon: x, z: Z, u: dirU, v: dirV, w : dirW});
    }
  }

  //var quant = quantiles(lstVit, 3); -> USEFUL FOR USING QUANTILES IN ORDER TO GIVE COLORS (LET ASIDE CURRENTLY)
  var max = Math.max(...lstVit);
  for (i = 0; i < lstVit.length; i++){
    var elem = lstVit[i];
    var p = result[i];
    p.rg = elem/max;
  }

  //Finally writing the JSON and emptying the result array
  fs.writeFileSync("data/wind" + j + ".json", JSON.stringify(result)); // le + j permet de différencier les fichiers suivant les échelles de visualisation
  result = [];
}
