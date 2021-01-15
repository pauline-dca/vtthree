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
import helvetiker from "../../node_modules/three/examples/fonts/helvetiker_regular.typeface.json"

//data can be imported like this or read from the data folder
import covidData from "../../data/covid_data.json";
import * as geotiff from "geotiff";

const width = window.innerWidth; // this makes the 3D canvas full screen
const height = window.innerHeight; // this makes the 3D canvas full screen
const zSize = 300; //Represent the size on the 3D modelisation. The value 300 is arbitrary
const nbrDaysMax = 100; //Number of days from the first entry that can be displayed
/*
var hexRadius = 50; //Resolution of the hexgrid 
var nbrDaysAgregation = 7; //Temporal resolution
var coeffRadius = 2; //Coefficient to adapt the size of 3D object
*/
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


var temposcale = new TempoScale(0,nbrDaysMax);
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

  //Adding the covid cases with one cube by entry
  const covidCaseGroup = new THREE.Group();
  covidCaseGroup.name = "covidCaseGroup";
  addObjects(covidCaseGroup);

  //Adding the covid cases aggregated on a hexgrid
  var hexRadius = 25; //Resolution of the hexgrid 
  var nbrDaysAgregation = 1; //Temporal resolution
  var coeffRadius = 4; //Coefficient to adapt the size of 3D object
  const hexCovidCaseGroup2 = new THREE.Group();
  hexCovidCaseGroup2.name = "hexCovidCaseGroup2";
  hexAgregation(hexCovidCaseGroup2, hexRadius, nbrDaysAgregation,coeffRadius )

  const hexCovidCaseGroup3 = new THREE.Group();
  hexCovidCaseGroup3.name = "hexCovidCaseGroup3";
  hexAgregation(hexCovidCaseGroup3, 35, 4, coeffRadius)
  
  const hexCovidCaseGroup4 = new THREE.Group();
  hexCovidCaseGroup4.name = "hexCovidCaseGroup4";
  hexAgregation(hexCovidCaseGroup4, 50, 7, coeffRadius)

  //Adding the temporal legend
  const scaleGroup = new THREE.Group();
  scaleGroup.name = "scaleGroup";
  addTempoScaleLabel(scaleGroup);
  
}

// Functions to switch between date and vertical coordinates
function dateToAlti(date){
  let firstDate = Number(new Date(covidData[0]["date"]))/86400000; //day of the firt entry
  let days = Number(new Date(date))/86400000 - firstDate; //days from the fisrt entry
  return (days-temposcale.min)*(zSize/(temposcale.max-temposcale.min)) //spreading the coordinates
}

function altiToDate(z){
  let days = z*((temposcale.max-temposcale.min)/zSize)+temposcale.min; //days from the fisrt entry
  let firstDate = Number(new Date(covidData[0]["date"]))/86400000; //day of the firt entry
  return (new Date((days+firstDate)*86400000)).toISOString().slice(0, 10) 
}

// Restruturing the data with a row by date
function dataByDate() {
  var covidDataDate = new Array();
for (let elt in covidData){
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
  data['x'] =worldCoords[0];
  data['y'] =worldCoords[1];
  data["datapoint"] =1;
  data["name"] = covidData[elt]["date"];
  if (typeof covidDataDate[covidData[elt]["date"]] == "undefined") {
    covidDataDate[covidData[elt]["date"]] = [data];
}
  else{
    covidDataDate[covidData[elt]["date"]].push(data);
  }
}
return covidDataDate
}


/*_________________________ Function creating and filling the groups storing 3D objects _______________________*/

// Adding the covid cases with one cube by entry
function addObjects(covidCaseGroup) {
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
      if(cube.position.z>=0 && cube.position.z<=zSize){
        cube.visible = true;
      }
      else{
        cube.visible = false;
      }
      covidCaseGroup.add(cube); // all the cases are added to the group
    
  }
  controller.threeViewer.scene.add(covidCaseGroup); //the group is added to the scene
}



