import "regenerator-runtime/runtime";
import * as THREE from "three";
import * as d3 from "d3";
import * as d3hexbin from "d3-hexbin";
import Feature from "ol/Feature";
import { VTController } from "./VTController";
import { TempoScale } from "./TempoScale";
import { mergedRender, singleRender } from "./VTThreeViewer";
import { planStyle, grisStyle, muetStyle } from "./OLViewer";
import proj4 from "proj4";
import { proj4326, proj3857 } from "./Utils";
import helvetiker from "../../node_modules/three/examples/fonts/helvetiker_regular.typeface.json";
import Stats from "stats";
import { ConvexGeometry } from "./ConvexGeometry";
import * as Utils from "./Utils";
import { SpatioTemporalCube } from "./STC";

//data can be imported like this or read from the data folder
//import covidData from "../../data/covid_data.json";
//import clusterCovidData from "../../data/clusters100.json";
import covidData from "../../data/covid_data_jacques.json";

import * as geotiff from "geotiff";
import { Vector3, UniformsUtils } from "three";

const width = window.innerWidth; // this makes the 3D canvas full screen
const height = window.innerHeight; // this makes the 3D canvas full screen
const zSize = 300; //Represent the vertical size on the 3D modelisation. Arbitrary value
const nbrDaysMax = 100; //Number of days from the first entry that can be displayed

let raycaster, renderer;
let INTERSECTED;
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

let infoPanel = document.getElementById("infoPanel");
document.addEventListener("pointerdown", clickPosition);
document.addEventListener("pointerup", clickOnMap);

var temposcale = new TempoScale(0, nbrDaysMax);
let params = paramsCovid;
let controller = null;
let covidCaseGroup = null;
let stc = null;
async function init() {
  //create elements for raycasting
  // let container = document.createElement("div");
  // document.body.appendChild(container);
  // raycaster = new THREE.Raycaster();
  // renderer = new THREE.WebGLRenderer();
  // renderer.setPixelRatio(window.devicePixelRatio);
  // renderer.setSize(window.innerWidth, window.innerHeight);
  // container.appendChild(renderer.domElement);

  document.addEventListener("mousemove", onDocumentMouseMove, false);

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

  stc = new SpatioTemporalCube(
    covidData,
    "2020-03-19",
    controller,
    [
      {
        radius: 25,
        daysAggregation: 1,
        startDistance: 0,
        endDistance: 500,
        index: 0
      },
      {
        radius: 25,
        daysAggregation: 1,
        startDistance: 500,
        endDistance: 750,
        index: 1
      },
      {
        radius: 50,
        daysAggregation: 2,
        startDistance: 750,
        endDistance: 1400,
        index: 2
      },
      {
        radius: 100,
        daysAggregation: 5,
        startDistance: 1400,
        endDistance: 5000,
        index: 3
      }
      // { radius: 50, daysAggregation: 2 }
    ],
    infoPanel
  );

  //Adding the covid cases with one cube by entry
  covidCaseGroup = new THREE.Group();
  covidCaseGroup.name = "covidCaseGroup";
  //addObjects(covidCaseGroup);
}

