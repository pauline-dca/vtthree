import "regenerator-runtime/runtime";
import * as THREE from "three";
import Feature from "ol/Feature";
import { VTController } from "./VTController";
import { mergedRender, singleRender } from "./VTThreeViewer";
import { planStyle, grisStyle, muetStyle } from "./OLViewer";
import proj4 from "proj4";
import { proj4326, proj3857, proj2154 } from "./Utils";

//data can be imported like this or read from the data folder
import * as geotiff from "geotiff";

const width = window.innerWidth; // this makes the 3D canvas full screen
const height = window.innerHeight; // this makes the 3D canvas full screen

// Transform into Web Mercator coordinates
let coordsAles = [4.08, 44.13]
let alesCenter = proj4(proj4326, proj3857, [coordsAles[0], coordsAles[1]]);

// const paramsWind = {
//   center: vavinCenter,
//   zoom: 18,
//   layers: ["bati_surf", "bati_zai"],
//   style: muetStyle
// };

const paramsFlood = {
  center: alesCenter,
  zoom: 14,
  layers: [],
  style: planStyle
};

let params = paramsFlood;
let controller = null;

async function init() {
  // to read tiff file: https://geotiffjs.github.io/geotiff.js/
  // other files to be read should be added to the data folder

  // l'image s'affiche sur la carte au niveau des Prés-Saint-Jean
  let tiffHauteurs = await geotiff.fromUrl("decoupe_hauteurs_max.tif");


  const imageHauteurs = await tiffHauteurs.getImage();

  const widthImg = imageHauteurs.getWidth();
  const heightImg = imageHauteurs.getHeight();
  console.log(widthImg, heightImg);

  const [data] = await imageHauteurs.readRasters();

  const texture = new THREE.DataTexture(
    data,
    widthImg,
    heightImg,
    THREE.LuminanceFormat,
    // THREE.UnsignedByteType
    THREE.FloatType
  );
  texture.needsUpdate = true;

  controller = new VTController(
    width,
    height,
    params.center, //center coordinates in webmercator
    params.zoom, //zoom level
    params.layers, //layers to be rendered as 3D features
    mergedRender, //render type, merged render more efficient but does not provide access to each feature
    params.style, //style for the tiles
    false
  );
  addObjects(texture);
}

function addObjects(texture) {
  //example to add an object to the scene
  // let worldCoords = controller.threeViewer.getWorldCoords(alesCenter);
  // var geometry = new THREE.BoxBufferGeometry(100, 100, 100);
  //var material = new THREE.MeshStandardMaterial({  });
  // var cube = new THREE.Mesh(geometry, material);
  // cube.position.x = worldCoords[0];
  // cube.position.y = worldCoords[1];
  // cube.position.z = 0;
  // controller.threeViewer.scene.add(cube);


  // the getWorldCoords function transform webmercator coordinates into three js world coordinates
  let worldCoords = controller.threeViewer.getWorldCoords(alesCenter);

  //a three js mesh needs a geometry and a material
  const geometry = new THREE.PlaneBufferGeometry(17, 12, 32);
  var material = new THREE.MeshBasicMaterial({ map: texture });

  var cube = new THREE.Mesh(geometry, material);

  cube.position.x = worldCoords[0];
  cube.position.y = worldCoords[1];
  cube.position.z = 0;
  controller.threeViewer.scene.add(cube); //all objects have to be added to the threejs scene`
}

init();