// Adding the temporal legend
function addTempoScaleLabel(scaleGroup){
  
  const loader = new THREE.FontLoader();
  var font = loader.parse(helvetiker);
    
  var nbrLegends = 6; // Nbr of texts displayed to form the temporal legend
  for (let i=0; i<=nbrLegends; i++){
    let date = altiToDate(i*zSize/nbrLegends);
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
  axe.position.z = i*zSize/nbrLegends+3;
  scaleGroup.add(axe); //all objects have to be added to the threejs scene
    
  }
  controller.threeViewer.scene.add(scaleGroup); //the group is added to the scene

}


/*_____________________ Code adapted from https://www.datavis.fr/index.php?page=map-hexgrid tutorial_________________*/
/*_____________________ Aggregation of covid cases on a grid of hexagons ____________________________________________*/



function hexAgregation(hexCovidCaseGroup, hexRadius = 50, nbrDaysAgregation = 7, coeffRadius = 2){

  var hexbin,
  colorScale,
  maxDatapoints;

  function getPointGrid(radius) {
      var hexDistance = radius * 1.5;
      var cols = width / hexDistance;

      var rows = Math.floor(height / hexDistance);

      return d3.range(rows * cols).map(function(i) {
          return {
              x: i % cols * hexDistance - hexDistance*cols/2,
              y: Math.floor(i / cols) * hexDistance - hexDistance*rows/2,
              datapoint: 0
          };
      });
  }

  /*
  var pointGrid = getPointGrid(hexRadius)

  //visualisation of the hexagrid
  for (let elm in pointGrid){
    var geometry = new THREE.PlaneGeometry(5,5);
    var material = new THREE.MeshStandardMaterial({ color: 0x5FD527 });
    var cube = new THREE.Mesh(geometry, material); 
    cube.position.x = pointGrid[elm]["x"];
    cube.position.y = pointGrid[elm]["y"];
    cube.position.z = 0;
    controller.threeViewer.scene.add(cube);
  }
  */



  //var dataTest = dataByDate()["2020-03-19"];
  //console.log(dataTest);

  //var mergedPoints = pointGrid.concat(dataTest);

  //creation of the hexagons
  function getHexPoints(mergedPoints) {
    hexbin = d3hexbin.hexbin()
        .radius(hexRadius)
        .x(function(d) { return d.x; })
        .y(function(d) { return d.y; });

    var hexPoints = hexbin(mergedPoints);
    return hexPoints;
  }

  //var hexPoint = getHexPoints(mergedPoints)
  //console.log(hexPoint)

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
            cities.push({"name" : elt.name});
        });

        el.datapoints = datapoints;
        el.cities = cities;

        maxDatapoints = Math.max(maxDatapoints, datapoints);
    });

    colorScale = d3.scaleSequential(d3.interpolateViridis)
        .domain([maxDatapoints, 1]);

    return data;
  }

  //var rollupHexPoint = rollupHexPoints(hexPoint)
  //console.log(rollupHexPoint)

  //visualisation of the rollupHexPoint
  /*
  for (let elm in rollupHexPoint){
    if (rollupHexPoint[elm]["length"] != 0){
      var geometry = new THREE.SphereGeometry(rollupHexPoint[elm]["length"]);
      var material = new THREE.MeshStandardMaterial({ color: 0x5FD527 });
      var sphere = new THREE.Mesh(geometry, material); 
      sphere.position.x = rollupHexPoint[elm]["x"];
      sphere.position.y = rollupHexPoint[elm]["y"];
      sphere.position.z = 50;
      controller.threeViewer.scene.add(sphere);
    }
  }
  */



  // Adding the covid cases aggregated on a hexgrid
  function addHexCovidCases(hexCovidCaseGroup) {
    var databyDate = dataByDate();
    var pointGrid = getPointGrid(hexRadius)
    var hexData = hexDatabyDate(databyDate, pointGrid);
    for(let hexDataDate in hexData){
      for (let hexCovidCase in hexData[hexDataDate]){
        let firstDate = Number(new Date(covidData[0]["date"]))/86400000; //day of the firt entry
        let actualDate = Number(new Date(hexDataDate))/86400000;
        let date = Number(new Date(actualDate-firstDate))/86400000; //number of days since the first entry
        if((date*86400000 % nbrDaysAgregation) < 0.001 && (date*86400000 % nbrDaysAgregation) > -0.001)
          var nbrCovid = temporalAggregation(hexCovidCase ,hexData, hexDataDate);
          if (nbrCovid != 0){
              //var geometry = new THREE.SphereGeometry(hexData[hexCovidCase]["length"]); //using spheres
              //var geometry = new THREE.CylinderGeometry(nbrCovid, nbrCovid,5); // Radius proportional to the number of covid entries
              var geometry = new THREE.CylinderGeometry(Math.sqrt(nbrCovid)*coeffRadius, Math.sqrt(nbrCovid)*coeffRadius,5); // Area proportional to the number of covid entries
              var material = new THREE.MeshStandardMaterial({ color: 0x5FD527 });
              var sphere = new THREE.Mesh(geometry, material); //a three js mesh needs a geometry and a material
              sphere.position.x = hexData[hexDataDate][hexCovidCase]["x"];
              sphere.position.y = hexData[hexDataDate][hexCovidCase]["y"];
              sphere.position.z = dateToAlti(hexDataDate);
              sphere.name = hexDataDate;
              sphere.rotation.x = Math.PI / 2;
              if(sphere.position.z>=0 && sphere.position.z<=zSize){
                sphere.visible = true;
              }
              else{
                sphere.visible = false;
              }
              hexCovidCaseGroup.add(sphere); // all the cases are added to the group
          }
      }

    }
    controller.threeViewer.scene.add(hexCovidCaseGroup); //the group is added to the scene
  }

  function hexDatabyDate(databyDate, pointGrid){ // Gather the data on the hexgrid sorted by dates
    var hexDataDate = new Array;
    for(let dataOneDate in databyDate){
      var mergedPoints = pointGrid.concat(databyDate[dataOneDate]);
      var hexPoint = getHexPoints(mergedPoints) //creation of the hexagons
      var hexData = rollupHexPoints(hexPoint)//Cleaning and enriching hexagons
      hexDataDate[dataOneDate] = hexData;
    }
    return hexDataDate;
    
  }

  function temporalAggregation(hexCovidCase, hexData, hexDataDate ){ //Return the number of case on a same location during some days
    /*
    let firstDate = Number(new Date(covidData[0]["date"]))/86400000; //day of the firt entry
    return (new Date((days+firstDate)*86400000)).toISOString().slice(0, 10) 
    */
    let nbrCovid = 0;
    let firstDate = Number(new Date(covidData[0]["date"]))/86400000; //day of the firt entry
    let actualDate = Number(new Date(hexDataDate))/86400000;
    let date = Number(new Date(actualDate-firstDate))/86400000; //number of days since the first entry
    for(let i = 0; i<nbrDaysAgregation; i++){ //We gather all entry in the temporal resolution
      let dateI = (new Date((actualDate+i)*86400000)).toISOString().slice(0, 10); //Date of hexDataDate + i
      if(hexData[dateI] != undefined){
        for(let hexcovidcase in hexData[dateI]){
          if(hexCovidCase==hexcovidcase){
            nbrCovid += hexData[dateI][hexCovidCase]["length"]
          }
        }
      }
    }

    return nbrCovid;
  }


  addHexCovidCases(hexCovidCaseGroup)

}


