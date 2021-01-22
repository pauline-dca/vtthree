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

//data can be imported like this or read from the data folder
import covidData from "../../data/covid_data.json";
import clusterCovidData from "../../data/clusters100.json";

import * as geotiff from "geotiff";
import { Vector3 } from "three";

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

var temposcale = new TempoScale(0, nbrDaysMax);
let params = paramsCovid;
let controller = null;
async function init() {
  //create elements for raycasting
  let container = document.createElement("div");
  document.body.appendChild(container);
  raycaster = new THREE.Raycaster();
  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
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

  //Adding the covid cases with one cube by entry
  const covidCaseGroup = new THREE.Group();
  covidCaseGroup.name = "covidCaseGroup";
  addObjects(covidCaseGroup);
  
  //Adding the covid cases aggregated on a hexgrid
  var hexRadius = 25; //Spatial resolution of the hexgrid
  var nbrDaysAgregation = 1; //Temporal resolution
  var coeffRadius = 4; //Arbitrary coefficient influencing on the cylinder radius
  const hexCovidCaseGroup2 = new THREE.Group();
  hexCovidCaseGroup2.name = "hexCovidCaseGroup2";
  hexAgregation(hexCovidCaseGroup2, hexRadius, nbrDaysAgregation, coeffRadius);

  const hexCovidCaseGroup3 = new THREE.Group();
  hexCovidCaseGroup3.name = "hexCovidCaseGroup3";
  hexAgregation(hexCovidCaseGroup3, 35, 4, coeffRadius);

  const hexCovidCaseGroup4 = new THREE.Group();
  hexCovidCaseGroup4.name = "hexCovidCaseGroup4";
  hexAgregation(hexCovidCaseGroup4, 50, 7, coeffRadius);

  //Adding the temporal legend
  const scaleGroup = new THREE.Group();
  scaleGroup.name = "scaleGroup";
  addTempoScaleLabel(scaleGroup);

  //Adding the clusters
  const clustersGroup = new THREE.Group();
  clustersGroup.name = "clustersGroup";
  addClusters(clustersGroup);
}