//Track mouse position
function onDocumentMouseMove(event) {
  event.preventDefault();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

/*_________________________ Function creating and filling the groups storing 3D objects _______________________*/

// Adding the covid cases with one cube by entry
function addObjects(covidCaseGroup) {
  for (let covidCase in covidData) {
    let tokenLatLon = [
      parseFloat(covidData[covidCase]["lat"]),
      parseFloat(covidData[covidCase]["lon"])
    ];
    let tokenCenter = proj4(proj4326, proj3857, [
      tokenLatLon[1],
      tokenLatLon[0]
    ]);
    let worldCoords = controller.threeViewer.getWorldCoords(tokenCenter); // the getWorldCoords function transform webmercator coordinates into three js world coordinates
    var geometry = new THREE.BoxBufferGeometry(3, 3, 3);
    var material = new THREE.MeshStandardMaterial({ color: "#C6F499" });
    var cube = new THREE.Mesh(geometry, material); //a three js mesh needs a geometry and a material
    cube.position.x = worldCoords[0];
    cube.position.y = worldCoords[1];
    cube.position.z = dateToAlti(covidData[covidCase]["date"]);
    cube.name = covidData[covidCase]["date"];
    if (cube.position.z >= 0 && cube.position.z <= zSize) {
      //We shox only the entries that are in the temporal boudaries
      cube.visible = true;
    } else {
      cube.visible = false;
    }
    covidCaseGroup.add(cube); // all the cases are added to the group
  }
  controller.threeViewer.scene.add(covidCaseGroup); //the group is added to the scene
}

// Adding the temporal legend
function addTempoScaleLabel(scaleGroup) {
  const loader = new THREE.FontLoader();
  var font = loader.parse(helvetiker);

  var nbrLegends = 6; // Nbr of texts forming the temporal legend
  for (let i = 0; i <= nbrLegends; i++) {
    let date = altiToDate((i * zSize) / nbrLegends);
    const axegeometry = new THREE.TextGeometry(date + "__", {
      font: font,
      size: 16,
      height: 5,
      curveSegments: 50,
      bevelEnabled: false,
      bevelThickness: 5,
      bevelSize: 1,
      bevelOffset: 0,
      bevelSegments: 5
    });

    var axematerial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    var axe = new THREE.Mesh(axegeometry, axematerial); //a three js mesh needs a geometry and a material
    axe.position.x = -1000;
    axe.position.y = -70;
    axe.position.z = (i * zSize) / nbrLegends + 3;
    scaleGroup.add(axe); //all objects have to be added to the threejs scene
  }
  controller.threeViewer.scene.add(scaleGroup); //the group is added to the scene
}

/*_____________________ Initialisation of the 3D modelisation _________________*/

init();

/*_____________________ Managing the temporal scale _________________*/

//Import a gui creating an interface to manage the temporal scale
const dat = require("dat.gui");
const gui = new dat.GUI();

// const cubeFolder = gui.addFolder("Temporal range in days from the 03-19");
// cubeFolder.add(temposcale, "min", 0, nbrDaysMax - 1, 1);
// cubeFolder.add(temposcale, "max", 1, nbrDaysMax, 1);
// cubeFolder.open();

let dates = { min: 0, max: 100, scale: 300 };
let minController = gui.add(dates, "min", 0, 99, 1);
let maxController = gui.add(dates, "max", 1, 100, 1);
let scaleController = gui.add(dates, "scale", 100, 600, 10);
minController.onFinishChange(function(value) {
  stc.setCurrentDates(dates);
});
maxController.onFinishChange(function(value) {
  stc.setCurrentDates(dates);
});
scaleController.onFinishChange(function(value) {
  stc.setTemporalScale(dates.scale);
});

function changeTempoScale() {
  // When we change the temporal zoom, we change the altitude of the covid cases
  for (var elt in controller.threeViewer.scene.children) {
    if (
      controller.threeViewer.scene.children[elt]["name"] == "covidCaseGroup" ||
      controller.threeViewer.scene.children[elt]["name"].startsWith(
        "hexCovidCaseGroup"
      )
    ) {
      for (var groupElt in controller.threeViewer.scene.children[elt]
        .children) {
        //Selecting elements in covidCaseGroup
        let cube =
          controller.threeViewer.scene.children[elt].children[groupElt];
        cube.position.z = dateToAlti(cube.name);
        // Setting the visibility depending of the vertical coordinates
        if (cube.position.z >= 0 && cube.position.z <= zSize) {
          cube.visible = true;
        } else {
          cube.visible = false;
        }
      }
    }
  }
  // When we change the temporal zoom, we clear scaleGroup and recreate the texts
  for (let elt in controller.threeViewer.scene.children) {
    if (controller.threeViewer.scene.children[elt]["name"] == "scaleGroup") {
      controller.threeViewer.scene.children[elt].remove(
        ...controller.threeViewer.scene.children[elt].children
      );
      addTempoScaleLabel(controller.threeViewer.scene.children[elt]);
    }
  }
}

gui.domElement.addEventListener("mouseup", changeTempoScale);

/*_____________________________ Raycasting to select an object ___________________________*/

// Position of the mouse at the begining of an event "pointerdown"
var detaX = 0;
var deltaY = 0;

function clickPosition() {
  detaX = mouse.x;
  deltaY = mouse.y;
}

function clickOnMap(event) {
  stc.click(event);
}

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