/*_____________________ Initialisation of the 3D modelisation _________________*/


init();

/*_____________________ Managing the temporal scale and rendering functon _________________*/


//Import a gui creating an interface to manage the temporal scale
const dat = require("dat.gui");
const gui = new dat.GUI();

const cubeFolder = gui.addFolder("Plage temporelle en jour depuis le 03-19")
cubeFolder.add(temposcale, 'min', 0, nbrDaysMax-1, 1)
cubeFolder.add(temposcale, 'max', 1, nbrDaysMax, 1)
cubeFolder.open()


function changeTempoScale(){
  console.log(controller.threeViewer.scene)
  // When we change the temporal zoom, we change the altitude of the covid cases
  for(var elt in controller.threeViewer.scene.children ){
    if(controller.threeViewer.scene.children[elt]["name"]=="covidCaseGroup" || controller.threeViewer.scene.children[elt]["name"].startsWith("hexCovidCaseGroup")){
      for(var groupElt in controller.threeViewer.scene.children[elt].children){ //Selecting elements in covidCaseGroup
        let cube = controller.threeViewer.scene.children[elt].children[groupElt];
        cube.position.z = dateToAlti(cube.name);
        // Setting the visibility depending of the vertical coordinates
        if(cube.position.z>=0 && cube.position.z<=zSize){
          cube.visible = true;
        }
        else{
          cube.visible = false;
        }
      }
    }
  }
  // When we change the temporal zoom, we clear scaleGroup and recreate the texts
  for(let elt in controller.threeViewer.scene.children){
    if(controller.threeViewer.scene.children[elt]["name"]=="scaleGroup"){
      controller.threeViewer.scene.children[elt].remove(...controller.threeViewer.scene.children[elt].children);
      addTempoScaleLabel(controller.threeViewer.scene.children[elt]);
    }
  }
  
    
}