//Track mouse position
function onDocumentMouseMove(event) {
  event.preventDefault();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

// Functions to switch between date and vertical coordinates
function dateToAlti(date) {
  let firstDate = Number(new Date(covidData[0]["date"])) / 86400000; //day of the firt entry
  let days = Number(new Date(date)) / 86400000 - firstDate; //days from the fisrt entry
  return (days - temposcale.min) * (zSize / (temposcale.max - temposcale.min)); //spreading the coordinates
}

function altiToDate(z) {
  let days = z * ((temposcale.max - temposcale.min) / zSize) + temposcale.min; //days from the fisrt entry
  let firstDate = Number(new Date(covidData[0]["date"])) / 86400000; //day of the firt entry
  return new Date((days + firstDate) * 86400000).toISOString().slice(0, 10);
}

// Restructuring the data with a row by date
function dataByDate() {
  var covidDataDate = new Array();
  for (let elt in covidData) {
    let data = [];
    let tokenLatLon = [
      parseFloat(covidData[elt]["lat"]),
      parseFloat(covidData[elt]["lon"])
    ];
    let tokenCenter = proj4(proj4326, proj3857, [
      tokenLatLon[1],
      tokenLatLon[0]
    ]);
    let worldCoords = controller.threeViewer.getWorldCoords(tokenCenter);
    data["x"] = worldCoords[0];
    data["y"] = worldCoords[1];
    data["datapoint"] = 1; //value used by the algorithm making the hexogrid
    data["name"] = covidData[elt]["date"];
    if (typeof covidDataDate[covidData[elt]["date"]] == "undefined") {
      covidDataDate[covidData[elt]["date"]] = [data];
    } else {
      covidDataDate[covidData[elt]["date"]].push(data);
    }
  }
  return covidDataDate;
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
    var geometry = new THREE.BoxBufferGeometry(5, 5, 5);
    var material = new THREE.MeshStandardMaterial({ color: "#C6F499" });
    var cube = new THREE.Mesh(geometry, material); //a three js mesh needs a geometry and a material
    cube.position.x = worldCoords[0];
    cube.position.y = worldCoords[1];
    cube.position.z = dateToAlti(covidData[covidCase]["date"]);
    cube.name = covidData[covidCase]["date"];
    if (cube.position.z >= 0 && cube.position.z <= zSize) { //We shox only the entries that are in the temporal boudaries
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
      size: 10,
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
    axe.position.x = -350;
    axe.position.y = -70;
    axe.position.z = (i * zSize) / nbrLegends + 3;
    scaleGroup.add(axe); //all objects have to be added to the threejs scene
  }
  controller.threeViewer.scene.add(scaleGroup); //the group is added to the scene
}

// Adding the clusters
function addClusters(clustersGroup) {
  let vectorArray;
  let pointsCloud;
  for (let clusters in clusterCovidData) {
    vectorArray = []; //Will contain the points forming the cluster
    pointsCloud = clusterCovidData[clusters]["cluster"];
    for (let clusterPoint in pointsCloud) {
      //Creation of the point cloud
      let tokenLatLon = [
        parseFloat(pointsCloud[clusterPoint][1]),
        parseFloat(pointsCloud[clusterPoint][0])
      ];
      let tokenCenter = proj4(proj4326, proj3857, [
        tokenLatLon[1],
        tokenLatLon[0]
      ]);
      let worldCoords = controller.threeViewer.getWorldCoords(tokenCenter); // the getWorldCoords function transform webmercator coordinates into three js world coordinates
      vectorArray.push(
        new Vector3(
          worldCoords[0],
          worldCoords[1],
          (pointsCloud[clusterPoint][2] - temposcale.min) * (zSize / (temposcale.max - temposcale.min))
        )
      );
    }

    var geometry = new ConvexGeometry(vectorArray);
    var material = new THREE.MeshStandardMaterial({ color: 0xff4500 });
    material.transparent = true;
    material.opacity = 0.5;
    var cluster = new THREE.Mesh(geometry, material); //a three js mesh needs a geometry and a material
    clustersGroup.add(cluster); // all the cases are added to the group
  }
  controller.threeViewer.scene.add(clustersGroup); //the group is added to the scene
}

/*_____________________ Code adapted from https://www.datavis.fr/index.php?page=map-hexgrid tutorial_________________*/
/*_____________________ Aggregation of covid cases on a grid of hexagons ____________________________________________*/

function hexAgregation(
  hexCovidCaseGroup,
  hexRadius = 50,
  nbrDaysAgregation = 7,
  coeffRadius = 2
) {
  var hexbin, colorScale, maxDatapoints;
  //Setting the position of the centers of the hexogrid
  function getPointGrid(radius) {
    var hexDistance = radius * 1.5;
    var cols = width / hexDistance;

    var rows = Math.floor(height / hexDistance);

    return d3.range(rows * cols).map(function(i) {
      return {
        x: (i % cols) * hexDistance - (hexDistance * cols) / 2,
        y: Math.floor(i / cols) * hexDistance - (hexDistance * rows) / 2,
        datapoint: 0
      };
    });
  }

  //creation of the hexagons
  function getHexPoints(mergedPoints) {
    hexbin = d3hexbin
      .hexbin()
      .radius(hexRadius)
      .x(function(d) {
        return d.x;
      })
      .y(function(d) {
        return d.y;
      });

    var hexPoints = hexbin(mergedPoints);
    return hexPoints;
  }

  //Cleaning and enriching hexagons
  function rollupHexPoints(data) {
    maxDatapoints = 0;

    data.forEach(function(el) {
      for (var i = el.length - 1; i >= 0; --i) {
        if (el[i].datapoint === 0) {
          el.splice(i, 1);
        }
      }

      var datapoints = 0,
        cities = [];

      el.forEach(function(elt, i) {
        datapoints += elt.datapoint;
        cities.push({ name: elt.name });
      });

      el.datapoints = datapoints;
      el.cities = cities;

      maxDatapoints = Math.max(maxDatapoints, datapoints);
    });

    colorScale = d3
      .scaleSequential(d3.interpolateViridis)
      .domain([maxDatapoints, 1]);

    return data;
  }

  //Creating the color gradien
  function colorFunction(nbrCovid) {
    let grad = [
      "#C6F499",
      "#A0EF7D",
      "#73EA62",
      "#48E352",
      "#2FDC5A",
      "#27C36F"
    ];
    for (let i = 0; i < boudaries.length - 1; i++) {
      if (nbrCovid >= boudaries[i] && nbrCovid < boudaries[i + 1]) {
        return grad[i];
      }
    }
    return grad[boudaries.length - 1];
  }

  //Boudaries of the color gradien, each zoom level have its own boudaries
  let boudaries;
  function setBoudaries(hexData){
    let maxBoudaries = 0;
    for (let hexDataDate in hexData) {
      for (let hexCovidCase in hexData[hexDataDate]) {
        let firstDate = Number(new Date(covidData[0]["date"])) / 86400000; //day of the firt entry
        let actualDate = Number(new Date(hexDataDate)) / 86400000;
        let date = Number(new Date(actualDate - firstDate)) / 86400000; //number of days since the first entry
        if (
          (date * 86400000) % nbrDaysAgregation < 0.001 &&
          (date * 86400000) % nbrDaysAgregation > -0.001
        )
          var nbrCovid = temporalAggregation(
            hexCovidCase,
            hexData,
            hexDataDate
          );
        if (nbrCovid != 0 && nbrCovid > maxBoudaries) {
          maxBoudaries = nbrCovid 
        }
      }
    }
    //Discretization of equal amplitude
    boudaries = [1, Math.floor(maxBoudaries*1/6), Math.floor(maxBoudaries*2/6), Math.floor(maxBoudaries*3/6), Math.floor(maxBoudaries*4/6), Math.floor(maxBoudaries*5/6)];
  };


  // Adding the covid cases aggregated on a hexgrid
  function addHexCovidCases(hexCovidCaseGroup) {
    var databyDate = dataByDate();
    var pointGrid = getPointGrid(hexRadius);
    var hexData = hexDatabyDate(databyDate, pointGrid);
    setBoudaries(hexData);
    for (let hexDataDate in hexData) {
      for (let hexCovidCase in hexData[hexDataDate]) {
        let firstDate = Number(new Date(covidData[0]["date"])) / 86400000; //day of the firt entry
        let actualDate = Number(new Date(hexDataDate)) / 86400000;
        let date = Number(new Date(actualDate - firstDate)) / 86400000; //number of days since the first entry
        if (
          (date * 86400000) % nbrDaysAgregation < 0.001 &&
          (date * 86400000) % nbrDaysAgregation > -0.001
        )
          var nbrCovid = temporalAggregation(
            hexCovidCase,
            hexData,
            hexDataDate
          );
        if (nbrCovid != 0) {
          var geometry = new THREE.CylinderBufferGeometry(
            Math.sqrt(nbrCovid) * coeffRadius,
            Math.sqrt(nbrCovid) * coeffRadius,
            5 + nbrDaysAgregation
          ); // Area proportional to the number of covid entries, arbitrary height 
          var colorMesh = colorFunction(nbrCovid);
          var material = new THREE.MeshStandardMaterial({ color: colorMesh });
          var cylinder = new THREE.Mesh(geometry, material); //a three js mesh needs a geometry and a material
          cylinder.position.x = hexData[hexDataDate][hexCovidCase]["x"];
          cylinder.position.y = hexData[hexDataDate][hexCovidCase]["y"];
          cylinder.position.z = dateToAlti(hexDataDate);
          cylinder.name = hexDataDate;
          cylinder.rotation.x = Math.PI / 2;
          if (cylinder.position.z >= 0 && cylinder.position.z <= zSize) {
            cylinder.visible = true;
          } else {
            cylinder.visible = false;
          }
          hexCovidCaseGroup.add(cylinder); // all the cases are added to the group
        }
      }
    }
    controller.threeViewer.scene.add(hexCovidCaseGroup); //the group is added to the scene
  }

  function hexDatabyDate(databyDate, pointGrid) {
    // Gather the data on the hexgrid sorted by dates
    var hexDataDate = new Array();
    for (let dataOneDate in databyDate) {
      var mergedPoints = pointGrid.concat(databyDate[dataOneDate]);
      var hexPoint = getHexPoints(mergedPoints); //creation of the hexagons
      var hexData = rollupHexPoints(hexPoint); //Cleaning and enriching hexagons
      hexDataDate[dataOneDate] = hexData;
    }
    return hexDataDate;
  }

  function temporalAggregation(hexCovidCase, hexData, hexDataDate) {
    //Return the number of case on a same location during some days
    let nbrCovid = 0;
    let firstDate = Number(new Date(covidData[0]["date"])) / 86400000; //day of the firt entry
    let actualDate = Number(new Date(hexDataDate)) / 86400000;
    let date = Number(new Date(actualDate - firstDate)) / 86400000; //number of days since the first entry
    for (let i = 0; i < nbrDaysAgregation; i++) {
      //We gather all entry in the temporal resolution
      let dateI = new Date((actualDate + i) * 86400000)
        .toISOString()
        .slice(0, 10); //Date of hexDataDate + i
      if (hexData[dateI] != undefined) {
        for (let hexcovidcase in hexData[dateI]) {
          if (hexCovidCase == hexcovidcase) {
            nbrCovid += hexData[dateI][hexCovidCase]["length"];
          }
        }
      }
    }

    return nbrCovid;
  }

  addHexCovidCases(hexCovidCaseGroup);
}

/*_____________________ Initialisation of the 3D modelisation _________________*/

init();

/*_____________________ Managing the temporal scale _________________*/

//Import a gui creating an interface to manage the temporal scale
const dat = require("dat.gui");
const gui = new dat.GUI();

const cubeFolder = gui.addFolder("Temporal range in days from the 03-19");
cubeFolder.add(temposcale, "min", 0, nbrDaysMax - 1, 1);
cubeFolder.add(temposcale, "max", 1, nbrDaysMax, 1);
cubeFolder.open();

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

function agregZoom(zoomLevel) {
  // Updating the agregation level depending of the zoom level by changing the group visibility
  for (let elt in controller.threeViewer.scene.children) {
    if (
      controller.threeViewer.scene.children[elt]["name"] == "covidCaseGroup"
    ) {
      if (zoomLevel == 1) {
        controller.threeViewer.scene.children[elt].visible = true;
      } else {
        controller.threeViewer.scene.children[elt].visible = false;
      }
    }

    if (
      controller.threeViewer.scene.children[elt]["name"] == "hexCovidCaseGroup2"
    ) {
      if (zoomLevel == 2) {
        controller.threeViewer.scene.children[elt].visible = true;
      } else {
        controller.threeViewer.scene.children[elt].visible = false;
      }
    }

    if (
      controller.threeViewer.scene.children[elt]["name"] == "hexCovidCaseGroup3"
    ) {
      if (zoomLevel == 3) {
        controller.threeViewer.scene.children[elt].visible = true;
      } else {
        controller.threeViewer.scene.children[elt].visible = false;
      }
    }

    if (
      controller.threeViewer.scene.children[elt]["name"] == "hexCovidCaseGroup4"
    ) {
      if (zoomLevel == 4) {
        controller.threeViewer.scene.children[elt].visible = true;
      } else {
        controller.threeViewer.scene.children[elt].visible = false;
      }
    }
  }
}


var currentZoom = 3; //Zoom of the initial position of the camera
agregZoom(currentZoom);

/*_____________________________ Raycasting to select an object ___________________________*/

//Getting the intersection only in the group displayed
function raycasterIntersect(raycaster, currentZoom) {
  for (let elt in controller.threeViewer.scene.children) {
    if (
      controller.threeViewer.scene.children[elt]["name"] == "covidCaseGroup" &&
      currentZoom == 1
    ) {
      return raycaster.intersectObjects(
        controller.threeViewer.scene.children[elt].children
      );
    } else if (
      controller.threeViewer.scene.children[elt]["name"] ==
        "hexCovidCaseGroup2" &&
      currentZoom == 2
    ) {
      return raycaster.intersectObjects(
        controller.threeViewer.scene.children[elt].children
      );
    } else if (
      controller.threeViewer.scene.children[elt]["name"] ==
        "hexCovidCaseGroup3" &&
      currentZoom == 3
    ) {
      return raycaster.intersectObjects(
        controller.threeViewer.scene.children[elt].children
      );
    } else if (
      controller.threeViewer.scene.children[elt]["name"] ==
        "hexCovidCaseGroup4" &&
      currentZoom == 4
    ) {
      return raycaster.intersectObjects(
        controller.threeViewer.scene.children[elt].children
      );
    }
  }
}

// Position of the mouse at the begining of an event "pointerdown"
var detaX = 0;
var deltaY = 0;

function clickPosition() {
  detaX = mouse.x;
  deltaY = mouse.y;
}

function clickOnMap() {
  let distClick =
    detaX -
    ((event.clientX / window.innerWidth) * 2 - 1) +
    deltaY -
    (-(event.clientY / window.innerHeight) * 2 + 1);
  if (Math.abs(distClick) < 0.01) {
    // we select the object only when not doing a rotation
    raycaster.setFromCamera(mouse, controller.threeViewer.currentCamera);
    const intersects = raycasterIntersect(raycaster, currentZoom);
    if (intersects.length > 0) {
      if (INTERSECTED != intersects[0].object) {
        if (INTERSECTED)
          INTERSECTED.material.emissive.setHex(INTERSECTED.currentHex);
        INTERSECTED = intersects[0].object;
        INTERSECTED.currentHex = INTERSECTED.material.emissive.getHex();
        INTERSECTED.material.emissive.setHex(0xff0000);
        //Display informations about the object
        infoPannel.innerHTML = "Date : " + INTERSECTED["name"];
        infoPannel.style.left = event.clientX + 20 + "px";
        infoPannel.style.top = event.clientY - 5 + "px";
        infoPannel.style.visibility = "visible";
      }
    } else {
      if (INTERSECTED)
        INTERSECTED.material.emissive.setHex(INTERSECTED.currentHex);
      INTERSECTED = null;
      infoPannel.style.visibility = "hidden";
    }
  }
}

let infoPannel = document.getElementById("infoPannel");
document.addEventListener("pointerdown", clickPosition);
document.addEventListener("pointerup", clickOnMap);

/*_____________________________ rendering funciton ___________________________*/
function render() {
  controller.threeViewer.animate();
  // Updating the rotation of texts to make them facing the user
  for (let elt in controller.threeViewer.scene.children) {
    if (controller.threeViewer.scene.children[elt]["name"] == "scaleGroup") {
      for (var groupElt in controller.threeViewer.scene.children[elt]
        .children) {
        controller.threeViewer.scene.children[elt].children[
          groupElt
        ].quaternion.copy(controller.threeViewer.currentCamera.quaternion);
      }
    }
  }
  
  // Updating the agregation level depending of the zoom level
  let dist = Math.sqrt(
    controller.threeViewer.currentCamera.position.x ** 2 +
      controller.threeViewer.currentCamera.position.y ** 2 +
      controller.threeViewer.currentCamera.position.z ** 2
  );

  if (dist < 500 && currentZoom != 1) {
    currentZoom = 1;
    agregZoom(currentZoom);
  } else if (dist > 500 && dist < 750 && currentZoom != 2) {
    currentZoom = 2;
    agregZoom(currentZoom);
  } else if (dist > 750 && dist < 1200 && currentZoom != 3) {
    currentZoom = 3;
    agregZoom(currentZoom);
  } else if (dist > 1200 && currentZoom != 4) {
    currentZoom = 4;
    agregZoom(currentZoom);
  }

  // The render() function is called at eatch frame
  requestAnimationFrame(render);
}

render();
