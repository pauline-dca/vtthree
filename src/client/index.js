import "regenerator-runtime/runtime";
import * as THREE from "three";
import Feature from "ol/Feature";
import { VTController } from "./VTController";
import { TempoScale } from "./TempoScale";
import { mergedRender, singleRender } from "./VTThreeViewer";
import { planStyle, grisStyle, muetStyle } from "./OLViewer";
import proj4 from "proj4";
import { proj4326, proj3857 } from "./Utils";
import helvetiker from "../../node_modules/three/examples/fonts/helvetiker_regular.typeface.json"

//data can be imported like this or read from the data folder
import windData from "../../data/wind.json";
import covidData from "../../data/covid_data.json";
import * as geotiff from "geotiff";

const width = window.innerWidth; // this makes the 3D canvas full screen
const height = window.innerHeight; // this makes the 3D canvas full screen

let parisLatLon = [48.8534, 2.3488];
let parisCenter = proj4(proj4326, proj3857, [parisLatLon[1], parisLatLon[0]]);

let vavinLatLon = [48.8425824, 2.3275981];
let vavinCenter = proj4(proj4326, proj3857, [vavinLatLon[1], vavinLatLon[0]]);

const paramsCovid = {
  center: parisCenter,
  zoom: 12,
  layers: [],
  style: planStyle
};

const paramsWind = {
  center: vavinCenter,
  zoom: 18,
  layers: ["bati_surf", "bati_zai"],
  style: muetStyle
};

var temposcale = new TempoScale(0,100);
let params = paramsCovid;
let controller = null;
async function init() {
  // to read tiff file: https://geotiffjs.github.io/geotiff.js/. other files to be read should be added to the data folder
  // let tiffData = await geotiff.fromUrl("Hauteurs.tif");

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

  //Ajout des objects
  addObjects();

  //Ajout d'une echelle temporelle
  addTempoScaleLabel();
  
}

function dateToAlti(date){
  let firstDate = Number(new Date(covidData[0]["date"]))/86400000; //jour du premier cas
  let days = Number(new Date(date))/86400000 - firstDate; //jours depuis le premier cas
  return (days-temposcale.min)*(300/(temposcale.max-temposcale.min)) //on etalle l'echelle des z selon l'emprise
}

function altiToDate(z){
  let days = z*((temposcale.max-temposcale.min)/300)+temposcale.min; //jours depuis le premier cas
  let firstDate = Number(new Date(covidData[0]["date"]))/86400000; //jour du premier cas
  return (new Date((days+firstDate)*86400000)).toISOString().slice(0, 10) 
}


const scaleGroup = new THREE.Group();
scaleGroup.name = "scaleGroup";

function addTempoScaleLabel(){
  
  const loader = new THREE.FontLoader();
  var font = loader.parse(helvetiker);
    
  var nbrLegendes = 6;
  // ["2020-03-19", "2020-04-01", "2020-05-01", "2020-06-01"]


  for (let i=0; i<=nbrLegendes; i++){
    let date = altiToDate(i*300/nbrLegendes);
    const axegeometry = new THREE.TextGeometry( date+'__', {
      font: font,
      size: 10,
      height: 5,
      curveSegments: 50,
      bevelEnabled: false,
      bevelThickness: 5,
      bevelSize: 1,
      bevelOffset: 0,
      bevelSegments: 5
    } );

  var axematerial = new THREE.MeshStandardMaterial({ color: 0x000000 });
  var axe = new THREE.Mesh(axegeometry, axematerial); //a three js mesh needs a geometry and a material
  axe.position.x = -350;
  axe.position.y = 0;
  axe.position.z = i*300/nbrLegendes+3;
  scaleGroup.add(axe); //all objects have to be added to the threejs scene
    
  }
  controller.threeViewer.scene.add(scaleGroup); //the group is added to the scene

}

const covidCaseGroup = new THREE.Group();
covidCaseGroup.name = "covidCaseGroup";

function addObjects() {
  for (let covidCase in covidData){
    
      //example to add an object to the scene
      let tokenLatLon = [
        parseFloat(covidData[covidCase]["lat"]),
        parseFloat(covidData[covidCase]["lon"])
      ];
      let tokenCenter = proj4(proj4326, proj3857, [
        tokenLatLon[1],
        tokenLatLon[0]
      ]);
      let worldCoords = controller.threeViewer.getWorldCoords(tokenCenter); // the getWorldCoords function transform webmercator coordinates into three js world coordinates
      var geometry = new THREE.BoxBufferGeometry(5, 5, 5);
      var material = new THREE.MeshStandardMaterial({ color: 0xff4500 });
      var cube = new THREE.Mesh(geometry, material); //a three js mesh needs a geometry and a material
      cube.position.x = worldCoords[0];
      cube.position.y = worldCoords[1];
      cube.position.z = dateToAlti(covidData[covidCase]["date"]);
      cube.name = covidData[covidCase]["date"];
      covidCaseGroup.add(cube); // all the cases are added to the group
    
  }
  controller.threeViewer.scene.add(covidCaseGroup); //the group is added to the scene
}

init();

//Import d'un gui pour gerer l'echelle temporelle.
const dat = require("dat.gui");
const gui = new dat.GUI();


const cubeFolder = gui.addFolder("Plage temporelle en jour depuis le 03-19")
cubeFolder.add(temposcale, 'min', 0, 99, 1)
cubeFolder.add(temposcale, 'max', 1, 100, 1)
cubeFolder.open()


function changeTempoScale(){
  for(var groupElt in controller.threeViewer.scene.children[2].children){ //Selection des elements dans covidCaseGroup
    controller.threeViewer.scene.children[2].children[groupElt].position.z = dateToAlti(controller.threeViewer.scene.children[2].children[groupElt].name);
    
    if(controller.threeViewer.scene.children[2].children[groupElt].position.z>=0 && controller.threeViewer.scene.children[2].children[groupElt].position.z<=300){
      controller.threeViewer.scene.children[2].children[groupElt].visible = true;
    }
    else{
      controller.threeViewer.scene.children[2].children[groupElt].visible = false;
    }
  }

  controller.threeViewer.scene.children[3].remove(...controller.threeViewer.scene.children[3].children);
  addTempoScaleLabel();
  
  
}


gui.domElement.addEventListener("mouseup", changeTempoScale);

function render(){
  controller.threeViewer.animate();
  // Actualisation de la rotation de la legende pour qu'elle fasse face à l'utilisateur
  for(var groupElt in controller.threeViewer.scene.children[3].children){
    controller.threeViewer.scene.children[3].children[groupElt].quaternion.copy(controller.threeViewer.currentCamera.quaternion);
  }
  

  requestAnimationFrame(render);
};

render();