gui.domElement.addEventListener("mouseup", changeTempoScale);


function agregZoom(zoomLevel){ // Updating the agregation level depending of the zoom level
  for(let elt in controller.threeViewer.scene.children){

    if(controller.threeViewer.scene.children[elt]["name"]=="covidCaseGroup"){
      if(zoomLevel==1){
        controller.threeViewer.scene.children[elt].visible = true;
      }
      else{
        controller.threeViewer.scene.children[elt].visible = false;
      }
    }

    if(controller.threeViewer.scene.children[elt]["name"]=="hexCovidCaseGroup2"){
      if(zoomLevel==2){
        controller.threeViewer.scene.children[elt].visible = true;
      }
      else{
        controller.threeViewer.scene.children[elt].visible = false;
      }
    }

    if(controller.threeViewer.scene.children[elt]["name"]=="hexCovidCaseGroup3"){
      if(zoomLevel==3){
        controller.threeViewer.scene.children[elt].visible = true;
      }
      else{
        controller.threeViewer.scene.children[elt].visible = false;
      }
    }

    if(controller.threeViewer.scene.children[elt]["name"]=="hexCovidCaseGroup4"){
      if(zoomLevel==4){
        controller.threeViewer.scene.children[elt].visible = true;
      }
      else{
        controller.threeViewer.scene.children[elt].visible = false;
      }
    }
    
    

  }

};

//loading each group during the initialisation to avoid loading time during use
agregZoom(1);
agregZoom(2);
agregZoom(3);

var currentZoom = 3; //Zoom of the initial position of the camera
agregZoom(3);
function render(){
  controller.threeViewer.animate();
  // Updatingd the rotation of texts to make them facing the user
  for(let elt in controller.threeViewer.scene.children){
    if(controller.threeViewer.scene.children[elt]["name"]=="scaleGroup"){
      for(var groupElt in controller.threeViewer.scene.children[elt].children){
        controller.threeViewer.scene.children[elt].children[groupElt].quaternion.copy(controller.threeViewer.currentCamera.quaternion);
      }
    }
  }

  // Updating the agregation level depending of the zoom level
  let dist = Math.sqrt(controller.threeViewer.currentCamera.position.x**2 + controller.threeViewer.currentCamera.position.y**2 + controller.threeViewer.currentCamera.position.z**2);
  
  if(dist<500 && currentZoom != 1){
    currentZoom = 1;
    agregZoom(currentZoom);
  }
  else if(dist>500 && dist<750 && currentZoom != 2){
    currentZoom = 2;
    agregZoom(currentZoom);
  }
  else if(dist>750 && dist<1200 && currentZoom != 3){
    currentZoom = 3;
    agregZoom(currentZoom);
  }
  else if(dist>1200 && currentZoom != 4){
    currentZoom = 4;
    agregZoom(currentZoom);
  }
  
  // The render() function is called at eatch frame
  requestAnimationFrame(render);
};

render();

