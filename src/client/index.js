import "regenerator-runtime/runtime";
import * as THREE from "three";
import { VTController } from "./VTController";
import { TempoScale } from "./TempoScale";
import { mergedRender, singleRender } from "./VTThreeViewer";
import { planStyle, grisStyle, muetStyle } from "./OLViewer";
import proj4 from "proj4";
import { proj4326, proj3857 } from "./Utils";
import helvetiker from "../../node_modules/three/examples/fonts/helvetiker_regular.typeface.json";
import { SpatioTemporalCube } from "./STC";
import { zoomValuesJacques, zoomValuesMaxime } from "./ZoomValues";
import $ from "jquery";

//data can be imported like this or read from the data folder
//import covidData from "../../data/covid_data.json";
//import clusterCovidData from "../../data/clusters100.json";
import covidDataJacques from "../../data/covid_data_jacques.json";
import covidDataMaxime from "../../data/data_maxime.json";


const width = $('#body2').width(); // this makes the 3D canvas full screen
const height = $('#body2').height(); // this makes the 3D canvas full screen
const zSize = 300; //Represent the vertical size on the 3D modelisation. Arbitrary value
const nbrDaysMax = 100; //Number of days from the first entry that can be displayed

var x = $('#body2').position().left;
var y = $('#body2').position().top;
//console.log(x,y)
/*$(".ac").css("top",0);
$(".ac").css("position", absolute);*/

//$("#canvas").css("left",x);
//$("#canvas").css("top",y);

const mouse = new THREE.Vector2();

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

let paramsJacques = {
  data: covidDataJacques,
  zoomValues: zoomValuesJacques,
  temporalScale: 300
};

let paramsMaxime = {
  data: covidDataMaxime,
  zoomValues: zoomValuesMaxime,
  temporalScale: 50
};

let paramsViz = paramsMaxime;

let infoPanel = document.getElementById("infoPanel");

let params = paramsCovid;
let controller = null;
let covidCaseGroup = null;
let stc = null;
export async function init(attr) {
  if(attr == "data_maxime.json" || attr == "maxime.json"){
    paramsMaxime = {
      data: covidDataMaxime,
      zoomValues: zoomValuesMaxime,
      temporalScale: 50
    };
    paramsViz = paramsMaxime;
    paramsJacques = null;
    controller = new VTController(
      width,
      height,
      params.center, //center coordinates in webmercator
      params.zoom, //= 13, //zoom level
      params.layers, //layers to be rendered as 3D features
      mergedRender, //render type, merged render more efficient but does not provide access to each feature
      params.style, //style for the tiles
      false
    );

    let startDataJacques = "2021/08/16";
    let startDataMaxime = "2021/08/16";
    stc = new SpatioTemporalCube(
      paramsViz.data,
      startDataMaxime,
      controller,
      paramsViz.zoomValues,
      infoPanel,
      paramsViz.temporalScale
    );
    console.log("lancementMaxime");
    console.log(paramsViz);
    
  }else if(attr == "covid_data_jacques.json" || attr=="sample_data.json"){
    paramsJacques = {
      data: covidDataJacques,
      zoomValues: zoomValuesJacques,
      temporalScale: 300
    };
    paramsViz = paramsJacques;
    paramsMaxime = null;
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
  
    let startDataJacques = "2021/08/16";
    let startDataMaxime = "2021/08/16";
    stc = new SpatioTemporalCube(
      paramsViz.data,
      startDataJacques,
      controller,
      paramsViz.zoomValues,
      infoPanel,
      paramsViz.temporalScale
    );
    console.log("lancementJAcques");
    //console.log(paramsViz);
    
  }else{
    return;
  }
}

init("data_maxime.json");

/*_____________________ Managing the temporal scale _________________*/

//Import a gui creating an interface to manage the temporal scale
const dat = require("dat.gui");
const gui = new dat.GUI();

let dates = { min: 0, max: 100, scale: paramsViz.temporalScale };
let minController = gui.add(dates, "min", 0, 99, 1);
let maxController = gui.add(dates, "max", 1, 100, 1);
let scaleController = gui.add(
  dates,
  "scale",
  paramsViz.temporalScale / 2,
  paramsViz.temporalScale * 2,
  10
);
minController.onFinishChange(function(value) {
  stc.setCurrentDates(dates);
});
maxController.onFinishChange(function(value) {
  stc.setCurrentDates(dates);
});
scaleController.onFinishChange(function(value) {
  stc.setTemporalScale(dates.scale);
});

/*_____________________________ rendering funciton ___________________________*/
function render() {
  controller.threeViewer.animate();

  // Updating the rotation of texts to make them facing the user

  // Updating the agregation level depending of the zoom level
  let dist = Math.sqrt(
    controller.threeViewer.currentCamera.position.x ** 2 +
      controller.threeViewer.currentCamera.position.y ** 2 +
      controller.threeViewer.currentCamera.position.z ** 2
  );

  stc.render(dist);
  // The render() function is called at eatch frame
  requestAnimationFrame(render);
}

render();
